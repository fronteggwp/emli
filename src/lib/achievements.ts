// Каталог достижений. Условия проверяет сервер (sync_achievements), здесь — названия и оформление.
import type { ChallengeMetric } from "@/data/engage";

export type AchGroup = "food" | "weight" | "gym" | "social";
export type Achievement = { key: string; title: string; desc: string; emoji: string; group: AchGroup };

export const ACH_GROUPS: { id: AchGroup; name: string; colors: [string, string] }[] = [
  { id: "food", name: "Питание", colors: ["#ffb35c", "#ff6a5c"] },
  { id: "weight", name: "Вес", colors: ["#b388ff", "#6b5cff"] },
  { id: "gym", name: "Тренировки", colors: ["#4fd18b", "#1d8f9a"] },
  { id: "social", name: "Друзья", colors: ["#5cc8ff", "#3a7bd5"] },
];

export const ACHIEVEMENTS: Achievement[] = [
  { key: "first_log", title: "Первый шаг", desc: "Записать первый приём пищи", emoji: "🌱", group: "food" },
  { key: "streak_7", title: "Неделя в строю", desc: "7 дней подряд с записями", emoji: "🔥", group: "food" },
  { key: "streak_30", title: "Месяц дисциплины", desc: "30 дней подряд с записями", emoji: "🌟", group: "food" },
  { key: "streak_100", title: "Легенда дневника", desc: "100 дней подряд с записями", emoji: "👑", group: "food" },
  { key: "logged_100", title: "Сотня", desc: "100 дней с записями всего", emoji: "💯", group: "food" },
  { key: "on_target_7", title: "Снайпер", desc: "7 дней в пределах ±100 ккал от цели", emoji: "🎯", group: "food" },

  { key: "first_weigh", title: "Точка отсчёта", desc: "Записать вес впервые", emoji: "⚖️", group: "weight" },
  { key: "weigh_30", title: "Под контролем", desc: "30 взвешиваний", emoji: "📈", group: "weight" },
  { key: "lost_5", title: "Минус пять", desc: "Сбросить 5 кг от стартового веса", emoji: "🪶", group: "weight" },
  { key: "goal_reached", title: "Цель достигнута", desc: "Дойти до целевого веса", emoji: "🏁", group: "weight" },

  { key: "first_workout", title: "Первая тренировка", desc: "Завершить тренировку", emoji: "💪", group: "gym" },
  { key: "workouts_10", title: "Втянулся", desc: "10 тренировок", emoji: "🏋️", group: "gym" },
  { key: "workouts_50", title: "Железный", desc: "50 тренировок", emoji: "🦾", group: "gym" },
  { key: "workouts_100", title: "Сотня в зале", desc: "100 тренировок", emoji: "🏆", group: "gym" },
  { key: "consistent_month", title: "Режим", desc: "4 недели подряд по 3+ тренировки", emoji: "📅", group: "gym" },
  { key: "first_pr", title: "Новый рекорд", desc: "Побить личный рекорд", emoji: "⚡️", group: "gym" },
  { key: "prs_25", title: "Рекордсмен", desc: "25 личных рекордов", emoji: "🚀", group: "gym" },
  { key: "volume_10t", title: "10 тонн", desc: "Поднять 10 тонн за одну тренировку", emoji: "🐘", group: "gym" },
  { key: "volume_100t", title: "100 тонн", desc: "Суммарный объём — 100 тонн", emoji: "🏗️", group: "gym" },
  { key: "volume_1000t", title: "Тысяча тонн", desc: "Суммарный объём — 1000 тонн", emoji: "🌋", group: "gym" },
  { key: "early_bird", title: "Ранняя пташка", desc: "Тренировка до 7 утра", emoji: "🌅", group: "gym" },
  { key: "night_owl", title: "Ночная сова", desc: "Тренировка после 22:00", emoji: "🦉", group: "gym" },

  { key: "first_friend", title: "Не один", desc: "Добавить первого друга", emoji: "🤝", group: "social" },
  { key: "friends_10", title: "Своя команда", desc: "10 друзей", emoji: "👥", group: "social" },
  { key: "first_post", title: "В эфире", desc: "Опубликовать первую запись", emoji: "📣", group: "social" },
  { key: "challenge_win", title: "Чемпион", desc: "Выиграть челлендж с друзьями", emoji: "🥇", group: "social" },
];

export const achByKey = (k: string) => ACHIEVEMENTS.find((a) => a.key === k);
export const groupOf = (g: AchGroup) => ACH_GROUPS.find((x) => x.id === g)!;

export const METRICS: Record<ChallengeMetric, { name: string; short: string; emoji: string; fmt: (v: number) => string }> = {
  workouts: { name: "Больше тренировок", short: "тренировок", emoji: "💪", fmt: (v) => String(Math.round(v)) },
  volume: { name: "Больше тоннаж", short: "т поднято", emoji: "🏋️", fmt: (v) => (v / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) },
  sets: { name: "Больше подходов", short: "подходов", emoji: "🔁", fmt: (v) => String(Math.round(v)) },
  minutes: { name: "Больше минут в зале", short: "минут", emoji: "⏱", fmt: (v) => String(Math.round(v)) },
  logged_days: { name: "Дни с дневником", short: "дней с записями", emoji: "📒", fmt: (v) => String(Math.round(v)) },
  weigh_ins: { name: "Регулярные взвешивания", short: "взвешиваний", emoji: "⚖️", fmt: (v) => String(Math.round(v)) },
};
