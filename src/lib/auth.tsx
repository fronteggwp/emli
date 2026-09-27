import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setAccessToken, supabase } from "./supabase";
import { tg } from "./telegram";

type AuthState =
  | { status: "loading" }
  | { status: "ready"; uid: string }
  | { status: "outside" }
  | { status: "error"; message: string };

const AuthCtx = createContext<AuthState>({ status: "loading" });

export const useAuth = () => useContext(AuthCtx);

export function useUid() {
  const a = useAuth();
  if (a.status !== "ready") throw new Error("not authenticated");
  return a.uid;
}

const DEV_SECRET = import.meta.env.DEV ? (import.meta.env.VITE_DEV_LOGIN_SECRET as string | undefined) : undefined;
const STORE_KEY = "emli-token";
const DEVICE_KEY = "emli-device";

/** Ключ этого устройства для входа без Telegram (приложение на главном экране) */
type Device = { device: string; tg_id: number };
export function loadDevice(): Device | null {
  try {
    const d = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? "null") as Device | null;
    return d?.device && d.tg_id ? d : null;
  } catch {
    return null;
  }
}
export function saveDevice(d: Device | null) {
  try {
    if (d) localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* ничего */
  }
}

/** Вход подтверждён в боте: запоминаем устройство и токен */
export function completeDeviceLogin(r: { access_token: string; tg_id: number; device: string }) {
  saveDevice({ device: r.device, tg_id: r.tg_id });
  const claims = decode(r.access_token);
  saveCached({ access_token: r.access_token, uid: claims.sub, exp: claims.exp, tg_id: r.tg_id });
}

type Token = { access_token: string; uid: string; exp: number; tg_id: number };

function decode(jwt: string): { sub: string; exp: number } {
  const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "=")));
}

function loadCached(tgId: number): Token | null {
  try {
    const t = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Token | null;
    if (t && t.tg_id === tgId && t.exp - Date.now() / 1000 > 600) return t;
  } catch {
    /* хранилище недоступно — просто войдём заново */
  }
  return null;
}

function saveCached(t: Token) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(t));
  } catch {
    /* не критично */
  }
}

let inflight: Promise<Token> | null = null;

/** Обмен подписанных данных Telegram (или тестового ключа) на токен Supabase — не больше одного запроса за раз */
function exchange(body: Record<string, unknown>): Promise<Token> {
  if (!inflight) inflight = doExchange(body).finally(() => (inflight = null));
  return inflight;
}

async function doExchange(body: Record<string, unknown>): Promise<Token> {
  setAccessToken(null);
  const { data, error } = await supabase.functions.invoke("tg-auth", { body });
  if (error || !data?.access_token) {
    let detail = error?.message ?? "auth failed";
    try {
      const ctx = (error as { context?: Response })?.context;
      if (ctx) detail = (await ctx.json()).error ?? detail;
    } catch {
      /* тело ответа не JSON */
    }
    throw new Error(detail);
  }
  const claims = decode(data.access_token);
  return { access_token: data.access_token, uid: claims.sub, exp: claims.exp, tg_id: data.tg_id };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const devParam = new URLSearchParams(location.search).get("dev");
    const devUser = Number(devParam || 1);
    const useDev = !!DEV_SECRET && devParam != null;
    const device = tg ? null : loadDevice();
    const tgId = tg?.initDataUnsafe.user?.id ?? (useDev ? -devUser : device?.tg_id);

    const login = () => {
      if (tg) return exchange({ initData: tg.initData });
      if (useDev) return exchange({ devSecret: DEV_SECRET, devUser });
      if (device) return exchange({ device: device.device });
      return null;
    };

    const apply = (t: Token) => {
      setAccessToken(t.access_token);
      saveCached(t);
      // Обновляем токен заранее, за 5 минут до истечения
      window.clearTimeout(timer);
      const ms = Math.max((t.exp - Date.now() / 1000 - 300) * 1000, 30_000);
      timer = window.setTimeout(async () => {
        try {
          const next = await login();
          if (next && alive) apply(next);
        } catch {
          /* повторим при следующем открытии */
        }
      }, ms);
    };

    (async () => {
      try {
        if (tgId === undefined) {
          if (alive) setState({ status: "outside" });
          return;
        }
        const cached = loadCached(tgId);
        const t = cached ?? (await login());
        if (!t) {
          if (alive) setState({ status: "outside" });
          return;
        }
        apply(t);
        if (alive) setState({ status: "ready", uid: t.uid });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Устройство отключили (или аккаунт удалён) — войти заново
        if (message === "device_revoked") {
          saveDevice(null);
          if (alive) setState({ status: "outside" });
          return;
        }
        if (alive) setState({ status: "error", message });
      }
    })();

    // Вернулись в приложение после долгого перерыва — проверяем, не протух ли токен
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || tgId === undefined) return;
      if (loadCached(tgId)) return;
      try {
        const t = await login();
        if (t && alive) apply(t);
      } catch {
        /* покажем ошибку при следующем запросе */
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}

/** После удаления аккаунта: забываем токен на устройстве */
export function forgetSession() {
  setAccessToken(null);
  try {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(DEVICE_KEY);
    localStorage.removeItem("emli-workout");
  } catch {
    /* ничего */
  }
}

/** Выход на этом устройстве: отзываем его ключ на сервере */
export async function revokeThisDevice() {
  const d = loadDevice();
  if (!d) return;
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(d.device));
    const hash = Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
    await supabase.from("device_sessions").delete().eq("secret_hash", hash);
  } catch {
    /* ключ всё равно забудем локально */
  }
}
