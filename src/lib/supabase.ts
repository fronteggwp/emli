import { createClient } from "@supabase/supabase-js";

// Публичные значения: адрес проекта и publishable-ключ можно хранить в коде,
// доступ к данным ограничен политиками RLS. Секреты сюда класть нельзя.
const URL = import.meta.env.VITE_SUPABASE_URL || "https://ezhgiczvwsufzhwwwrkr.supabase.co";
const KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_PMSMYTNWg25PzxVeh4Y1Vw_kaEADe6w";

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "emli-auth", detectSessionInUrl: false },
});
