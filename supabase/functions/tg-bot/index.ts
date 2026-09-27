// Бот Emli: вебхук Telegram (/start → кнопка открытия приложения), подтверждение входа
// в приложение на главном экране и разовая настройка бота.
import { createClient } from "npm:@supabase/supabase-js@2";
const cors = { "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://fronteggwp.github.io/emli/";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const ADMIN_SECRET = Deno.env.get("ADMIN_SECRET") ?? "";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** /start login_<код> — просим подтвердить вход кнопкой */
async function askLogin(chatId: number, code: string) {
  const { data: r } = await admin.from("login_requests").select("created_at,confirmed_at").eq("code", code).maybeSingle();
  if (!r || r.confirmed_at || Date.now() - new Date(r.created_at).getTime() > 15 * 60_000) {
    await tg("sendMessage", { chat_id: chatId, text: "Ссылка для входа устарела. Нажми «Войти через Telegram» в приложении ещё раз." });
    return;
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      "🔐 Вход в Emli на главном экране\n\n" +
      `Код: ${code.slice(0, 4).toUpperCase()} — он должен совпадать с кодом в приложении.\n\n` +
      "Подтверждай, только если ты сам только что нажал «Войти» в Emli. Никому не пересылай это сообщение.",
    reply_markup: { inline_keyboard: [[{ text: "✅ Подтвердить вход", callback_data: `login:${code}` }]] },
  });
}

/** Нажали «Подтвердить вход» */
async function confirmLogin(q: { id: string; from: { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean }; message?: { chat: { id: number }; message_id: number } }, code: string) {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data } = q.from.is_bot
    ? { data: null }
    : await admin
        .from("login_requests")
        .update({
          confirmed_tg: q.from.id,
          tg_first_name: q.from.first_name ?? "",
          tg_last_name: q.from.last_name ?? null,
          tg_username: q.from.username ?? null,
          confirmed_at: new Date().toISOString(),
        })
        .eq("code", code)
        .is("confirmed_at", null)
        .gte("created_at", since)
        .select("id");
  const ok = !!data?.length;
  await tg("answerCallbackQuery", { callback_query_id: q.id, text: ok ? "Готово! Возвращайся в Emli" : "Ссылка устарела — начни вход заново" });
  if (q.message)
    await tg("editMessageText", {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      text: ok ? "✅ Вход подтверждён. Возвращайся в Emli на главном экране." : "⌛️ Ссылка для входа устарела.",
    });
}

async function tg(method: string, payload: Record<string, unknown> = {}) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

const openButton = (text = "Открыть Emli", hash = "") => ({
  inline_keyboard: [[{ text, web_app: { url: hash ? `${APP_URL}?${hash}` : APP_URL } }]],
});

const WELCOME =
  "Привет! Я Emli 🌿 — дневник питания прямо в Telegram.\n\n" +
  "• Считаю калории и БЖУ под твою цель\n" +
  "• База продуктов на русском и сканер штрихкодов\n" +
  "• Тренд веса и реальный расход энергии\n\n" +
  "Жми кнопку ниже, чтобы начать 👇";

async function setup(selfUrl: string) {
  const out: Record<string, unknown> = {};
  out.webhook = await tg("setWebhook", {
    url: selfUrl,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  out.menu = await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "Открыть", web_app: { url: APP_URL } } });
  out.commands = await tg("setMyCommands", { commands: [{ command: "start", description: "Открыть Emli" }] });
  // Описания не трогаем, если владелец уже задал их в BotFather
  const desc = await tg("getMyDescription");
  if (!desc?.result?.description) {
    out.description = await tg("setMyDescription", {
      description: "Emli — дневник питания: калории, БЖУ, вес и прогресс к цели. Нажми «Открыть», чтобы начать.",
    });
  }
  const short = await tg("getMyShortDescription");
  if (!short?.result?.short_description) {
    out.short = await tg("setMyShortDescription", { short_description: "Дневник питания: калории, БЖУ и вес 🌿" });
  }
  return out;
}

Deno.serve(async (req) => {
  if (!TOKEN) return json({ error: "bot_token_missing" }, 500);
  const url = new URL(req.url);

  if (url.searchParams.has("setup")) {
    if (!ADMIN_SECRET || req.headers.get("x-admin-secret") !== ADMIN_SECRET) return json({ error: "forbidden" }, 403);
    const self = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tg-bot`;
    return json(await setup(self));
  }

  if (!WEBHOOK_SECRET || req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  const update = await req.json().catch(() => null);
  const cq = update?.callback_query;
  if (cq?.data?.startsWith("login:")) {
    await confirmLogin(cq, cq.data.slice(6));
    return json({ ok: true });
  }
  const msg = update?.message;
  if (msg?.chat?.id && typeof msg.text === "string") {
    const login = msg.text.match(/^\/start login_([a-f0-9]{24})$/)?.[1];
    if (login) {
      await askLogin(msg.chat.id, login);
    } else if (msg.text.startsWith("/start")) {
      // Ссылка-приглашение: t.me/<бот>?start=ref_<код>
      const ref = msg.text.split(" ")[1]?.match(/^ref_([a-f0-9]{6,32})$/)?.[1];
      const text = ref
        ? "Тебя пригласили в Emli 🌿 Открой приложение — и вы с другом сразу окажетесь в друзьях.\n\n" + WELCOME
        : WELCOME;
      await tg("sendMessage", {
        chat_id: msg.chat.id,
        text,
        reply_markup: openButton(ref ? "Открыть и добавить друга" : "Открыть Emli", ref ? `ref=${ref}` : ""),
      });
    } else {
      await tg("sendMessage", {
        chat_id: msg.chat.id,
        text: "Всё самое интересное — в приложении 👇",
        reply_markup: openButton(),
      });
    }
  }
  return json({ ok: true });
});
