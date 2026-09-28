import { useMemo, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { Plus } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useInsights } from "@/data/insights";
import { useDeleteWeight } from "@/data/api";
import { fmt, shiftKey, todayKey } from "@/lib/dates";
import { TREND_MIN_WEIGHINS, fmtKg, scaleChange } from "@/lib/nutrition";
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

  // Пока взвешиваний мало, линия идёт по самим взвешиваниям; потом — тренд с точками весов
  const points = useMemo(() => {
    const from = range ? shiftKey(todayKey(), -range + 1) : "0000";
    const inRange = ins.trend.filter((p) => p.day >= from);
    return ins.trendShown
      ? inRange.map((p) => ({ day: p.day, value: p.trend, dot: p.scale }))
      : inRange.filter((p) => p.scale != null).map((p) => ({ day: p.day, value: p.scale!, dot: p.scale }));
  }, [ins.trend, ins.trendShown, range]);

  // Изменение за период — по взвешиваниям (проверяется по истории ниже)
  const ch = scaleChange(ins.weights, range || null);
  const change = ch?.change ?? null;
  const weeks = ch ? Math.max(ch.days / 7, 1) : 1;
  const trendGap = ins.weight != null && ins.current != null ? Math.round((ins.current - ins.weight) * 10) / 10 : 0;

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
          {ins.lastScale ? `Вес · ${fmt(ins.lastScale.day, "d MMMM")}` : "Вес"}
        </div>
        <div className="row" style={{ alignItems: "baseline", gap: 6, marginTop: 4 }}>
          <span className="big-stat num">{ins.weight != null ? <NumberTicker value={ins.weight} digits={1} /> : "—"}</span>
          <span className="muted" style={{ fontSize: 18 }}>
            кг
          </span>
        </div>
        {ins.weight != null && (
          <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>
            {!ins.trendShown
              ? `Тренд появится после ${TREND_MIN_WEIGHINS} взвешиваний — осталось ${TREND_MIN_WEIGHINS - ins.weighIns}`
              : Math.abs(trendGap) >= 0.1 && ins.current != null
                ? `Тренд ${fmtKg(ins.current)} кг — без скачков воды${trendGap < 0 ? " · взвешивание выше обычного, часто это вода" : ""}`
                : "Совпадает с трендом — без скачков воды"}
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
                    {fmtKg(p.dot ?? p.value)} кг
                  </div>
                  {ins.trendShown && (
                    <div className="faint num" style={{ fontSize: 12 }}>
                      {p.dot != null ? `тренд ${fmtKg(p.value)}` : "тренд, без взвешивания"}
                    </div>
                  )}
                </>
              )}
            />
          ) : (
            <div className="empty" style={{ height: 210, display: "grid", placeItems: "center" }}>
              {points.length <= 1 ? "Запиши вес ещё раз — появится график" : ""}
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
          <div className="k">{range ? "За период" : "За всё время"}</div>
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
        <b>Вес</b> — твоё последнее взвешивание, изменения считаются по взвешиваниям из истории.{" "}
        {ins.trendShown ? (
          <>
            <b>Линия — тренд</b>: сглаженный вес без скачков воды и соли. По нему считаем расход калорий и корректируем норму, точки — взвешивания.
          </>
        ) : (
          <>Когда взвешиваний будет {TREND_MIN_WEIGHINS}+, появится тренд — сглаженный вес без скачков воды, по нему считаем расход калорий.</>
        )}
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
