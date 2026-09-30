// Тонкая обёртка над Telegram WebApp API. Вне Telegram всё безопасно превращается в no-op.
import { sfx } from "./sound";

type Inset = { top: number; bottom: number; left: number; right: number };

interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; photo_url?: string }; start_param?: string };
  platform: string;
  version: string;
  colorScheme: "light" | "dark";
  isVersionAtLeast(v: string): boolean;
  ready(): void;
  expand(): void;
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  setBottomBarColor?(c: string): void;
  safeAreaInset?: Inset;
  contentSafeAreaInset?: Inset;
  HapticFeedback?: {
    impactOccurred(s: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(t: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  onEvent(e: string, cb: () => void): void;
  offEvent(e: string, cb: () => void): void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
  showConfirm?(msg: string, cb: (ok: boolean) => void): void;
  addToHomeScreen?(): void;
  close?(): void;
  checkHomeScreenStatus?(cb: (status: "unsupported" | "unknown" | "added" | "missed") => void): void;
  CloudStorage?: {
    getItem(key: string, cb: (err: string | null, value?: string) => void): void;
    setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

const raw = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
/** WebApp, только если мы действительно внутри Telegram */
export const tg: TgWebApp | null = raw && raw.initData ? raw : null;
export const inTelegram = !!tg;

export const can = (v: string) => !!tg && tg.isVersionAtLeast(v);

/** Облачное хранилище Telegram (общее для всех устройств человека); вне Telegram — только localStorage */
export function cloudGet(key: string): Promise<string | null> {
  const local = () => {
    try {
      return localStorage.getItem(`emli-cloud:${key}`);
    } catch {
      return null;
    }
  };
  if (!tg?.CloudStorage || !can("6.9")) return Promise.resolve(local());
  return new Promise((res) => {
    const t = setTimeout(() => res(local()), 1500);
    tg!.CloudStorage!.getItem(key, (err, value) => {
      clearTimeout(t);
      res(err ? local() : value || local());
    });
  });
}
export function cloudSet(key: string, value: string) {
  try {
    localStorage.setItem(`emli-cloud:${key}`, value);
  } catch {
    /* приватный режим — не страшно */
  }
  if (tg?.CloudStorage && can("6.9")) tg.CloudStorage.setItem(key, value);
}

export function initTelegram() {
  applySafeArea();
  if (!tg) return;
  tg.ready();
  tg.expand();
  if (can("7.7")) tg.disableVerticalSwipes?.();
  if (can("8.0") && (tg.platform === "ios" || tg.platform === "android")) {
    try {
      tg.requestFullscreen?.();
    } catch {
      /* старые клиенты */
    }
  }
  paintChrome(getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0b0b0e");
  tg.onEvent("safeAreaChanged", applySafeArea);
  tg.onEvent("contentSafeAreaChanged", applySafeArea);
  tg.onEvent("fullscreenChanged", applySafeArea);
}

export function paintChrome(color: string) {
  if (!tg) return;
  if (can("6.1")) {
    tg.setHeaderColor?.(color);
    tg.setBackgroundColor?.(color);
  }
  if (can("7.10")) tg.setBottomBarColor?.(color);
}

/** Сводим отступы Telegram и iOS в две переменные: --sat (сверху) и --sab (снизу) */
function applySafeArea() {
  const root = document.documentElement;
  if (tg && can("8.0")) {
    const s = tg.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const c = tg.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
    root.style.setProperty("--sat", `${s.top + c.top}px`);
    root.style.setProperty("--sab", `${Math.max(s.bottom + c.bottom, 8)}px`);
  } else {
    root.style.setProperty("--sat", "env(safe-area-inset-top, 0px)");
    root.style.setProperty("--sab", "max(env(safe-area-inset-bottom, 0px), 8px)");
  }
}

// ───────────── Вибрация
// В Telegram — его отклик. Вне Telegram на iPhone (iOS 18+) — через системный переключатель
// (<input switch>: нажатие на него даёт лёгкий «тик»), на Android — navigator.vibrate.

type Feel = "light" | "soft" | "medium" | "rigid" | "heavy" | "select" | "success" | "warning" | "error";
const HAPTICS_KEY = "emli-haptics";

export function hapticsOn() {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setHapticsOn(on: boolean) {
  try {
    localStorage.setItem(HAPTICS_KEY, on ? "on" : "off");
  } catch {
    /* ничего */
  }
}

let switchLabel: HTMLLabelElement | null = null;
function iosTick() {
  if (!switchLabel) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.id = "emli-haptic";
    input.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;left:-10px;top:-10px";
    switchLabel = document.createElement("label");
    switchLabel.htmlFor = input.id;
    switchLabel.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;left:-10px;top:-10px";
    document.body.append(input, switchLabel);
  }
  switchLabel.click();
}
const isIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const PATTERN: Record<Feel, number[]> = {
  light: [0],
  soft: [0],
  select: [0],
  medium: [0],
  rigid: [0],
  heavy: [0, 60],
  success: [0, 110],
  warning: [0, 140],
  error: [0, 90, 180],
};

/** Только вибрация, без звука */
export function vibrate(kind: Feel) {
  if (!hapticsOn()) return;
  const h = tg?.HapticFeedback;
  if (h) {
    if (kind === "select") h.selectionChanged();
    else if (kind === "success" || kind === "warning" || kind === "error") h.notificationOccurred(kind);
    else h.impactOccurred(kind);
    return;
  }
  try {
    if (isIOS) PATTERN[kind].forEach((ms) => setTimeout(iosTick, ms));
    else navigator.vibrate?.(kind === "heavy" || kind === "error" ? [18, 40, 18] : kind === "success" ? [12, 60, 12] : 10);
  } catch {
    /* нет вибромотора */
  }
}

/** Вибрация + мягкий звук к каждому виду отклика */
export const haptic = {
  tap: () => (vibrate("light"), sfx.tap()),
  soft: () => (vibrate("soft"), sfx.pop()),
  medium: () => (vibrate("medium"), sfx.pop()),
  rigid: () => (vibrate("rigid"), sfx.swipe()),
  heavy: () => (vibrate("heavy"), sfx.thump()),
  select: () => (vibrate("select"), sfx.tick()),
  success: () => (vibrate("success"), sfx.success()),
  warning: () => (vibrate("warning"), sfx.error()),
  error: () => (vibrate("error"), sfx.error()),
};

export function confirmDialog(message: string): Promise<boolean> {
  if (tg?.showConfirm && can("6.2")) return new Promise((res) => tg!.showConfirm!(message, res));
  return Promise.resolve(window.confirm(message));
}
