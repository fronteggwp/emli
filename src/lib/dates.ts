import { addDays, differenceInCalendarDays, format, isSameDay, parseISO, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale";

export const toKey = (d: Date) => format(d, "yyyy-MM-dd");
export const fromKey = (k: string) => parseISO(k);
export const todayKey = () => toKey(new Date());
export const shiftKey = (k: string, days: number) => toKey(addDays(fromKey(k), days));
export const daysBetween = (a: string, b: string) => differenceInCalendarDays(fromKey(b), fromKey(a));
export const weekStart = (k: string) => toKey(startOfWeek(fromKey(k), { weekStartsOn: 1 }));

export const fmt = (k: string, pattern: string) => format(fromKey(k), pattern, { locale: ru });

export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** «Сегодня», «Вчера», «Завтра» или «пн, 22 сент.» */
export function dayTitle(k: string) {
  const d = fromKey(k);
  const now = new Date();
  if (isSameDay(d, now)) return "Сегодня";
  if (isSameDay(d, addDays(now, -1))) return "Вчера";
  if (isSameDay(d, addDays(now, 1))) return "Завтра";
  return format(d, "EEEEEE, d MMM", { locale: ru });
}

export function rangeKeys(from: string, to: string) {
  const out: string[] = [];
  for (let k = from; k <= to; k = shiftKey(k, 1)) out.push(k);
  return out;
}

export function ageFrom(birth: string | null) {
  if (!birth) return 30;
  return Math.floor(daysBetween(birth, todayKey()) / 365.25);
}
