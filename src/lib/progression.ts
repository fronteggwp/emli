// Прогрессия весов по схеме программы.
//  • Линейная (Starting Strength, StrongLifts 5×5): все запланированные подходы выполнены — +2,5 кг (жимы) / +5 кг
//    (присед, становая); 3 неудачи подряд на одном весе — разгрузка −10%.
//  • 5/3/1 (Вендлер): тренировочный максимум (ТМ) хранится; волна по неделям 5/3/1 + разгрузка;
//    после цикла ТМ растёт на 2,5 кг (жимы) / 5 кг (ноги). BBB — 50–60% ТМ.
//  • GZCLP: этап (5×3 → 6×2 → 10×1 у T1, 3×10 → 3×8 → 3×6 у T2) определяется по прошлой тренировке.
//  • Texas Method: пятница — новый рекорд на 5, понедельник — 90% пятничного, среда — 80% понедельника.
//  • Остальные — двойная прогрессия: верх диапазона во всех подходах → +вес; 2 провала подряд → −10%.
// Успех засчитывается, только если выполнены ВСЕ запланированные рабочие подходы с нужными повторами.
import type { Exercise } from "./exercise";
import { weightStep } from "./exercise";

export type SessionSet = { weight: number; reps: number; kind: string; target?: string | null; planned?: number | null; order?: number };
export type Session = { at: string; programDay: number | null; program?: string | null; sets: SessionSet[] };
export type SetPlan = { w: number | null; r: string };
export type Plan = { sets: SetPlan[] | null; weight: number | null; note: string | null; tone: "up" | "same" | "down" | "info" };
export type Role = "main" | "bbb" | "t1" | "t2" | "t3" | "accessory";

const round = (w: number, step: number) => Math.max(0, Math.round(w / step) * step);
const parseRange = (r: string | null | undefined) => {
  if (!r) return null;
  const m = r.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return { min: +m[1], max: +m[2] };
  const n = parseInt(r, 10);
  return Number.isFinite(n) ? { min: n, max: n } : null;
};
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Роль упражнения в сегодняшней тренировке — по подсказке из шаблона программы */
export function roleOf(note: string | undefined, program: string | null | undefined): Role {
  const n = note ?? "";
  if (program === "531-bbb") return /BBB/i.test(n) ? "bbb" : /Волна|5\/3\/1/i.test(n) ? "main" : "accessory";
  if (program === "gzclp") return /T1/.test(n) ? "t1" : /T2/.test(n) ? "t2" : /T3/.test(n) ? "t3" : "accessory";
  return "main";
}

const isLowerCompound = (ex: Exercise) =>
  ex.e === "barbell" && (ex.pm.includes("quadriceps") || ex.pm.includes("hamstrings") || ex.pm.includes("lower back") || ex.pm.includes("glutes"));
export const increment = (ex: Exercise) => (ex.e === "barbell" ? (isLowerCompound(ex) ? 5 : 2.5) : weightStep(ex));

const working = (s: Session) => s.sets.filter((x) => x.kind !== "warmup" && x.weight > 0);
const topWeight = (s: Session) => Math.max(0, ...working(s).map((x) => x.weight));

/** Выполнен ли план тренировки: все запланированные подходы, каждый — не меньше своей цели */
export function sessionSuccess(s: Session, fallbackMin: number, fallbackCount: number) {
  const ws = working(s);
  if (!ws.length) return false;
  const planned = ws.find((x) => x.planned)?.planned ?? fallbackCount;
  if (ws.length < planned) return false;
  return ws.every((x) => x.reps >= (parseRange(x.target)?.min ?? fallbackMin));
}

/** Сколько последних тренировок подряд план не выполнен на одном и том же весе */
function failStreak(history: Session[], min: number, count: number) {
  let n = 0;
  const w0 = history[0] ? topWeight(history[0]) : 0;
  for (const s of history) {
    if (!working(s).length || topWeight(s) !== w0) break;
    if (sessionSuccess(s, min, count)) break;
    n++;
  }
  return n;
}

export type PlanInput = {
  program: string | null;
  programDayTitle?: string;
  role: Role;
  ex: Exercise;
  targetReps: string | undefined;
  workingSets: number;
  history: Session[]; // новые сначала, уже только своей программы и роли
  bestE1rm: number | null;
  programSessions: number; // тренировок по программе с её старта
  tm?: { tm: number; cycle: number } | null; // хранимый ТМ для 5/3/1
};

export function planFor(o: PlanInput): Plan {
  const { ex, history } = o;
  const step = ex.e === "barbell" ? 2.5 : weightStep(ex);
  const last = history[0];
  const range = parseRange(o.targetReps);
  const none: Plan = { sets: null, weight: null, note: null, tone: "info" };
  if (ex.e === "body only" && !history.some((s) => working(s).length)) {
    return range ? { ...none, note: `Цель: ${o.workingSets}×${o.targetReps}` } : none;
  }

  // ── 5/3/1: волна от хранимого тренировочного максимума
  if (o.program === "531-bbb" && (o.role === "main" || o.role === "bbb")) {
    const cycle = Math.floor(o.programSessions / 16);
    const baseTm = o.tm?.tm ?? (o.bestE1rm ? o.bestE1rm * 0.9 : null);
    if (!baseTm) return { ...none, note: "Первый раз: подбери рабочий вес — последний подход на максимум повторов" };
    // ТМ растёт после каждого завершённого цикла
    const tm = baseTm + Math.max(0, cycle - (o.tm?.cycle ?? 0)) * increment(ex);
    const week = Math.floor(o.programSessions / 4) % 4;
    if (o.role === "bbb") {
      const pct = week === 3 ? 0.4 : 0.5 + Math.min(cycle, 2) * 0.05;
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
    const title = ["неделя 1 · 5/5/5+", "неделя 2 · 3/3/3+", "неделя 3 · 5/3/1+"][week];
    return {
      sets,
      weight: sets[sets.length - 1].w,
      note: week === 3 ? "5/3/1, разгрузочная неделя: лёгкие веса, без отказа" : `5/3/1, ${title} · ТМ ${fmt(round(tm, step))} кг, последний подход — на максимум`,
      tone: week === 3 ? "down" : "info",
    };
  }

  if (!last || !working(last).length) return none;
  const lastW = topWeight(last);
  const lastSets = working(last);
  const lastPlanned = lastSets.find((x) => x.planned)?.planned ?? lastSets.length;
  const lastTarget = parseRange(lastSets[0]?.target) ?? range;

  // ── GZCLP: этап — по схеме прошлой тренировки
  if (o.program === "gzclp" && (o.role === "t1" || o.role === "t2")) {
    const schemes = o.role === "t1" ? [{ n: 5, r: 3 }, { n: 6, r: 2 }, { n: 10, r: 1 }] : [{ n: 3, r: 10 }, { n: 3, r: 8 }, { n: 3, r: 6 }];
    const stage = Math.max(0, schemes.findIndex((s) => s.n === lastPlanned && s.r === (lastTarget?.min ?? s.r)));
    const cur = schemes[stage];
    const ok = sessionSuccess(last, cur.r, cur.n);
    const inc = o.role === "t1" ? increment(ex) : step;
    const tag = o.role.toUpperCase();
    const mk = (n: number, r: number, w: number) => Array.from({ length: n }, (_, i) => ({ w, r: o.role === "t1" && i === n - 1 ? `${r}+` : String(r) }));
    if (ok) return { sets: mk(cur.n, cur.r, lastW + inc), weight: lastW + inc, note: `${tag}: ${cur.n}×${cur.r} выполнено — +${fmt(inc)} кг`, tone: "up" };
    const next = schemes[stage + 1];
    if (next) return { sets: mk(next.n, next.r, lastW), weight: lastW, note: `${tag}: ${cur.n}×${cur.r} не вышло — сегодня ${next.n}×${next.r} с ${fmt(lastW)} кг`, tone: "same" };
    const w = round(lastW * 0.85, step);
    return { sets: mk(schemes[0].n, schemes[0].r, w), weight: w, note: `${tag}: новый круг — 85% (${fmt(w)} кг), снова ${schemes[0].n}×${schemes[0].r}`, tone: "down" };
  }
  if (o.program === "gzclp" && o.role === "t3") {
    const lastSet = lastSets[lastSets.length - 1];
    if (lastSet && lastSet.reps >= 25) return { sets: null, weight: lastW + step, note: `T3: было ${lastSet.reps} повт. в последнем подходе — +${fmt(step)} кг`, tone: "up" };
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
  if (["starting-strength", "strength-5x5"].includes(o.program ?? "") && range) {
    const fails = failStreak(history, range.min, o.workingSets);
    if (!fails) {
      const w = lastW + increment(ex);
      return { sets: null, weight: w, note: `Все подходы выполнены — +${fmt(increment(ex))} кг → ${fmt(w)} кг`, tone: "up" };
    }
    if (fails >= 3) {
      const w = round(lastW * 0.9, step);
      return { sets: null, weight: w, note: `3 неудачи на ${fmt(lastW)} кг — разгрузка −10%: ${fmt(w)} кг`, tone: "down" };
    }
    return { sets: null, weight: lastW, note: `Повтори ${fmt(lastW)} кг и выполни все подходы`, tone: "same" };
  }

  // ── Двойная прогрессия
  if (!range || range.max < range.min) return none;
  const allTop = lastSets.length >= Math.max(lastPlanned, o.workingSets) && lastSets.every((x) => x.reps >= range.max);
  if (allTop) {
    const w = lastW + step;
    return { sets: null, weight: w, note: `Верх диапазона во всех подходах — ${fmt(w)} кг`, tone: "up" };
  }
  if (failStreak(history, range.min, o.workingSets) >= 2) {
    const w = round(lastW * 0.9, step);
    return { sets: null, weight: w, note: `Не выходит ${range.min}+ повторов — облегчи до ${fmt(w)} кг`, tone: "down" };
  }
  return { sets: null, weight: lastW, note: null, tone: "same" };
}

/** Только тренировки этой программы (или свободные — для своих тренировок) и подходы этой роли */
export function historyFor(sessions: Session[] | undefined, program: string | null, targetReps: string | undefined, role: Role): Session[] {
  const list = (sessions ?? []).filter((s) => (program ? s.program === program : true));
  if (role === "main" && !program) return list;
  const tr = parseRange(targetReps);
  return list
    .map((s) => ({
      ...s,
      // Одно упражнение дважды за тренировку (5/3/1 + BBB): берём подходы с той же целью
      sets: s.sets.filter((x) => {
        if (!x.target || !tr) return true;
        const xr = parseRange(x.target);
        if (!xr) return true;
        return role === "bbb" ? xr.min >= 8 : role === "main" && program === "531-bbb" ? xr.max <= 5 : true;
      }),
    }))
    .filter((s) => s.sets.length);
}
