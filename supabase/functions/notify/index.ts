// Пуш-уведомления в Telegram от бота. Вызывается триггерами базы (pg_net) с общим секретом.
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://fronteggwp.github.io/emli/";
const SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Profile = { id: string; tg_id: number; first_name: string; last_name: string | null; last_seen: string | null };

async function profile(id: string) {
  const { data } = await admin.from("profiles").select("id,tg_id,first_name,last_name,last_seen").eq("id", id).maybeSingle();
  return data as Profile | null;
}

const nameOf = (p: Profile | null) => (p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || "Кто-то" : "Кто-то");
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
/** Если человек прямо сейчас в приложении — пуш не нужен */
const isOnline = (p: Profile) => !!p.last_seen && Date.now() - new Date(p.last_seen).getTime() < 40_000;

async function send(to: Profile, text: string, link: string) {
  if (!to.tg_id || to.tg_id < 0 || isOnline(to)) return { skipped: true };
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: to.tg_id,
      text,
      disable_notification: false,
      reply_markup: { inline_keyboard: [[{ text: "Открыть", web_app: { url: `${APP_URL}?${link}` } }]] },
    }),
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-notify-secret") !== SECRET) return json({ error: "forbidden" }, 403);
  const { table, record } = await req.json();

  if (table === "messages") {
    const { data: conv } = await admin.from("conversations").select("user_a,user_b").eq("id", record.conversation_id).single();
    if (!conv) return json({ skipped: "no_conv" });
    const toId = conv.user_a === record.sender_id ? conv.user_b : conv.user_a;
    // Серия сообщений подряд — уведомляем только о первом
    const since = new Date(new Date(record.created_at).getTime() - 90_000).toISOString();
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", record.conversation_id)
      .eq("sender_id", record.sender_id)
      .gte("created_at", since)
      .neq("id", record.id);
    if ((count ?? 0) > 0) return json({ skipped: "burst" });
    const [to, from] = await Promise.all([profile(toId), profile(record.sender_id)]);
    if (!to) return json({ skipped: "no_user" });
    const body = record.text ? clip(record.text, 300) : "📷 Фото";
    return json(await send(to, `💬 ${nameOf(from)}:\n${body}`, `chat=${record.conversation_id}`));
  }

  if (table === "notifications") {
    if (record.kind === "like") {
      // Лайки не присылаем чаще раза в 10 минут — только в приложении
      const since = new Date(Date.now() - 600_000).toISOString();
      const { count } = await admin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", record.user_id)
        .eq("kind", "like")
        .gte("created_at", since)
        .neq("id", record.id);
      if ((count ?? 0) > 0) return json({ skipped: "likes_throttled" });
    }
    const [to, actor] = await Promise.all([profile(record.user_id), profile(record.actor_id)]);
    if (!to) return json({ skipped: "no_user" });
    const who = nameOf(actor);
    const texts: Record<string, [string, string]> = {
      friend_request: [`👋 ${who} хочет добавить тебя в друзья`, "friends"],
      friend_accept: [`🤝 ${who} теперь у тебя в друзьях`, `user=${record.actor_id}`],
      like: [`❤️ ${who} оценил твою запись`, `post=${record.post_id}`],
      comment: [`💬 ${who} прокомментировал твою запись:\n«${clip(record.preview ?? "", 200)}»`, `post=${record.post_id}`],
      challenge: [`🏆 ${who} зовёт тебя в челлендж «${clip(record.preview ?? "", 60)}»`, `challenge=${record.challenge_id}`],
    };
    const t = texts[record.kind];
    if (!t) return json({ skipped: "kind" });
    return json(await send(to, t[0], t[1]));
  }

  return json({ skipped: "table" });
});
