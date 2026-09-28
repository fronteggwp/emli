import { useState } from "react";
import { Check, Trash } from "lucide-react";
import { useLayer } from "@/nav/Nav";
import { useDeleteWaist, useSaveWaist, useWaists } from "@/data/api";
import { dayTitle, shiftKey, todayKey } from "@/lib/dates";
import { fmtNum } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { SheetHeader } from "@/ui/Screen";
import { Ruler } from "@/ui/Ruler";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "./sheets.css";

const cm = (n: number) => fmtNum(n, n % 1 ? 1 : 0);

/** Замер талии — как вес: день, линейка в сантиметрах, разница с прошлым замером */
export function LogWaistSheet({ day: day0, initial }: { day?: string; initial?: number }) {
  const layer = useLayer();
  const toast = useToast();
  const waists = useWaists();
  const save = useSaveWaist();
  const del = useDeleteWaist();
  const [day, setDay] = useState(day0 ?? todayKey());
  const existing = waists.data?.find((w) => w.day === day);
  const last = waists.data?.length ? waists.data[waists.data.length - 1] : undefined;
  const [value, setValue] = useState(existing?.waist_cm ?? last?.waist_cm ?? initial ?? 85);

  const pickDay = (d: string) => {
    haptic.select();
    setDay(d);
    const w = waists.data?.find((x) => x.day === d);
    if (w) setValue(w.waist_cm);
  };

  const prev = [...(waists.data ?? [])].reverse().find((w) => w.day < day);
  const diff = prev ? Math.round((value - prev.waist_cm) * 10) / 10 : null;

  const submit = async () => {
    try {
      await save.mutateAsync({ day, waist_cm: Math.round(value * 10) / 10 });
      haptic.success();
      toast(`Талия ${cm(value)} см записана`, <Check size={18} color="var(--good)" />);
      layer.close();
    } catch {
      /* ошибку покажет общий обработчик; окно остаётся — можно повторить */
    }
  };

  const days = [todayKey(), shiftKey(todayKey(), -1), shiftKey(todayKey(), -2)];

  return (
    <>
      <SheetHeader title="Талия" />
      <div className="sheet-body">
        <div className="chips-row" style={{ justifyContent: "center", padding: "0 0 8px" }}>
          {days.map((d) => (
            <Tap key={d} className={`chip ${day === d ? "on" : ""}`} onClick={() => pickDay(d)}>
              {dayTitle(d)}
            </Tap>
          ))}
        </div>
        <div className="big-value">
          <NumberTicker value={value} digits={1} duration={0.25} />
          <small>см</small>
        </div>
        <div style={{ textAlign: "center", fontSize: 14, minHeight: 20 }} className="muted">
          {diff != null && Math.abs(diff) >= 0.1
            ? `${diff > 0 ? "+" : "−"}${cm(Math.abs(diff))} см с прошлого замера`
            : existing
              ? "Замер за этот день уже есть — можно исправить"
              : "Мерь утром, до еды, на уровне пупка"}
        </div>
        <div style={{ margin: "18px -16px 0" }}>
          <Ruler min={50} max={160} step={0.5} value={value} onChange={setValue} majorEvery={10} color="var(--waist)" />
        </div>
        <div className="waist-how">
          <b>Как мерить, чтобы цифры были честными</b>
          <span>📏 Лента горизонтально, на уровне пупка</span>
          <span>🌅 Утром натощак, в одно и то же время</span>
          <span>😮‍💨 На спокойном выдохе, живот не втягивать</span>
          <span>🤏 Лента прилегает, но не врезается в кожу</span>
        </div>
      </div>
      <div className="sheet-foot row">
        {existing && (
          <Tap
            className="icon-btn btn-danger"
            style={{ width: 54, height: 54 }}
            onClick={() => {
              haptic.rigid();
              del.mutate(day);
              toast("Замер удалён");
              layer.close();
            }}
            aria-label="Удалить замер"
          >
            <Trash size={20} />
          </Tap>
        )}
        <Tap className="btn btn-block" style={{ background: "var(--waist)", color: "#062633" }} onClick={submit}>
          Сохранить
        </Tap>
      </div>
    </>
  );
}
