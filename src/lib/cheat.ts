// Читмил: в выбранный день норма больше, а «лишнее» заранее (или после) снимается с соседних дней.
// Сумма калорий за период не меняется — прогресс к цели сохраняется.
import type { Targets } from "./types";
import { shiftKey } from "./dates";

export type CheatPlan = {
  id: string;
  day: string;
  extra_kcal: number;
  spread_days: number;
  mode: "before" | "after";
  title: string | null;
  created_at: string;
};

export type DayAdjust = { delta: number; kind: "cheat" | "save"; plan: CheatPlan };

export type DayTarget = Pick<Targets, "calories" | "protein" | "fat" | "carbs"> & {
  base: Pick<Targets, "calories" | "protein" | "fat" | "carbs">;
  adjust: DayAdjust[];
};

/** Дни, с которых снимаются калории под план */
export function saveDays(plan: Pick<CheatPlan, "day" | "spread_days" | "mode">) {
  const dir = plan.mode === "before" ? -1 : 1;
  return Array.from({ length: plan.spread_days }, (_, i) => shiftKey(plan.day, dir * (i + 1)));
}

/** Безопасный минимум дня «экономии»: не ниже 70% обычной нормы и не ниже 1200 ккал */
export const cutFloor = (base: number) => Math.max(1200, base * 0.7);

/**
 * Реальная раскладка плана. С каждого дня компенсации снимаем поровну, но не ниже безопасного
 * минимума; не хватило места на одном дне — остаток переносим на другие дни компенсации.
 * В день читмила добавляется ровно столько, сколько удалось снять: бюджет всегда сходится.
 */
export function planSplit(plan: Pick<CheatPlan, "day" | "spread_days" | "mode" | "extra_kcal">, baseOf: (day: string) => number) {
  const days = saveDays(plan);
  const room = days.map((d) => Math.max(0, baseOf(d) - cutFloor(baseOf(d))));
  const cuts = days.map(() => 0);
  let left = plan.extra_kcal;
  for (let guard = 0; guard < 10 && left > 0.5; guard++) {
    const open = cuts.map((c, i) => (room[i] - c > 0.5 ? i : -1)).filter((i) => i >= 0);
    if (!open.length) break;
    const share = left / open.length;
    for (const i of open) {
      const take = Math.min(share, room[i] - cuts[i]);
      cuts[i] += take;
      left -= take;
    }
  }
  const rounded = cuts.map((c) => Math.round(c));
  const bonus = rounded.reduce((a, c) => a + c, 0);
  return { cuts: new Map(days.map((d, i) => [d, rounded[i]])), bonus, short: Math.max(0, plan.extra_kcal - bonus) };
}

export function adjustmentsFor(plans: CheatPlan[] | undefined, day: string, baseOf: (day: string) => number): DayAdjust[] {
  const out: DayAdjust[] = [];
  for (const p of plans ?? []) {
    if (p.day !== day && !saveDays(p).includes(day)) continue;
    const split = planSplit(p, baseOf);
    if (p.day === day) out.push({ delta: split.bonus, kind: "cheat", plan: p });
    else out.push({ delta: -(split.cuts.get(day) ?? 0), kind: "save", plan: p });
  }
  return out;
}

/**
 * Меняем калории, не трогая белок: прибавка — в углеводы и жиры,
 * урезание — из углеводов и жиров, но не ниже разумного минимума.
 */
export function applyDelta(t: Pick<Targets, "calories" | "protein" | "fat" | "carbs">, delta: number) {
  if (!delta) return { ...t };
  let fat = t.fat;
  let carbs = t.carbs;
  if (delta > 0) {
    fat += (delta * 0.35) / 9;
    carbs += (delta * 0.65) / 4;
  } else {
    const cut = -delta;
    let fromCarbs = (cut * 0.65) / 4;
    let fromFat = (cut * 0.35) / 9;
    const carbRoom = Math.max(carbs - 40, 0);
    const fatRoom = Math.max(fat - 30, 0);
    if (fromCarbs > carbRoom) {
      fromFat += ((fromCarbs - carbRoom) * 4) / 9;
      fromCarbs = carbRoom;
    }
    if (fromFat > fatRoom) {
      fromCarbs = Math.min(carbRoom, fromCarbs + ((fromFat - fatRoom) * 9) / 4);
      fromFat = fatRoom;
    }
    carbs -= fromCarbs;
    fat -= fromFat;
  }
  return { calories: Math.round(t.calories + delta), protein: t.protein, fat: Math.round(fat), carbs: Math.round(carbs) };
}

export function withPlans(
  base: Pick<Targets, "calories" | "protein" | "fat" | "carbs">,
  plans: CheatPlan[] | undefined,
  day: string,
  baseOf: (day: string) => number,
): DayTarget {
  const adjust = adjustmentsFor(plans, day, baseOf);
  const delta = adjust.reduce((s, a) => s + a.delta, 0);
  return { ...applyDelta(base, delta), base, adjust };
}

/** Насколько резко урезаем день: доля от обычной нормы */
export const cutShare = (extra: number, days: number, baseCalories: number) => extra / days / Math.max(baseCalories, 1);

export const CHEAT_PRESETS = [
  { kcal: 500, emoji: "🍔", title: "Бургер" },
  { kcal: 800, emoji: "🍕", title: "Пицца" },
  { kcal: 1200, emoji: "🎂", title: "Праздник" },
  { kcal: 1600, emoji: "🎉", title: "Всё можно" },
];
