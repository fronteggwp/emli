// Вход в Emli.
// 1) Внутри Telegram: проверяем подпись initData токеном бота.
// 2) Вне Telegram (приложение на главном экране): вход подтверждается в боте,
//    после чего устройство получает свой ключ и дальше входит им.
// В обоих случаях создаём/находим пользователя и выдаём обычную сессию Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const enc = new TextEncoder();
const BOT_USERNAME = "myemli_bot";

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
const randomHex = (bytes: number) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

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

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** Находит или создаёт пользователя и выдаёт ему сессию */
async function sessionFor(tgUser: TgUser) {
  const email = `tg${tgUser.id}@users.forma.app`;
  const { data: existing } = await admin.from("profiles").select("id").eq("tg_id", tgUser.id).maybeSingle();

  if (!existing) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { tg_id: tgUser.id } });
    if (created.error && created.error.code !== "email_exists") throw new Error(`create_user: ${created.error.message}`);
  }

  // Первый generateLink нужен, чтобы узнать id пользователя
  const first = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (first.error || !first.data.user) throw new Error(`link: ${first.error?.message}`);
  const uid = first.data.user.id;

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
    if (ins.error) throw new Error(`profile: ${ins.error.message}`);
    await admin.from("user_settings").upsert({ user_id: uid }, { onConflict: "user_id", ignoreDuplicates: true });
  } else if (tgUser.photo_url) {
    // Аватар из Telegram обновляем, только если пользователь не ставил свой
    await admin.from("profiles").update({ avatar_url: tgUser.photo_url })
      .eq("id", uid).or("avatar_url.is.null,avatar_url.like.https://t.me/%");
  }

  // Параллельные входы одного пользователя перебивают друг другу одноразовую ссылку —
  // поэтому при неудаче генерируем новую и пробуем ещё раз
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let verified = await anon.auth.verifyOtp({ type: "magiclink", token_hash: first.data.properties.hashed_token });
  for (let attempt = 0; attempt < 3 && (verified.error || !verified.data.session); attempt++) {
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 350));
    const again = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (again.error) continue;
    verified = await anon.auth.verifyOtp({ type: "magiclink", token_hash: again.data.properties.hashed_token });
  }
  if (verified.error || !verified.data.session) throw new Error(`verify: ${verified.error?.message}`);
  return { uid, session: verified.data.session };
}

type Body = {
  initData?: string;
  devSecret?: string;
  devUser?: number;
  action?: "login_start" | "login_poll";
  id?: string;
  secret?: string;
  device?: string;
  label?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const devSecret = Deno.env.get("DEV_LOGIN_SECRET");

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  try {
    // ── Вход вне Telegram, шаг 1: создаём запрос, устройство запоминает секрет
    if (body.action === "login_start") {
      const secret = randomHex(32);
      const code = randomHex(12);
      const { data, error } = await admin
        .from("login_requests")
        .insert({ code, secret_hash: await sha256(secret) })
        .select("id")
        .single();
      if (error) return json({ error: "start", detail: error.message }, 500);
      // Короткий код для сверки: его же покажет бот
      const check = code.slice(0, 4).toUpperCase();
      return json({ id: data.id, secret, check, link: `https://t.me/${BOT_USERNAME}?start=login_${code}`, tgLink: `tg://resolve?domain=${BOT_USERNAME}&start=login_${code}` });
    }

    // ── Шаг 2: устройство спрашивает, подтвердили ли вход в боте
    if (body.action === "login_poll") {
      if (!body.id || !body.secret) return json({ error: "bad_request" }, 400);
      const { data: r } = await admin.from("login_requests").select("*").eq("id", body.id).maybeSingle();
      if (!r || !safeEqual(r.secret_hash, await sha256(body.secret))) return json({ error: "not_found" }, 404);
      if (Date.now() - new Date(r.created_at).getTime() > 15 * 60_000) return json({ status: "expired" });
      if (r.consumed_at) return json({ status: "expired" });
      if (!r.confirmed_tg) return json({ status: "pending" });
      // Одноразово: помечаем использованным до выдачи сессии
      const { data: took } = await admin
        .from("login_requests")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", r.id)
        .is("consumed_at", null)
        .select("id");
      if (!took?.length) return json({ status: "expired" });
      const tgUser: TgUser = { id: r.confirmed_tg, first_name: r.tg_first_name ?? "", last_name: r.tg_last_name ?? undefined, username: r.tg_username ?? undefined };
      const { uid, session } = await sessionFor(tgUser);
      const device = randomHex(32);
      await admin.from("device_sessions").insert({ user_id: uid, tg_id: tgUser.id, secret_hash: await sha256(device), label: body.label?.slice(0, 80) ?? null });
      return json({ status: "ok", access_token: session.access_token, tg_id: tgUser.id, device });
    }

    // ── Повторный вход с устройства по его ключу
    if (body.device) {
      const hash = await sha256(body.device);
      const { data: d } = await admin.from("device_sessions").select("id,tg_id").eq("secret_hash", hash).maybeSingle();
      if (!d) return json({ error: "device_revoked" }, 401);
      await admin.from("device_sessions").update({ last_used: new Date().toISOString() }).eq("id", d.id);
      const { session } = await sessionFor({ id: d.tg_id });
      return json({ access_token: session.access_token, tg_id: d.tg_id });
    }

    // ── Внутри Telegram или тестовый вход
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
    const { session } = await sessionFor(tgUser);
    return json({ access_token: session.access_token, refresh_token: session.refresh_token, tg_id: tgUser.id });
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
