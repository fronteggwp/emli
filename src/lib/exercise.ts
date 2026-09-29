// Упражнения: справочники на русском, мышцы, калории, разовый максимум.

export type Exercise = {
  id: string;
  n: string; // название по-русски
  en: string; // оригинальное название
  a: string[]; // синонимы для поиска
  c: Category;
  e: Equipment | null;
  l: "beginner" | "intermediate" | "expert";
  f: "push" | "pull" | "static" | null;
  m: "compound" | "isolation" | null;
  pm: Muscle[]; // основные мышцы
  sm: Muscle[]; // вспомогательные
  i: string[]; // техника по шагам
  t: string[]; // советы / ошибки
  p: number; // популярность 0–3
  img: number; // число кадров
  custom?: boolean;
};

export type Category = "strength" | "stretching" | "plyometrics" | "strongman" | "powerlifting" | "cardio" | "olympic weightlifting";
export type Equipment =
  | "barbell"
  | "dumbbell"
  | "body only"
  | "cable"
  | "machine"
  | "kettlebells"
  | "bands"
  | "medicine ball"
  | "exercise ball"
  | "foam roll"
  | "e-z curl bar"
  | "other";
export type Muscle =
  | "abdominals"
  | "abductors"
  | "adductors"
  | "biceps"
  | "calves"
  | "chest"
  | "forearms"
  | "glutes"
  | "hamstrings"
  | "lats"
  | "lower back"
  | "middle back"
  | "neck"
  | "quadriceps"
  | "shoulders"
  | "traps"
  | "triceps";

export const MUSCLE_RU: Record<Muscle, string> = {
  chest: "Грудь",
  shoulders: "Плечи",
  triceps: "Трицепс",
  biceps: "Бицепс",
  forearms: "Предплечья",
  lats: "Широчайшие",
  "middle back": "Середина спины",
  "lower back": "Поясница",
  traps: "Трапеция",
  abdominals: "Пресс",
  glutes: "Ягодицы",
  quadriceps: "Квадрицепс",
  hamstrings: "Бицепс бедра",
  calves: "Икры",
  adductors: "Приводящие",
  abductors: "Отводящие",
  neck: "Шея",
};

/** Крупные группы для фильтров и статистики */
export const MUSCLE_GROUPS: { key: string; title: string; emoji: string; muscles: Muscle[] }[] = [
  { key: "chest", title: "Грудь", emoji: "🫁", muscles: ["chest"] },
  { key: "back", title: "Спина", emoji: "🪽", muscles: ["lats", "middle back", "lower back", "traps"] },
  { key: "shoulders", title: "Плечи", emoji: "🥥", muscles: ["shoulders"] },
  { key: "arms", title: "Руки", emoji: "💪", muscles: ["biceps", "triceps", "forearms"] },
  { key: "legs", title: "Ноги", emoji: "🦵", muscles: ["quadriceps", "hamstrings", "calves", "adductors", "abductors"] },
  { key: "glutes", title: "Ягодицы", emoji: "🍑", muscles: ["glutes"] },
  { key: "core", title: "Пресс", emoji: "🧱", muscles: ["abdominals"] },
];

export const EQUIPMENT_RU: Record<Equipment, string> = {
  barbell: "Штанга",
  dumbbell: "Гантели",
  "body only": "Свой вес",
  cable: "Блок / кроссовер",
  machine: "Тренажёр",
  kettlebells: "Гиря",
  bands: "Резинки",
  "medicine ball": "Медбол",
  "exercise ball": "Фитбол",
  "foam roll": "Ролик",
  "e-z curl bar": "EZ-гриф",
  other: "Другое",
};

export const CATEGORY_RU: Record<Category, string> = {
  strength: "Силовое",
  stretching: "Растяжка",
  plyometrics: "Плиометрика",
  strongman: "Стронгмен",
  powerlifting: "Пауэрлифтинг",
  cardio: "Кардио",
  "olympic weightlifting": "Тяжёлая атлетика",
};

export const LEVEL_RU = { beginner: "Новичок", intermediate: "Средний", expert: "Продвинутый" } as const;

/** Кардио, растяжка и статика (планка) — на время, а не вес × повторы */
export const isTimed = (ex: Pick<Exercise, "c" | "f" | "e">) =>
  ex.c === "cardio" || ex.c === "stretching" || (ex.f === "static" && ex.e === "body only");
export const usesWeight = (ex: Pick<Exercise, "e" | "c" | "f">) => !isTimed(ex) && ex.e !== "body only" && ex.e !== "foam roll";

/** Метаболические эквиваленты (Compendium of Physical Activities, усреднённо) */
const MET: Record<Category, number> = {
  strength: 5.0,
  powerlifting: 6.0,
  "olympic weightlifting": 6.0,
  strongman: 7.0,
  plyometrics: 8.0,
  cardio: 7.5,
  stretching: 2.5,
};
export const metOf = (ex: Pick<Exercise, "c">) => MET[ex.c] ?? 5;

/**
 * Сожжённые на тренировке калории — «чистые»: Σ (MET − 1) × вес тела × время работы.
 * • Время — по выполненной работе: подход (≈40 с или вписанные секунды) + отдых после него,
 *   а не время, пока тренировка была открыта.
 * • Таймер ограничивает оценку сверху (открыл тренировку на 5 минут — калорий за час не будет),
 *   но только если за это время отмеченные подходы вообще можно было сделать (≥ 25 с на подход).
 *   Меньше — тренировку записали после, таймер про её длительность ничего не знает: считаем по подходам.
 * • Единицу вычитаем: базовый обмен за это время уже входит в дневной расход.
 * Это приблизительная оценка (Compendium of Physical Activities даёт средние значения).
 */
export const MIN_SET_MIN = 25 / 60;
export function burnedKcal(parts: { met: number; minutes: number }[], bodyKg: number, durationMin: number, sets = 0) {
  const work = parts.reduce((s, p) => s + p.minutes, 0);
  if (!work || !bodyKg) return 0;
  const timerTrusted = durationMin > 0 && durationMin >= sets * MIN_SET_MIN;
  const k = Math.min(1, Math.min(timerTrusted ? durationMin : work, 180) / work);
  return Math.round(parts.reduce((s, p) => s + (Math.max(1.5, p.met) - 1) * bodyKg * (p.minutes * k) / 60, 0));
}

/** Расчётный разовый максимум (формула Эпли). Больше 12 повторов — не считаем (как и сервер) */
export function e1rm(weight: number, reps: number) {
  if (!weight || !reps || reps > 12) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/** Шаг прибавки веса: штанга — 2,5 кг, гантели/гири — 1–2 кг, блоки — 2,5 */
export function weightStep(ex: Pick<Exercise, "e">) {
  if (ex.e === "dumbbell" || ex.e === "kettlebells") return 1;
  return 2.5;
}

export const imgUrl = (id: string, n = 0) => `${import.meta.env.BASE_URL}ex/${id}/${n}.webp`;

/** Нормализация для поиска: ё→е, регистр, лишние символы */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Поиск по каталогу: совпадение с начала слова ценнее, популярные — выше */
export function searchExercises(list: Exercise[], q: string) {
  const needle = norm(q);
  if (!needle) return list;
  const words = needle.split(" ");
  const scored: { e: Exercise; s: number }[] = [];
  for (const e of list) {
    const muscles = norm(e.pm.map((m) => MUSCLE_RU[m]).join(" "));
    const hay = norm([e.n, e.en, ...e.a].join(" ")) + " " + muscles;
    if (!words.every((w) => hay.includes(w))) continue;
    const name = norm(e.n);
    let s = e.p * 15;
    if (name === needle) s += 120;
    else if (name.startsWith(needle)) s += 50;
    else if (name.split(" ").some((w) => w.startsWith(words[0]))) s += 30;
    if (e.a.some((a) => norm(a) === needle)) s += 15;
    // Запрос — это мышца («грудь», «бицепс бедра»): базовые упражнения на неё — наверх
    if (muscles.split(" ").some((w) => w.startsWith(words[0]))) s += 25;
    s -= name.length / 15;
    scored.push({ e, s });
  }
  return scored.sort((a, b) => b.s - a.s).map((x) => x.e);
}
