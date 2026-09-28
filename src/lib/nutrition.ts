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

/**
 * Базовый обмен. Если известен процент жира — учитываем формулу Кэтча–Макардла по «сухой» массе
 * (точнее для спортивных и для людей с большим весом), иначе Миффлин–Сан Жеор.
 */
export function bmr(sex: Sex, weight: number, height: number, age: number, bodyFat?: number | null) {
  const mifflin = 10 * weight + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161);
  if (bodyFat && bodyFat >= 3 && bodyFat <= 60) {
    const katch = 370 + 21.6 * weight * (1 - bodyFat / 100);
    // Смешиваем: одна формула страхует ошибки другой (и неточность измерения жира)
    return 0.6 * katch + 0.4 * mifflin;
  }
  return mifflin;
}

export function tdeeFrom(sex: Sex, weight: number, height: number, age: number, activity: number, bodyFat?: number | null) {
  return Math.round(bmr(sex, weight, height, age, bodyFat) * activity);
}

/**
 * Вес, от которого считаем белок и жиры. При лишнем весе считать от всей массы — перебор:
 * берём вес при «здоровом» проценте жира (если он известен) или вес при ИМТ 25.
 */
export function referenceWeight(weight: number, heightCm?: number | null, bodyFat?: number | null) {
  if (bodyFat && bodyFat >= 3 && bodyFat <= 60) return Math.min(weight, (weight * (1 - bodyFat / 100)) / 0.8);
  if (heightCm && heightCm > 120) return Math.min(weight, 25 * (heightCm / 100) ** 2);
  return Math.min(weight, 120);
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

/**
 * БЖУ под калории. Белок — по современным рекомендациям (ISSN, Morton 2018): на дефиците больше
 * (сохраняем мышцы), на наборе и поддержании — 1,8 г/кг от опорного веса.
 * Жиры — не меньше 0,6 г/кг и 25–35% калорий, остальное — углеводы.
 */
export function macrosFor(calories: number, weight: number, kind: GoalKind, heightCm?: number | null, bodyFat?: number | null) {
  const ref = referenceWeight(weight, heightCm, bodyFat);
  const perKg = kind === "lose" ? 2.0 : 1.8;
  // Белок не больше 35% калорий — иначе на маленькой норме не останется места углеводам
  const protein = Math.round(Math.min(ref * perKg, (calories * 0.35) / 4));
  const fatKcal = Math.min(Math.max(ref * 0.6 * 9, calories * 0.25), calories * 0.35);
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

export type TrendPoint = { day: string; scale: number | null; trend: number; slope: number };

/**
 * Тренд веса — двойное экспоненциальное сглаживание (Хольт): уровень + скорость изменения.
 * • Скачки воды и соли гасятся, а реальное движение видно без запаздывания обычного среднего.
 * • Пропуски взвешиваний не «замораживают» тренд: он продолжает движение (не дольше 10 дней).
 * • Резкие выбросы (после солёного ужина, в одежде) учитываются лишь частично.
 * • В начале (первые ~10 взвешиваний) тренд быстрее догоняет весы — сглаживание набирает силу постепенно.
 * Тот же алгоритм — в базе (weight_trend), для публичного профиля: цифры везде совпадают.
 */
export function trendSeries(weights: Weight[] | undefined, until = todayKey()): TrendPoint[] {
  if (!weights?.length) return [];
  const byDay = new Map(weights.map((w) => [w.day, Number(w.weight_kg)]));
  const first = [...byDay.keys()].sort()[0];
  const ALPHA = 0.1;
  const BETA = 0.15;
  const MAX_SLOPE = 0.15; // кг в день
  const out: TrendPoint[] = [];
  let level = byDay.get(first)!;
  let slope = 0;
  let sinceObs = 0;
  let n = 1;
  for (let d = first; d <= until; d = shiftKey(d, 1)) {
    const s = byDay.get(d) ?? null;
    if (d !== first) {
      sinceObs++;
      if (sinceObs <= 10) level += slope;
    }
    if (s != null && d !== first) {
      let r = s - level;
      const lim = Math.max(1, level * 0.012);
      if (Math.abs(r) > lim) r = Math.sign(r) * (lim + (Math.abs(r) - lim) * 0.3);
      // Пока взвешиваний мало, каждое новое весит больше (2/(n+1): второе — 67%, пятое — 33%),
      // иначе после 2–3 взвешиваний тренд почти стоит на первом весе и правки «не видны»
      n++;
      const a = Math.max(ALPHA, 2 / (n + 1));
      level += a * r;
      slope = Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, slope + BETA * a * r));
      sinceObs = 0;
    }
    out.push({ day: d, scale: s, trend: Math.round(level * 100) / 100, slope });
  }
  return out;
}

/**
 * Что показываем человеку как «вес» — последнее взвешивание: ровно то число, что он ввёл.
 * Тренд (выше) — для расчётов (расход, корректировка нормы, прогноз даты) и линии на графике.
 */
export const TREND_MIN_WEIGHINS = 5;

/**
 * Изменение веса по взвешиваниям — то, что можно проверить по истории:
 * последнее взвешивание минус взвешивание на начало периода (последнее перед ним, иначе первое внутри).
 * days = null — за всё время.
 */
export function scaleChange(weights: Weight[] | undefined, days: number | null, today = todayKey()) {
  const list = [...(weights ?? [])].filter((w) => w.day <= today).sort((a, b) => a.day.localeCompare(b.day));
  if (list.length < 2) return null;
  const to = list[list.length - 1];
  const start = days == null ? "0000" : shiftKey(today, -days);
  const before = list.filter((w) => w.day <= start);
  const from = before.length ? before[before.length - 1] : list.find((w) => w.day > start && w.day < to.day);
  if (!from || from.day === to.day) return null;
  const change = Math.round((Number(to.weight_kg) - Number(from.weight_kg)) * 10) / 10;
  return { change, from, to, days: daysBetween(from.day, to.day) };
}

function regressionSlopeXY(pts: { x: number; y: number }[]) {
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den ? num / den : 0;
}

export type TdeeEstimate = { value: number; confidence: number; observed: number | null };

export type DayStatus = "complete" | "incomplete";

/**
 * Записан ли день полностью. Отмеченные вручную — как отметил. Иначе день считаем неполным, если:
 * • калорий меньше половины от меньшего из «обычного для тебя дня» и нормы этого дня (и меньше 500), или
 * • всего одна запись, а калорий меньше 60% нормы.
 */
export function isCompleteDay(kcal: number, typical: number, flag?: DayStatus, target?: number | null, entries?: number) {
  if (flag === "complete") return true;
  if (flag === "incomplete") return false;
  const ref = Math.min(typical || Infinity, target || Infinity);
  const base = Number.isFinite(ref) ? ref : 2000;
  if (kcal < Math.max(500, base * 0.5)) return false;
  if (entries != null && entries <= 1 && target && kcal < target * 0.6) return false;
  return true;
}

/** Обычная калорийность дня — медиана записанных дней */
export function typicalKcal(totals: DayTotal[]) {
  const sorted = totals.filter((t) => t.entries > 0).map((t) => Number(t.kcal)).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

export function completeDays(totals: DayTotal[], flags?: Map<string, DayStatus>, targetOf?: (day: string) => number, typical?: number) {
  const logged = totals.filter((t) => t.entries > 0);
  const med = typical ?? typicalKcal(logged);
  return logged.filter((t) => isCompleteDay(Number(t.kcal), med, flags?.get(t.day), targetOf?.(t.day), t.entries));
}

/**
 * Адаптивная оценка расхода (как в MacroFactor): средние съеденные калории за полные дни минус
 * изменение запасов. Изменение веса — наклон по самим взвешиваниям окна (метод наименьших
 * квадратов, выбросы дальше 1,5 кг от тренда отброшены).
 * Надёжность оценки растёт с числом полных дней и РЕАЛЬНЫХ взвешиваний в окне и падает, если
 * последнее взвешивание давнее: дорисованные точки тренда наблюдениями не считаются.
 */
export function estimateTdee(
  totals: DayTotal[] | undefined,
  trend: TrendPoint[],
  fallback: number,
  endDay = shiftKey(todayKey(), -1),
  windowDays = 21,
  flags?: Map<string, DayStatus>,
  targetOf?: (day: string) => number,
  typical?: number,
): TdeeEstimate {
  const from = shiftKey(endDay, -(windowDays - 1));
  const logged = completeDays((totals ?? []).filter((t) => t.day >= from && t.day <= endDay), flags, targetOf, typical);
  const inWindow = trend.filter((p) => p.day >= from && p.day <= endDay);
  const weighIns = inWindow.map((p, i) => ({ x: i, y: p.scale, t: p.trend, day: p.day })).filter((p) => p.y != null);
  if (logged.length < 5 || weighIns.length < 4) return { value: fallback, confidence: 0, observed: null };
  const clean = weighIns.filter((p) => Math.abs((p.y as number) - p.t) < 1.5);
  const pts = clean.length >= 4 ? clean : weighIns;
  // Взвешивания должны покрывать хотя бы неделю — иначе наклон ненадёжен
  const spanDays = pts[pts.length - 1].x - pts[0].x;
  if (spanDays < 7) return { value: fallback, confidence: 0, observed: null };
  const slope = regressionSlopeXY(pts.map((p) => ({ x: p.x, y: p.y as number })));
  const avgIntake = logged.reduce((sum, t) => sum + Number(t.kcal), 0) / logged.length;
  const observed = avgIntake - slope * KCAL_PER_KG;
  const lastWeighAgo = inWindow.length - 1 - pts[pts.length - 1].x;
  const recency = Math.max(0, Math.min(1, (14 - lastWeighAgo) / 10));
  const confidence = Math.min(1, logged.length / 14) * Math.min(1, pts.length / 10) * Math.min(1, spanDays / 14) * recency;
  const blended = confidence * observed + (1 - confidence) * fallback;
  const value = Math.round(Math.min(Math.max(blended, fallback * 0.6), fallback * 1.5));
  return { value, confidence, observed: Math.round(observed) };
}

/**
 * Еженедельная корректировка нормы. За одну корректировку норма меняется не больше чем
 * на 250 ккал — без резких скачков. Цель достигнута — переход на поддержание: норма сразу
 * равна расходу (это и есть поддержание), без ограничения шага.
 */
export function checkinPlan(o: {
  tdee: number;
  current: number;
  kind: GoalKind;
  rateKgWeek: number;
  targetWeight: number | null;
  sex: Sex;
  heightCm?: number | null;
  bodyFat?: number | null;
  prevCalories?: number | null;
}) {
  const reached =
    o.targetWeight != null && ((o.kind === "lose" && o.current <= o.targetWeight) || (o.kind === "gain" && o.current >= o.targetWeight));
  let calories = caloriesFor(o.tdee, reached ? 0 : o.rateKgWeek, o.sex);
  if (o.prevCalories && !reached) calories = round10(Math.min(o.prevCalories + 250, Math.max(o.prevCalories - 250, calories)));
  return { calories, ...macrosFor(calories, o.current, reached ? "maintain" : o.kind, o.heightCm, o.bodyFat), reached };
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
