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

export function adjustmentsFor(plans: CheatPlan[] | undefined, day: string): DayAdjust[] {
  const out: DayAdjust[] = [];
  for (const p of plans ?? []) {
    if (p.day === day) out.push({ delta: p.extra_kcal, kind: "cheat", plan: p });
    else if (saveDays(p).includes(day)) out.push({ delta: -Math.round(p.extra_kcal / p.spread_days), kind: "save", plan: p });
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
    // Безопасный минимум: день «экономии» не ниже 70% обычной нормы и не ниже 1200 ккал
    const floor = Math.max(1200, t.calories * 0.7);
    const cut = Math.min(-delta, Math.max(0, t.calories - floor));
    delta = -cut;
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

export function withPlans(base: Pick<Targets, "calories" | "protein" | "fat" | "carbs">, plans: CheatPlan[] | undefined, day: string): DayTarget {
  const adjust = adjustmentsFor(plans, day);
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
