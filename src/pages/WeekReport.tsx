import { useMemo, useState } from "react";
import { useDayTargets, useDayFlags, useTotals } from "@/data/api";
import { useInsights } from "@/data/insights";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useSummary, weeklyAdvice, type Summary } from "@/data/engage";
import { fmt, shiftKey, todayKey, weekStart } from "@/lib/dates";
import { fmtNum, isCompleteDay } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { NumberTicker } from "@/ui/NumberTicker";
import "./engage.css";
import "./week.css";
import "./recipes.css";

/**
 * Оценка недели относительно ТВОЕГО плана: тренировки — к числу дней в расписании (или 3),
 * взвешивания — к 3 в неделю. Если тренировки или взвешивания ты не ведёшь вовсе, они не
 * занижают оценку: их вес распределяется на остальное. Это ориентир, а не точная метрика.
 */
export function weekScore(s: Summary) {
  const parts: [number, number][] = [];
  parts.push([0.35, Math.min(s.days_logged / 7, 1)]);
  const complete = s.days_complete ?? s.days_logged;
  if (s.target_kcal && complete) parts.push([0.3, s.days_on_target / complete]);
  const gymGoal = s.workouts_plan && s.workouts_plan > 0 ? s.workouts_plan : 3;
  if (s.workouts || s.workouts_prev || s.workouts_plan) parts.push([0.25, Math.min(s.workouts / gymGoal, 1)]);
  if (s.weigh_ins || s.weight_prev_avg != null) parts.push([0.1, Math.min(s.weigh_ins / 3, 1)]);
  const total = parts.reduce((a, [w]) => a + w, 0);
  return Math.round((100 * parts.reduce((a, [w, v]) => a + w * v, 0)) / total);
}
const grade = (n: number) => (n >= 85 ? "Огонь 🔥" : n >= 70 ? "Отлично" : n >= 50 ? "Хорошо" : n >= 25 ? "Можно лучше" : "Начало положено");

export function WeekReportScreen({ start: start0 }: { start?: string } = {}) {
  const [start, setStart] = useState(() => (start0 ? weekStart(start0) : weekStart(todayKey())));
  const end = shiftKey(start, 6);
  const q = useSummary(start, end);
  // Питание — теми же правилами, что и дневник: норма каждого дня (с читмилами), неполные дни отдельно
  const totals = useTotals();
  const targets = useDayTargets();
  const flags = useDayFlags();
  const ins = useInsights();
  const s = useMemo(() => {
    if (!q.data) return undefined;
    const days = (totals.data ?? []).filter((t) => t.day >= start && t.day <= end && t.entries > 0);
    if (!days.length) return q.data;
    const full = days.filter((t) => isCompleteDay(Number(t.kcal), ins.typical, flags.data?.get(t.day), targets.forDay(t.day).calories, t.entries));
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, x) => a + x, 0) / xs.length) : null);
    const tgt = full.map((t) => targets.forDay(t.day));
    return {
      ...q.data,
      days_logged: days.length,
      days_complete: full.length,
      avg_kcal: avg(full.map((t) => Number(t.kcal))),
      avg_protein: avg(full.map((t) => Number(t.protein))),
      target_kcal: targets.hasTargets ? avg(tgt.map((t) => t.calories)) : null,
      target_protein: targets.hasTargets ? avg(tgt.map((t) => t.protein)) : null,
      days_on_target: full.filter((t, i) => Math.abs(Number(t.kcal) - tgt[i].calories) <= tgt[i].calories * 0.1).length,
    } as Summary;
  }, [q.data, totals.data, targets, flags.data, ins.typical, start, end]);
  const isCurrent = start === weekStart(todayKey());
  const move = (d: number) => {
    haptic.select();
    setStart((x) => shiftKey(x, d * 7));
  };

  return (
    <Screen title="Итоги недели">
      <div className="wr-nav">
        <Tap className="icon-btn" onClick={() => move(-1)} aria-label="Раньше">
          <ChevronLeft size={20} />
        </Tap>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700 }}>
            {fmt(start, "d MMM")} — {fmt(end, "d MMM")}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {isCurrent ? "эта неделя" : start === shiftKey(weekStart(todayKey()), -7) ? "прошлая неделя" : fmt(start, "yyyy")}
          </div>
        </div>
        <Tap className="icon-btn" onClick={() => move(1)} disabled={isCurrent} style={{ opacity: isCurrent ? 0.3 : 1 }} aria-label="Позже">
          <ChevronRight size={20} />
        </Tap>
      </div>

      {!s ? (
        <div className="skeleton" style={{ height: 420, borderRadius: 28, marginTop: 12 }} />
      ) : (
        <motion.div key={start} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <ScoreCard s={s} />
          <div className="wr-grid">
            <div className="wr-card">
              <div className="wr-label">🍽 Питание</div>
              <div className="wr-days">
                {Array.from({ length: 7 }, (_, i) => (
                  <i key={i} className={i < s.days_logged ? "on" : ""} />
                ))}
              </div>
              <div className="wr-big num">
                {s.days_logged}
                <small>/7 дней</small>
              </div>
              {s.avg_kcal != null && (
                <div className="wr-sub">
                  ≈ {fmtNum(s.avg_kcal)} ккал/день{s.target_kcal ? ` · цель ${fmtNum(s.target_kcal)}` : ""}
                </div>
              )}
              {s.target_kcal != null && s.days_logged > 0 && (
                <div className="wr-sub">
                  в норме ±10%: {s.days_on_target} из {s.days_complete ?? s.days_logged} полных дн.
                </div>
              )}
            </div>
            <div className="wr-card">
              <div className="wr-label">🥩 Белок</div>
              <div className="wr-big num" style={{ color: "var(--protein)" }}>
                {s.avg_protein ?? "—"}
                <small> г/день</small>
              </div>
              {s.target_protein ? (
                <>
                  <div className="wr-bar">
                    <i style={{ width: `${Math.min(100, ((s.avg_protein ?? 0) / s.target_protein) * 100)}%`, background: "var(--protein)" }} />
                  </div>
                  <div className="wr-sub">цель {s.target_protein} г</div>
                </>
              ) : null}
            </div>
            <div className="wr-card">
              <div className="wr-label">⚖️ Вес</div>
              <div className="wr-big num" style={{ color: "var(--weight)" }}>
                {s.weight_avg != null ? fmtNum(s.weight_avg, 1) : "—"}
                <small> кг</small>
              </div>
              <div className="wr-sub">
                {s.weight_avg != null && s.weight_prev_avg != null
                  ? (() => {
                      const d = s.weight_avg - s.weight_prev_avg;
                      return Math.abs(d) < 0.05 ? "без изменений" : `${d > 0 ? "+" : "−"}${fmtNum(Math.abs(d), 1)} кг к прошлой`;
                    })()
                  : `${s.weigh_ins} взвеш.`}
              </div>
            </div>
            <div className="wr-card">
              <div className="wr-label">💪 Тренировки</div>
              <div className="wr-big num" style={{ color: "var(--good)" }}>
                {s.workouts}
                {s.workouts_prev > 0 && <small> (было {s.workouts_prev})</small>}
              </div>
              <div className="wr-sub">
                {s.minutes} мин{s.volume ? ` · ${fmtNum(s.volume / 1000, 1)} т` : ""}
              </div>
              {s.prs > 0 && <div className="wr-sub">🏆 рекордов: {s.prs}</div>}
              {s.burned > 0 && <div className="wr-sub">🔥 ≈ {fmtNum(s.burned)} ккал</div>}
            </div>
          </div>
          {s.streak >= 2 && (
            <div className="wr-streak">
              <span>🔥</span>
              <div>
                <b>Серия {s.streak} дн.</b>
                <div className="muted" style={{ fontSize: 13 }}>
                  Столько дней подряд ты ведёшь дневник
                </div>
              </div>
            </div>
          )}
          <div className="rc-tip" style={{ marginTop: 12 }}>
            <span>💡</span>
            <div>{weeklyAdvice(s)}</div>
          </div>
          <div className="faint" style={{ fontSize: 12, textAlign: "center", marginTop: 14 }}>
            Каждое воскресенье в 19:00 бот присылает эти итоги в Telegram
          </div>
        </motion.div>
      )}
    </Screen>
  );
}

function ScoreCard({ s }: { s: Summary }) {
  const score = weekScore(s);
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="wr-score">
      <svg viewBox="0 0 110 110" width={110} height={110}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--card-3)" strokeWidth="10" />
        <motion.circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke="url(#wrg)"
          strokeWidth="10"
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
          initial={{ strokeDasharray: `0 ${c}` }}
          animate={{ strokeDasharray: `${(score / 100) * c} ${c}` }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
        <defs>
          <linearGradient id="wrg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffc247" />
            <stop offset="1" stopColor="#ff5e7e" />
          </linearGradient>
        </defs>
      </svg>
      <div className="wr-score-num num">
        <NumberTicker value={score} />
      </div>
      <div>
        <div className="muted" style={{ fontSize: 13 }}>
          Оценка недели
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{grade(score)}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          дневник, попадание в цель, тренировки и взвешивания
        </div>
      </div>
    </div>
  );
}
