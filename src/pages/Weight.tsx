import { useMemo, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { Plus } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useInsights } from "@/data/insights";
import { useDeleteWeight } from "@/data/api";
import { daysBetween, fmt, shiftKey, todayKey } from "@/lib/dates";
import { fmtKg } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { LineChart, useMounted } from "@/ui/Charts";
import { Segmented } from "@/ui/Segmented";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { LogWeightSheet } from "@/sheets/LogWeight";
import "./stats.css";

type Range = 30 | 90 | 180 | 0;

export function WeightScreen() {
  const nav = useNav();
  const ins = useInsights();
  const mounted = useMounted(320);
  const [range, setRange] = useState<Range>(30);

  const points = useMemo(() => {
    const from = range ? shiftKey(todayKey(), -range + 1) : "0000";
    return ins.trend.filter((p) => p.day >= from).map((p) => ({ day: p.day, value: p.trend, dot: p.scale }));
  }, [ins.trend, range]);

  const first = points[0];
  const last = points[points.length - 1];
  const change = first && last ? last.value - first.value : null;
  const weeks = first && last ? Math.max(daysBetween(first.day, last.day) / 7, 1) : 1;

  return (
    <Screen
      title="Вес"
      right={
        <Tap className="icon-btn" onClick={() => nav.sheet(<LogWeightSheet />)} aria-label="Записать">
          <Plus size={20} />
        </Tap>
      }
    >
      <div className="card" style={{ background: "radial-gradient(120% 100% at 0% 0%, rgba(179,136,255,.16), transparent 60%), var(--card)" }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Тренд веса
        </div>
        <div className="row" style={{ alignItems: "baseline", gap: 6, marginTop: 4 }}>
          <span className="big-stat num">{ins.current != null ? <NumberTicker value={ins.current} digits={1} /> : "—"}</span>
          <span className="muted" style={{ fontSize: 18 }}>
            кг
          </span>
        </div>
        {ins.lastScale && (
          <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>
            Весы: {fmtKg(ins.lastScale.weight_kg)} кг · {fmt(ins.lastScale.day, "d MMMM")}
          </div>
        )}
        <div style={{ marginTop: 22 }}>
          {mounted && points.length > 1 ? (
            <LineChart
              key={range}
              points={points}
              height={210}
              goal={ins.goal?.kind !== "maintain" ? ins.goal?.target_weight : null}
              renderTip={(p) => (
                <>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {fmt(p.day, "d MMMM")}
                  </div>
                  <div className="num" style={{ fontWeight: 700, fontSize: 16 }}>
                    {fmtKg(p.value)} кг
                  </div>
                  {p.dot != null && (
                    <div className="faint num" style={{ fontSize: 12 }}>
                      весы {fmtKg(p.dot)}
                    </div>
                  )}
                </>
              )}
            />
          ) : (
            <div className="empty" style={{ height: 210, display: "grid", placeItems: "center" }}>
              {points.length <= 1 ? "Запиши вес ещё пару раз — появится график" : ""}
            </div>
          )}
        </div>
        <div style={{ marginTop: 16 }}>
          <Segmented
            size="sm"
            value={range}
            onChange={setRange}
            options={[
              { value: 30, label: "Месяц" },
              { value: 90, label: "3 мес" },
              { value: 180, label: "Полгода" },
              { value: 0, label: "Всё" },
            ]}
          />
        </div>
      </div>

      <div className="kv" style={{ marginTop: 12 }}>
        <div>
          <div className="k">Изменение</div>
          <div className="v num">{change != null ? `${change > 0 ? "+" : change < 0 ? "−" : ""}${fmtKg(Math.abs(change))}` : "—"}</div>
        </div>
        <div>
          <div className="k">В неделю</div>
          <div className="v num">{change != null ? `${change > 0 ? "+" : change < 0 ? "−" : ""}${fmtKg(Math.abs(change / weeks))}` : "—"}</div>
        </div>
        <div>
          <div className="k">Записей</div>
          <div className="v num">{ins.weights?.length ?? 0}</div>
        </div>
      </div>

      <p className="explain" style={{ margin: "16px 4px 0" }}>
        <b>Тренд</b> — сглаженный вес: он убирает скачки из‑за воды, соли и еды, и показывает, как ты меняешься на самом деле. Точки — показания весов.
      </p>

      <div className="section-title">История</div>
      <div className="list">
        <AnimatePresence initial={false}>
          {[...(ins.weights ?? [])].reverse().map((w) => (
            <WeightRow key={w.day} day={w.day} kg={w.weight_kg} bf={w.body_fat} />
          ))}
        </AnimatePresence>
        {!ins.weights?.length && <div className="empty">Пока нет записей</div>}
      </div>
    </Screen>
  );
}

function WeightRow({ day, kg, bf }: { day: string; kg: number; bf: number | null }) {
  const nav = useNav();
  const del = useDeleteWeight();
  const toast = useToast();
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -110 || info.velocity.x < -700) {
      haptic.rigid();
      del.mutate(day);
      toast("Запись удалена");
    }
  };
  return (
    <motion.div layout exit={{ opacity: 0, height: 0 }} className="entry-wrap">
      <div className="entry-delete">Удалить</div>
      <motion.button
        className="list-item"
        style={{ background: "var(--card)" }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0.05 }}
        onDragEnd={onDragEnd}
        onClick={() => nav.sheet(<LogWeightSheet day={day} />)}
      >
        <span style={{ flex: 1 }}>
          <div className="li-title">{fmt(day, "d MMMM, EEEEEE")}</div>
          {bf != null && <div className="li-sub">жир {bf}%</div>}
        </span>
        <span className="num" style={{ fontWeight: 700 }}>
          {fmtKg(kg)} кг
        </span>
      </motion.button>
    </motion.div>
  );
}
