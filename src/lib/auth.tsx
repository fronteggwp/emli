import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
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

async function exchange(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("tg-auth", { body });
  if (error || !data?.access_token) throw new Error(error?.message ?? "auth failed");
  const { data: s, error: e2 } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (e2 || !s.user) throw new Error(e2?.message ?? "session failed");
  return s.user.id;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tgId = tg?.initDataUnsafe.user?.id;
        const devUser = Number(new URLSearchParams(location.search).get("dev") || 1);
        const expectedTg = tgId ?? (DEV_SECRET ? -devUser : undefined);

        const { data } = await supabase.auth.getSession();
        const cached = data.session?.user;
        if (cached && expectedTg !== undefined && cached.user_metadata?.tg_id === expectedTg) {
          if (alive) setState({ status: "ready", uid: cached.id });
          return;
        }
        if (cached) await supabase.auth.signOut({ scope: "local" });

        let uid: string;
        if (tg) uid = await exchange({ initData: tg.initData });
        else if (DEV_SECRET) uid = await exchange({ devSecret: DEV_SECRET, devUser });
        else {
          if (alive) setState({ status: "outside" });
          return;
        }
        if (alive) setState({ status: "ready", uid });
      } catch (e) {
        if (alive) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}
