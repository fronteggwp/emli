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
    const devUser = Number(new URLSearchParams(location.search).get("dev") || 1);
    const tgId = tg?.initDataUnsafe.user?.id ?? (DEV_SECRET ? -devUser : undefined);

    const login = () => {
      if (tg) return exchange({ initData: tg.initData });
      if (DEV_SECRET) return exchange({ devSecret: DEV_SECRET, devUser });
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
        if (alive) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
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
