// Прогрессия весов по схеме программы.
//  • Линейная (Starting Strength, StrongLifts 5×5): сделал все повторы — +2,5 кг (жимы) / +5 кг (присед, становая);
//    3 неудачи подряд на одном весе — разгрузка −10%.
//  • 5/3/1 (Вендлер): тренировочный максимум = 90% расчётного максимума; волна по неделям 5/3/1 + разгрузка.
//  • GZCLP: T1 5×3 → 6×2 → 10×1 при неудачах, T2 3×10 → 3×8 → 3×6, T3 — добавь вес при 25+ в последнем подходе.
//  • Texas Method: пятница — новый рекорд на 5, понедельник — 90% пятничного, среда — 80% понедельника.
//  • Остальные — двойная прогрессия: верх диапазона во всех подходах → +вес; 2 провала подряд → −10%.
import type { Exercise } from "./exercise";
import { e1rm, weightStep } from "./exercise";

export type Session = { at: string; programDay: number | null; sets: { weight: number; reps: number; kind: string }[] };
export type SetPlan = { w: number | null; r: string };
export type Plan = { sets: SetPlan[] | null; weight: number | null; note: string | null; tone: "up" | "same" | "down" | "info" };

const round = (w: number, step: number) => Math.max(0, Math.round(w / step) * step);
const parseRange = (r: string) => {
  const m = r.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return { min: +m[1], max: +m[2] };
  const n = parseInt(r, 10);
  return Number.isFinite(n) ? { min: n, max: n } : null;
};
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Присед, становая, жим ногами — прибавляют быстрее */
const isLowerCompound = (ex: Exercise) =>
  ex.e === "barbell" && (ex.pm.includes("quadriceps") || ex.pm.includes("hamstrings") || ex.pm.includes("lower back") || ex.pm.includes("glutes"));
const increment = (ex: Exercise) => (ex.e === "barbell" ? (isLowerCompound(ex) ? 5 : 2.5) : weightStep(ex));

const working = (s: Session) => s.sets.filter((x) => x.kind !== "warmup" && x.weight > 0);
const topWeight = (s: Session) => Math.max(0, ...working(s).map((x) => x.weight));

/** Сколько последних тренировок подряд не удалось выполнить план на одном и том же весе */
function failStreak(history: Session[], minReps: number) {
  let n = 0;
  const w0 = history[0] ? topWeight(history[0]) : 0;
  for (const s of history) {
    const ws = working(s);
    if (!ws.length || topWeight(s) !== w0) break;
    if (ws.every((x) => x.reps >= minReps)) break;
    n++;
  }
  return n;
}

export function planFor(o: {
  program: string | null;
  programDayTitle?: string;
  ex: Exercise;
  targetReps: string | undefined;
  workingSets: number;
  history: Session[]; // новые сначала
  bestE1rm: number | null;
  programSessions: number; // тренировок по программе с её старта
}): Plan {
  const { ex, history } = o;
  const step = ex.e === "barbell" ? 2.5 : weightStep(ex);
  const last = history[0];
  const range = o.targetReps ? parseRange(o.targetReps) : null;
  const none: Plan = { sets: null, weight: null, note: null, tone: "info" };
  if (ex.e === "body only" && !history.some((s) => working(s).length)) {
    return range ? { ...none, note: `Цель: ${o.workingSets}×${o.targetReps}` } : none;
  }

  // ── 5/3/1: волна от тренировочного максимума
  if (o.program === "531-bbb") {
    if (!o.bestE1rm) return { ...none, note: "Первый раз: найди рабочий вес — последний подход на максимум повторов" };
    const tm = o.bestE1rm * 0.9;
    const week = Math.floor(o.programSessions / 4) % 4;
    if (range && range.min >= 10) {
      const pct = week === 3 ? 0.4 : 0.5 + Math.min(Math.floor(o.programSessions / 16), 2) * 0.05;
      const w = round(tm * pct, step);
      return { sets: Array.from({ length: o.workingSets }, () => ({ w, r: "10" })), weight: w, note: `BBB: ${Math.round(pct * 100)}% ТМ (${fmt(round(tm, step))} кг)`, tone: "info" };
    }
    const waves: [number, string][][] = [
      [[0.65, "5"], [0.75, "5"], [0.85, "5+"]],
      [[0.7, "3"], [0.8, "3"], [0.9, "3+"]],
      [[0.75, "5"], [0.85, "3"], [0.95, "1+"]],
      [[0.4, "5"], [0.5, "5"], [0.6, "5"]],
    ];
    const sets = waves[week].map(([p, r]) => ({ w: round(tm * p, step), r }));
    const title = ["неделя 1 · 5/5/5+", "неделя 2 · 3/3/3+", "неделя 3 · 5/3/1+", "разгрузка"][week];
    return {
      sets,
      weight: sets[sets.length - 1].w,
      note: week === 3 ? "5/3/1, разгрузочная неделя: лёгкие веса, без отказа" : `5/3/1, ${title} · последний подход — на максимум`,
      tone: week === 3 ? "down" : "info",
    };
  }

  if (!last || !working(last).length) return none;
  const lastW = topWeight(last);
  const lastSets = working(last);

  // ── GZCLP: смена схемы при неудачах
  if (o.program === "gzclp" && range) {
    const fails = failStreak(history, range.min);
    if (range.max <= 3) {
      if (!fails) return { sets: null, weight: lastW + increment(ex), note: `T1: +${fmt(increment(ex))} кг → ${fmt(lastW + increment(ex))} кг, 5×3+`, tone: "up" };
      const scheme = fails === 1 ? { n: 6, r: "2" } : fails === 2 ? { n: 10, r: "1" } : null;
      if (scheme) return { sets: Array.from({ length: scheme.n }, () => ({ w: lastW, r: scheme.r })), weight: lastW, note: `T1 застрял: сегодня ${scheme.n}×${scheme.r} с ${fmt(lastW)} кг`, tone: "same" };
      const w = round(lastW * 0.85, step);
      return { sets: null, weight: w, note: `T1 сброс: 85% → ${fmt(w)} кг, снова 5×3`, tone: "down" };
    }
    if (range.max <= 10 && range.min >= 6) {
      if (!fails) return { sets: null, weight: lastW + step, note: `T2: +${fmt(step)} кг → ${fmt(lastW + step)} кг`, tone: "up" };
      const r = fails === 1 ? "8" : fails === 2 ? "6" : null;
      if (r) return { sets: Array.from({ length: o.workingSets }, () => ({ w: lastW, r })), weight: lastW, note: `T2: сегодня 3×${r} с ${fmt(lastW)} кг`, tone: "same" };
      const w = round(lastW * 0.85, step);
      return { sets: null, weight: w, note: `T2 сброс: ${fmt(w)} кг, снова 3×10`, tone: "down" };
    }
    const lastSet = lastSets[lastSets.length - 1];
    if (lastSet && lastSet.reps >= 25) return { sets: null, weight: lastW + step, note: `T3: было ${lastSet.reps} повт. — +${fmt(step)} кг`, tone: "up" };
    return { sets: null, weight: lastW, note: "T3: последний подход — на максимум (цель 25+)", tone: "info" };
  }

  // ── Texas Method: объём / восстановление / интенсивность
  if (o.program === "texas-method") {
    const intensity = history.filter((s) => s.programDay === 2 && working(s).length);
    const pr5 = intensity.length ? topWeight(intensity[0]) : lastW;
    const t = o.programDayTitle ?? "";
    if (/Интенсив/i.test(t)) {
      const ok = intensity[0] ? working(intensity[0]).some((x) => x.reps >= 5) : true;
      const w = ok ? pr5 + (isLowerCompound(ex) ? 2.5 : 1) : pr5;
      return { sets: null, weight: w, note: ok ? `Рекорд на 5: ${fmt(w)} кг` : `Повтори ${fmt(w)} кг на 5`, tone: ok ? "up" : "same" };
    }
    if (/Объём/i.test(t)) {
      const w = round(pr5 * 0.9, step);
      return { sets: null, weight: w, note: `Объём: 90% от пятничного → ${fmt(w)} кг`, tone: "info" };
    }
    if (/Восстанов/i.test(t)) {
      const w = round(pr5 * 0.9 * 0.8, step);
      return { sets: null, weight: w, note: `Лёгкий день: 80% от понедельника → ${fmt(w)} кг`, tone: "info" };
    }
  }

  // ── Линейная прогрессия
  const LINEAR = ["starting-strength", "strength-5x5"];
  if (LINEAR.includes(o.program ?? "") && range) {
    const fails = failStreak(history, range.min);
    if (!fails) {
      const w = lastW + increment(ex);
      return { sets: null, weight: w, note: `+${fmt(increment(ex))} кг → ${fmt(w)} кг`, tone: "up" };
    }
    if (fails >= 3) {
      const w = round(lastW * 0.9, step);
      return { sets: null, weight: w, note: `3 неудачи на ${fmt(lastW)} кг — разгрузка −10%: ${fmt(w)} кг`, tone: "down" };
    }
    return { sets: null, weight: lastW, note: `Повтори ${fmt(lastW)} кг и добери все повторы`, tone: "same" };
  }

  // ── Двойная прогрессия (все остальные программы и свои тренировки)
  if (!range || range.max < range.min) return none;
  const allTop = lastSets.length >= Math.min(o.workingSets, lastSets.length) && lastSets.every((x) => x.reps >= range.max);
  if (allTop) {
    const w = lastW + step;
    return { sets: null, weight: w, note: `Пора прибавить: ${fmt(w)} кг`, tone: "up" };
  }
  if (failStreak(history, range.min) >= 2) {
    const w = round(lastW * 0.9, step);
    return { sets: null, weight: w, note: `Не выходит ${range.min}+ повторов — облегчи до ${fmt(w)} кг`, tone: "down" };
  }
  return { sets: null, weight: lastW, note: null, tone: "same" };
}

/** Расчётный максимум по истории — для тех, кто не делал программу раньше */
export const bestE1rmFrom = (history: Session[]) =>
  Math.max(0, ...history.flatMap((s) => working(s).map((x) => e1rm(x.weight, x.reps)))) || null;
