// Вход через Telegram Mini App: проверяем подпись initData токеном бота,
// создаём/находим пользователя и выдаём обычную сессию Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const enc = new TextEncoder();

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };

async function verifyInitData(initData: string, botToken: string): Promise<TgUser | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = await hmac(enc.encode("WebAppData"), botToken);
  if (!safeEqual(toHex(await hmac(secret, dataCheck)), hash)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > 7 * 86400) return null;
  const user = JSON.parse(params.get("user") ?? "null");
  return user?.id ? user : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const devSecret = Deno.env.get("DEV_LOGIN_SECRET");

  let body: { initData?: string; devSecret?: string; devUser?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  let tgUser: TgUser | null = null;
  if (body.initData) {
    if (!botToken) return json({ error: "bot_token_missing" }, 500);
    tgUser = await verifyInitData(body.initData, botToken);
  } else if (devSecret && body.devSecret && safeEqual(body.devSecret, devSecret)) {
    // Тестовый вход для разработки в браузере: отрицательные id не пересекаются с Telegram.
    const n = Math.max(1, Math.min(99, Number(body.devUser) || 1));
    tgUser = { id: -n, first_name: `Тестер ${n}`, username: `tester${n}` };
  }
  if (!tgUser) return json({ error: "invalid_init_data" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `tg${tgUser.id}@users.forma.app`;

  const { data: existing } = await admin.from("profiles").select("id").eq("tg_id", tgUser.id).maybeSingle();

  if (!existing) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { tg_id: tgUser.id },
    });
    if (created.error && created.error.code !== "email_exists") {
      return json({ error: "create_user", detail: created.error.message }, 500);
    }
  }

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data.user) return json({ error: "link", detail: link.error?.message }, 500);
  const uid = link.data.user.id;

  if (!existing) {
    const profile = {
      id: uid,
      tg_id: tgUser.id,
      first_name: tgUser.first_name ?? "",
      last_name: tgUser.last_name ?? null,
      username: tgUser.username?.toLowerCase() ?? null,
      avatar_url: tgUser.photo_url ?? null,
    };
    let ins = await admin.from("profiles").upsert(profile, { onConflict: "id" });
    if (ins.error?.code === "23505") {
      // username уже занят — оставляем пустым, пользователь выберет сам
      ins = await admin.from("profiles").upsert({ ...profile, username: null }, { onConflict: "id" });
    }
    if (ins.error) return json({ error: "profile", detail: ins.error.message }, 500);
    await admin.from("user_settings").upsert({ user_id: uid }, { onConflict: "user_id", ignoreDuplicates: true });
  } else if (tgUser.photo_url) {
    // Аватар из Telegram обновляем, только если пользователь не ставил свой
    await admin.from("profiles").update({ avatar_url: tgUser.photo_url })
      .eq("id", uid).or("avatar_url.is.null,avatar_url.like.https://t.me/%");
  }

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const verified = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (verified.error || !verified.data.session) return json({ error: "verify", detail: verified.error?.message }, 500);

  const s = verified.data.session;
  return json({ access_token: s.access_token, refresh_token: s.refresh_token, tg_id: tgUser.id });
});
