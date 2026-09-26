import { useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, ChevronRight as Chevron, Flame, Plus } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useDay } from "@/state/day";
import { useInsights } from "@/data/insights";
import { fmt, shiftKey, todayKey, weekStart, WEEKDAYS_SHORT } from "@/lib/dates";
import { fmtKg, fmtNum, targetFor } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { Bars, Heatmap, Sparkline } from "@/ui/Charts";
import { NumberTicker } from "@/ui/NumberTicker";
import { Segmented } from "@/ui/Segmented";
import { Tap } from "@/ui/Tap";
import { Bar } from "@/ui/Rings";
import { WeightScreen } from "./Weight";
import { GoalScreen } from "./Goal";
import { ExpenditureScreen } from "./Expenditure";
import { LogWeightSheet } from "@/sheets/LogWeight";
import "./stats.css";

type Metric = "kcal" | "protein" | "fat" | "carbs";
const METRICS: { value: Metric; label: string; color: string; unit: string; target: "calories" | "protein" | "fat" | "carbs" }[] = [
  { value: "kcal", label: "Ккал", color: "var(--kcal)", unit: "ккал", target: "calories" },
  { value: "protein", label: "Белки", color: "var(--protein)", unit: "г", target: "protein" },
  { value: "fat", label: "Жиры", color: "var(--fat)", unit: "г", target: "fat" },
  { value: "carbs", label: "Углев.", color: "var(--carbs)", unit: "г", target: "carbs" },
];

export function StatsPage() {
  const nav = useNav();
  const ins = useInsights();

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Прогресс</div>
        <Tap className="icon-btn" onClick={() => nav.sheet(<LogWeightSheet />)} aria-label="Записать вес">
          <Plus size={20} />
        </Tap>
      </div>

      <WeekCard />

      <div className="grid-2" style={{ marginTop: 12 }}>
        <Tap className="card stat-card" scale={0.97} onClick={() => nav.push(<WeightScreen />)}>
          <div className="card-title">Вес</div>
          <div className="card-sub">тренд, 30 дней</div>
          <div style={{ margin: "14px 0 10px" }}>
            <Sparkline values={ins.trend.slice(-30).map((p) => p.trend)} color="var(--weight)" />
          </div>
          <div className="stat-foot">
            <span className="stat-value num">{ins.current != null ? <NumberTicker value={ins.current} digits={1} /> : "—"}</span>
            <span className="muted" style={{ marginLeft: 4 }}>кг</span>
            <Chevron size={18} className="faint" style={{ marginLeft: "auto" }} />
          </div>
          {ins.change7 != null && (
            <div className="stat-delta" style={{ color: ins.change7 <= 0 ? "var(--good)" : "var(--protein)" }}>
              {ins.change7 > 0 ? "▲" : "▼"} {fmtKg(Math.abs(ins.change7))} кг за неделю
            </div>
          )}
        </Tap>

        <Tap className="card stat-card" scale={0.97} onClick={() => nav.push(<ExpenditureScreen />)}>
          <div className="card-title">Расход</div>
          <div className="card-sub">ккал в день</div>
          <div style={{ margin: "14px 0 10px" }}>
            <Sparkline values={ins.tdeeSeries} color="var(--protein)" />
          </div>
          <div className="stat-foot">
            <span className="stat-value num">
              <NumberTicker value={ins.tdee.value} />
            </span>
            <Chevron size={18} className="faint" style={{ marginLeft: "auto" }} />
          </div>
          <div className="stat-delta muted">
            {ins.tdee.confidence > 0 ? `точность ${Math.round(ins.tdee.confidence * 100)}%` : "по формуле, уточняется"}
          </div>
        </Tap>
      </div>

      <GoalCard onOpen={() => nav.push(<GoalScreen />)} />

      <div className="section-title">Привычки</div>
      <div className="grid-2">
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="card-title">Питание</div>
            {ins.streak > 0 && (
              <span className="streak">
                <Flame size={14} /> {ins.streak}
              </span>
            )}
          </div>
          <div className="card-sub" style={{ marginBottom: 12 }}>
            30 дней
          </div>
          <Heatmap days={ins.logged30} color="var(--kcal)" />
          <div className="stat-foot" style={{ marginTop: 12 }}>
            <span className="stat-value num">{ins.logged30.slice(-7).filter(Boolean).length}/7</span>
            <span className="muted" style={{ fontSize: 13 }}>
              &nbsp;за неделю
            </span>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Взвешивания</div>
          <div className="card-sub" style={{ marginBottom: 12 }}>
            30 дней
          </div>
          <Heatmap days={ins.weighed30} color="var(--weight)" />
          <div className="stat-foot" style={{ marginTop: 12 }}>
            <span className="stat-value num">{ins.weighed30.slice(-7).filter(Boolean).length}/7</span>
            <span className="muted" style={{ fontSize: 13 }}>
              &nbsp;за неделю
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekCard() {
  const ins = useInsights();
  const { setDay } = useDay();
  const nav = useNav();
  const [metric, setMetric] = useState<Metric>("kcal");
  const [start, setStart] = useState(weekStart(todayKey()));
  const today = todayKey();
  const m = METRICS.find((x) => x.value === metric)!;
  const byDay = new Map((ins.totals ?? []).map((t) => [t.day, t]));
  const days = Array.from({ length: 7 }, (_, i) => shiftKey(start, i));
  const items = days.map((d, i) => {
    const t = byDay.get(d);
    const tg = targetFor(ins.targets, d);
    return {
      key: d,
      label: WEEKDAYS_SHORT[i],
      value: t ? t[metric] : 0,
      target: tg ? tg[m.target] : undefined,
      active: d === today,
      dim: d > today,
    };
  });
  const past = items.filter((x) => x.value > 0 && x.key < today);
  // Сегодняшний день ещё не закончился — не портим им среднее, если есть другие дни
  const logged = past.length ? past : items.filter((x) => x.value > 0 && x.key === today);
  const avg = logged.length ? logged.reduce((s, x) => s + x.value, 0) / logged.length : 0;
  const avgTarget = logged.length ? logged.reduce((s, x) => s + (x.target ?? 0), 0) / logged.length : (targetFor(ins.targets, today)?.[m.target] ?? 0);
  const isCurrent = start === weekStart(today);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div className="card-title">{isCurrent ? "Эта неделя" : `${fmt(start, "d MMM")} – ${fmt(shiftKey(start, 6), "d MMM")}`}</div>
          <div className="card-sub">
            в среднем{" "}
            <b className="num" style={{ color: "var(--text)" }}>
              {fmtNum(avg)}
            </b>{" "}
            из {fmtNum(avgTarget)} {m.unit}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Tap
            className="icon-btn"
            style={{ width: 34, height: 34 }}
            onClick={() => {
              haptic.select();
              setStart(shiftKey(start, -7));
            }}
          >
            <ChevronLeft size={18} />
          </Tap>
          <Tap
            className="icon-btn"
            style={{ width: 34, height: 34, opacity: isCurrent ? 0.3 : 1 }}
            disabled={isCurrent}
            onClick={() => {
              haptic.select();
              setStart(shiftKey(start, 7));
            }}
          >
            <ChevronRight size={18} />
          </Tap>
        </div>
      </div>
      <motion.div key={start + metric} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>
        <Bars
          items={items}
          color={m.color}
          height={132}
          onSelect={(d) => {
            haptic.tap();
            setDay(d);
            nav.setTab("diary");
          }}
        />
      </motion.div>
      <div style={{ marginTop: 16 }}>
        <Segmented size="sm" value={metric} onChange={setMetric} options={METRICS.map((x) => ({ value: x.value, label: x.label }))} />
      </div>
    </div>
  );
}

function GoalCard({ onOpen }: { onOpen: () => void }) {
  const ins = useInsights();
  const g = ins.goal;
  if (!g) return null;
  const kindTitle = g.kind === "lose" ? "Снижение веса" : g.kind === "gain" ? "Набор массы" : "Поддержание веса";
  const left = g.target_weight != null && ins.current != null ? Math.abs(g.target_weight - ins.current) : null;
  const etaDate = ins.eta ? fmt(shiftKey(todayKey(), ins.eta), "d MMMM yyyy") : null;
  return (
    <Tap className="card goal-card" scale={0.98} onClick={onOpen} style={{ marginTop: 12, display: "block", width: "100%", textAlign: "left" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="card-title">{kindTitle}</div>
          <div className="card-sub">с {fmt(g.start_date, "d MMMM")}</div>
        </div>
        <Chevron size={18} className="faint" />
      </div>
      {g.kind !== "maintain" && g.target_weight != null ? (
        <>
          <div className="goal-nums">
            <div>
              <div className="num goal-num">{fmtKg(g.start_weight)}</div>
              <div className="faint">старт</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="num goal-num" style={{ color: "var(--weight)" }}>
                {ins.current != null ? fmtKg(ins.current) : "—"}
              </div>
              <div className="faint">сейчас</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="num goal-num">{fmtKg(g.target_weight)}</div>
              <div className="faint">цель</div>
            </div>
          </div>
          <Bar value={(ins.progress ?? 0) * 100} max={100} color="linear-gradient(90deg, var(--kcal), var(--weight))" height={10} />
          <div className="row muted" style={{ fontSize: 13, marginTop: 10, justifyContent: "space-between" }}>
            <span>
              {Math.round((ins.progress ?? 0) * 100)}% · осталось {left != null ? fmtKg(left) : "—"} кг
            </span>
            {etaDate && <span>≈ {etaDate}</span>}
          </div>
        </>
      ) : (
        <div className="muted" style={{ fontSize: 14, marginTop: 10 }}>
          Держим вес около {ins.current != null ? fmtKg(ins.current) : "—"} кг
        </div>
      )}
    </Tap>
  );
}
