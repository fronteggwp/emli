import { createClient } from "@supabase/supabase-js";

// Публичные значения: адрес проекта и publishable-ключ можно хранить в коде,
// доступ к данным ограничен политиками RLS. Секреты сюда класть нельзя.
const URL = import.meta.env.VITE_SUPABASE_URL || "https://ezhgiczvwsufzhwwwrkr.supabase.co";
const KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_PMSMYTNWg25PzxVeh4Y1Vw_kaEADe6w";

// Токен пользователя держим сами (см. auth.tsx): встроенное хранилище сессии
// в WebView Telegram на iOS ненадёжно, и запросы уходили анонимными.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
  // Реалтайм (чаты) тоже должен знать свежий токен
  if (t) void supabase.realtime.setAuth(t);
};

export const supabase = createClient(URL, KEY, {
  accessToken: async () => accessToken ?? KEY,
});
