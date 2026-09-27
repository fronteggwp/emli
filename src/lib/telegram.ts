// Тонкая обёртка над Telegram WebApp API. Вне Telegram всё безопасно превращается в no-op.

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

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred("light"),
  soft: () => tg?.HapticFeedback?.impactOccurred("soft"),
  medium: () => tg?.HapticFeedback?.impactOccurred("medium"),
  rigid: () => tg?.HapticFeedback?.impactOccurred("rigid"),
  heavy: () => tg?.HapticFeedback?.impactOccurred("heavy"),
  select: () => tg?.HapticFeedback?.selectionChanged(),
  success: () => tg?.HapticFeedback?.notificationOccurred("success"),
  warning: () => tg?.HapticFeedback?.notificationOccurred("warning"),
  error: () => tg?.HapticFeedback?.notificationOccurred("error"),
};

export function confirmDialog(message: string): Promise<boolean> {
  if (tg?.showConfirm && can("6.2")) return new Promise((res) => tg!.showConfirm!(message, res));
  return Promise.resolve(window.confirm(message));
}
