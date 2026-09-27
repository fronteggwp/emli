// Тема оформления: тёмная, светлая или как в Telegram. Выбор хранится на устройстве.
import { paintChrome, tg } from "./telegram";

export type ThemePref = "dark" | "light" | "auto";
const KEY = "emli-theme";
const listeners = new Set<() => void>();

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "auto" || v === "dark") return v;
  } catch {
    /* приватный режим */
  }
  return "dark";
}

function systemScheme(): "dark" | "light" {
  if (tg?.colorScheme) return tg.colorScheme;
  return matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolvedTheme(): "dark" | "light" {
  const p = getThemePref();
  return p === "auto" ? systemScheme() : p;
}

function apply() {
  const t = resolvedTheme();
  const root = document.documentElement;
  if (root.dataset.theme !== t) root.dataset.theme = t;
  paintChrome(t === "light" ? "#f2f2f7" : "#0b0b0e");
  listeners.forEach((l) => l());
}

export function setThemePref(p: ThemePref) {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* ничего */
  }
  // Плавная смена цветов только в момент переключения
  const root = document.documentElement;
  root.classList.add("theme-anim");
  apply();
  setTimeout(() => root.classList.remove("theme-anim"), 450);
}

export function onThemeChange(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function initTheme() {
  apply();
  tg?.onEvent("themeChanged", () => getThemePref() === "auto" && apply());
  matchMedia?.("(prefers-color-scheme: light)").addEventListener?.("change", () => getThemePref() === "auto" && apply());
}
