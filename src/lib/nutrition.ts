import type { DayTotal, GoalKind, Macros, Sex, Targets, Weight } from "./types";
import { daysBetween, shiftKey, todayKey } from "./dates";

export const KCAL_PER_KG = 7700;

export const MEALS = [
  { id: 0, name: "Завтрак", emoji: "☀️" },
  { id: 1, name: "Обед", emoji: "🍲" },
  { id: 2, name: "Ужин", emoji: "🌙" },
  { id: 3, name: "Перекусы", emoji: "🍎" },
] as const;

/** Приём пищи по текущему времени — для умного выбора по умолчанию */
export function mealByTime(d = new Date()) {
  const h = d.getHours();
  if (h < 11) return 0;
  if (h < 16) return 1;
  if (h < 21) return 2;
  return 3;
}

export const ACTIVITY = [
  { v: 1.2, title: "Минимальная", desc: "Сидячая работа, почти нет спорта" },
  { v: 1.375, title: "Лёгкая", desc: "1–3 тренировки в неделю или много ходьбы" },
  { v: 1.55, title: "Средняя", desc: "3–5 тренировок в неделю" },
  { v: 1.725, title: "Высокая", desc: "6–7 тренировок в неделю" },
  { v: 1.9, title: "Очень высокая", desc: "Физическая работа и спорт каждый день" },
];

export function bmr(sex: Sex, weight: number, height: number, age: number) {
  return 10 * weight + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161);
}

export function tdeeFrom(sex: Sex, weight: number, height: number, age: number, activity: number) {
  return Math.round(bmr(sex, weight, height, age) * activity);
}

/** Темпы изменения веса, % массы тела в неделю */
export const RATES: Record<Exclude<GoalKind, "maintain">, { key: string; title: string; pct: number; hint: string }[]> = {
  lose: [
    { key: "easy", title: "Спокойно", pct: 0.25, hint: "Почти не чувствуется" },
    { key: "normal", title: "Оптимально", pct: 0.5, hint: "Баланс скорости и комфорта" },
    { key: "fast", title: "Быстро", pct: 0.75, hint: "Нужна дисциплина" },
    { key: "max", title: "Максимум", pct: 1.0, hint: "Коротким курсом" },
  ],
  gain: [
    { key: "easy", title: "Чисто", pct: 0.1, hint: "Минимум жира" },
    { key: "normal", title: "Оптимально", pct: 0.25, hint: "Хороший темп роста" },
    { key: "fast", title: "Быстро", pct: 0.5, hint: "Больше массы и жира" },
  ],
};

export const round10 = (n: number) => Math.round(n / 10) * 10;

export function caloriesFor(tdee: number, rateKgWeek: number, sex: Sex) {
  const raw = tdee + (rateKgWeek * KCAL_PER_KG) / 7;
  return round10(Math.max(raw, sex === "male" ? 1500 : 1200));
}

export function macrosFor(calories: number, weight: number, kind: GoalKind) {
  const perKg = kind === "lose" ? 1.8 : 1.6;
  const protein = Math.round(Math.min(weight, 150) * perKg);
  const fatKcal = Math.min(Math.max(weight * 0.5 * 9, calories * 0.25), calories * 0.35);
  const fat = Math.round(fatKcal / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { protein, fat, carbs };
}

export const kcalOfMacros = (p: number, f: number, c: number) => Math.round(p * 4 + f * 9 + c * 4);

/** Программа, которая действует в указанный день */
export function targetFor(list: Targets[] | undefined, day: string): Targets | undefined {
  if (!list?.length) return undefined;
  const sorted = [...list].sort((a, b) =>
    a.start_date === b.start_date ? b.created_at.localeCompare(a.created_at) : b.start_date.localeCompare(a.start_date),
  );
  return sorted.find((t) => t.start_date <= day) ?? sorted[sorted.length - 1];
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce(
    (a, e) => ({
      kcal: a.kcal + Number(e.kcal),
      protein: a.protein + Number(e.protein),
      fat: a.fat + Number(e.fat),
      carbs: a.carbs + Number(e.carbs),
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
}

export function scaleMacros(per100: Macros, grams: number): Macros {
  const k = grams / 100;
  return {
    kcal: Math.round(per100.kcal * k),
    protein: Math.round(per100.protein * k * 10) / 10,
    fat: Math.round(per100.fat * k * 10) / 10,
    carbs: Math.round(per100.carbs * k * 10) / 10,
  };
}

export type TrendPoint = { day: string; scale: number | null; trend: number };

/**
 * Сглаженный тренд веса (экспоненциальное среднее, как в Happy Scale / MacroFactor).
 * Скачки воды и соли гасятся, видна реальная динамика.
 */
export function trendSeries(weights: Weight[] | undefined, until = todayKey()): TrendPoint[] {
  if (!weights?.length) return [];
  const byDay = new Map(weights.map((w) => [w.day, Number(w.weight_kg)]));
  const first = [...byDay.keys()].sort()[0];
  const out: TrendPoint[] = [];
  let t = byDay.get(first)!;
  for (let d = first; d <= until; d = shiftKey(d, 1)) {
    const s = byDay.get(d) ?? null;
    if (s != null) t = t + 0.1 * (s - t);
    out.push({ day: d, scale: s, trend: Math.round(t * 100) / 100 });
  }
  return out;
}

export type TdeeEstimate = { value: number; confidence: number; observed: number | null };

/**
 * Адаптивная оценка расхода: сколько съедено минус изменение запасов (по тренду веса).
 * Пока данных мало, опираемся на формулу; чем больше записей — тем больше веса у наблюдений.
 */
export function estimateTdee(
  totals: DayTotal[] | undefined,
  trend: TrendPoint[],
  fallback: number,
  endDay = shiftKey(todayKey(), -1),
  windowDays = 21,
): TdeeEstimate {
  const from = shiftKey(endDay, -(windowDays - 1));
  const logged = (totals ?? []).filter((t) => t.day >= from && t.day <= endDay && t.entries > 0 && t.kcal > 300);
  const inWindow = trend.filter((p) => p.day >= shiftKey(from, -1) && p.day <= endDay);
  if (logged.length < 5 || inWindow.length < 2) return { value: fallback, confidence: 0, observed: null };
  const a = inWindow[0];
  const b = inWindow[inWindow.length - 1];
  const span = daysBetween(a.day, b.day);
  if (span < 6) return { value: fallback, confidence: 0, observed: null };
  const avgIntake = logged.reduce((s, t) => s + Number(t.kcal), 0) / logged.length;
  const observed = avgIntake - ((b.trend - a.trend) * KCAL_PER_KG) / span;
  const confidence = Math.min(1, logged.length / 14) * Math.min(1, span / 14);
  const blended = confidence * observed + (1 - confidence) * fallback;
  const value = Math.round(Math.min(Math.max(blended, fallback * 0.6), fallback * 1.5));
  return { value, confidence, observed: Math.round(observed) };
}

/** Когда будет достигнут целевой вес при текущем темпе */
export function etaDays(current: number, target: number | null, rateKgWeek: number) {
  if (target == null || !rateKgWeek) return null;
  const diff = target - current;
  if (Math.sign(diff) !== Math.sign(rateKgWeek) || Math.abs(diff) < 0.05) return 0;
  return Math.round((diff / rateKgWeek) * 7);
}

export const fmtNum = (n: number, digits = 0) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtKg = (n: number) => fmtNum(n, 1);
