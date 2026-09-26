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

/** «сейчас», «5 мин», «3 ч», «вчера», «12 сент.» */
export function ago(iso: string) {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "сейчас";
  if (s < 3600) return `${Math.floor(s / 60)} мин`;
  if (s < 86400 && isSameDay(d, new Date())) return `${Math.floor(s / 3600)} ч`;
  if (isSameDay(d, addDays(new Date(), -1))) return "вчера";
  return format(d, d.getFullYear() === new Date().getFullYear() ? "d MMM" : "d MMM yyyy", { locale: ru });
}

export function lastSeenText(iso: string | null | undefined) {
  if (!iso) return "был(а) давно";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 75) return "в сети";
  if (s < 3600) return `был(а) ${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `был(а) ${Math.floor(s / 3600)} ч назад`;
  return `был(а) ${format(new Date(iso), "d MMM", { locale: ru })}`;
}

export const isOnline = (iso: string | null | undefined) => !!iso && Date.now() - new Date(iso).getTime() < 75_000;

export const timeHM = (iso: string) => format(new Date(iso), "HH:mm");

export function daySeparator(iso: string) {
  const d = new Date(iso);
  if (isSameDay(d, new Date())) return "Сегодня";
  if (isSameDay(d, addDays(new Date(), -1))) return "Вчера";
  return format(d, d.getFullYear() === new Date().getFullYear() ? "d MMMM" : "d MMMM yyyy", { locale: ru });
}
