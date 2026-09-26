// Бот Emli: вебхук Telegram (/start → кнопка открытия приложения) и разовая настройка бота.
const cors = { "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://fronteggwp.github.io/emli/";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const ADMIN_SECRET = Deno.env.get("ADMIN_SECRET") ?? "";

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
    allowed_updates: ["message"],
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
  const msg = update?.message;
  if (msg?.chat?.id && typeof msg.text === "string") {
    if (msg.text.startsWith("/start")) {
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
