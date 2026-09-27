import { useState } from "react";
import { Check, Trash } from "lucide-react";
import { useLayer } from "@/nav/Nav";
import { useDeleteWeight, useSaveWeight, useWeights } from "@/data/api";
import { dayTitle, shiftKey, todayKey } from "@/lib/dates";
import { fmtKg } from "@/lib/nutrition";
import { parseNum } from "@/lib/hooks";
import { haptic } from "@/lib/telegram";
import { SheetHeader } from "@/ui/Screen";
import { Ruler } from "@/ui/Ruler";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "./sheets.css";

export function LogWeightSheet({ day: day0 }: { day?: string }) {
  const layer = useLayer();
  const toast = useToast();
  const weights = useWeights();
  const save = useSaveWeight();
  const del = useDeleteWeight();
  const [day, setDay] = useState(day0 ?? todayKey());
  const existing = weights.data?.find((w) => w.day === day);
  const last = weights.data?.length ? weights.data[weights.data.length - 1] : undefined;
  const [kg, setKg] = useState(existing?.weight_kg ?? last?.weight_kg ?? 75);
  const [bf, setBf] = useState(existing?.body_fat ? String(existing.body_fat) : "");

  const pickDay = (d: string) => {
    haptic.select();
    setDay(d);
    const w = weights.data?.find((x) => x.day === d);
    if (w) {
      setKg(w.weight_kg);
      setBf(w.body_fat ? String(w.body_fat) : "");
    }
  };

  const diff = last && last.day !== day ? kg - last.weight_kg : null;

  const submit = async () => {
    try {
      await save.mutateAsync({ day, weight_kg: kg, body_fat: bf ? parseNum(bf) : null });
      haptic.success();
      toast(`Вес ${fmtKg(kg)} кг записан`, <Check size={18} color="var(--good)" />);
      layer.close();
    } catch {
      /* ошибку покажет общий обработчик; окно остаётся — можно повторить */
    }
  };

  const days = [todayKey(), shiftKey(todayKey(), -1), shiftKey(todayKey(), -2)];

  return (
    <>
      <SheetHeader title="Вес" />
      <div className="sheet-body">
        <div className="chips-row" style={{ justifyContent: "center", padding: "0 0 8px" }}>
          {days.map((d) => (
            <Tap key={d} className={`chip ${day === d ? "on" : ""}`} onClick={() => pickDay(d)}>
              {dayTitle(d)}
            </Tap>
          ))}
        </div>
        <div className="big-value">
          <NumberTicker value={kg} digits={1} duration={0.25} />
          <small>кг</small>
        </div>
        <div style={{ textAlign: "center", fontSize: 14, minHeight: 20 }} className="muted">
          {diff != null && Math.abs(diff) >= 0.05
            ? `${diff > 0 ? "+" : "−"}${fmtKg(Math.abs(diff))} кг с прошлого взвешивания`
            : existing
              ? "Запись за этот день уже есть — можно исправить"
              : "Взвешивайся утром, после туалета, до еды"}
        </div>
        <div style={{ margin: "18px -16px 0" }}>
          <Ruler min={30} max={250} step={0.1} value={kg} onChange={setKg} majorEvery={10} color="var(--weight)" />
        </div>
        <div className="field" style={{ marginTop: 18 }}>
          <label>Процент жира (необязательно)</label>
          <input
            className="input num"
            inputMode="decimal"
            value={bf}
            placeholder="Например, 22"
            onChange={(e) => setBf(e.target.value.replace(/[^\d.,]/g, ""))}
          />
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
              toast("Запись удалена");
              layer.close();
            }}
          >
            <Trash size={20} />
          </Tap>
        )}
        <Tap className="btn btn-block" style={{ background: "var(--weight)", color: "#1a0f2e" }} onClick={submit}>
          Сохранить
        </Tap>
      </div>
    </>
  );
}
