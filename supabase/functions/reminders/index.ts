// Напоминания и итоги недели от бота. Вызывается раз в 15 минут из pg_cron (run_reminders) с общим секретом.
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://fronteggwp.github.io/emli/";
const SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Due = { user_id: string; tg_id: number; kind: string; day: string; payload: Record<string, unknown> };
type Summary = {
  from: string;
  to: string;
  days_logged: number;
  avg_kcal: number | null;
  avg_protein: number | null;
  target_kcal: number | null;
  target_protein: number | null;
  days_on_target: number;
  weight_avg: number | null;
  weight_prev_avg: number | null;
  weigh_ins: number;
  workouts: number;
  workouts_prev: number;
  volume: number;
  prs: number;
  minutes: number;
  streak: number;
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const num = (v: number, d = 0) => v.toLocaleString("ru-RU", { maximumFractionDigits: d, minimumFractionDigits: d });
const dayMonth = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

const MEAL_TEXT = [
  ["🍳 Доброе утро! Завтрак ещё не записан.", "☕️ Не забудь внести завтрак — это займёт 10 секунд."],
  ["🥗 Как прошёл обед? Запиши его, пока помнишь.", "🍲 Обед ещё не в дневнике — добавим?"],
  ["🍽 Ужин ещё не записан.", "🌙 Запиши ужин, чтобы день был полным."],
];

/** Совет по итогам недели — такой же, как в приложении */
export function weeklyAdvice(s: Summary): string {
  if (s.days_logged < 4) return "Записывай еду хотя бы 5 дней в неделю — тогда расчёт расхода калорий станет точным.";
  if (s.target_protein && s.avg_protein && s.avg_protein < s.target_protein * 0.8)
    return `Белка маловато: ${s.avg_protein} г из ${s.target_protein}. Добавь творог, яйца, курицу или рыбу в каждый приём пищи.`;
  if (s.target_kcal && s.avg_kcal && s.avg_kcal > s.target_kcal * 1.1)
    return "Калорий заметно больше цели. Попробуй планировать ужин заранее и держать под рукой белковые перекусы.";
  if (s.target_kcal && s.avg_kcal && s.avg_kcal < s.target_kcal * 0.85)
    return "Ты ешь заметно меньше цели — это тормозит восстановление и может сорвать прогресс. Добавь 1 перекус в день.";
  if (!s.workouts) return "На этой неделе не было тренировок. Даже 2 коротких занятия по 30 минут дадут результат.";
  if (s.workouts > s.workouts_prev) return "Тренировок больше, чем неделей раньше — так держать! 💪";
  return "Отличная неделя! Продолжай в том же темпе — стабильность решает всё.";
}

function weeklyText(s: Summary) {
  const lines = [`📊 Итоги недели · ${dayMonth(s.from)} — ${dayMonth(s.to)}`, ""];
  if (s.days_logged) {
    lines.push(`🍽 Питание: записано ${s.days_logged} из 7 дней`);
    if (s.avg_kcal != null)
      lines.push(
        s.target_kcal
          ? `В среднем ${num(s.avg_kcal)} ккал при цели ${num(s.target_kcal)} — ${s.days_on_target} ${plural(s.days_on_target, "день", "дня", "дней")} в норме`
          : `В среднем ${num(s.avg_kcal)} ккал в день`,
      );
    if (s.avg_protein != null) lines.push(`Белок: ${s.avg_protein} г в день${s.target_protein ? ` (цель ${s.target_protein})` : ""}`);
    lines.push("");
  }
  if (s.weight_avg != null) {
    let w = `⚖️ Вес: ${num(s.weight_avg, 1)} кг в среднем`;
    if (s.weight_prev_avg != null) {
      const d = s.weight_avg - s.weight_prev_avg;
      w += Math.abs(d) < 0.05 ? ", без изменений" : `, ${d > 0 ? "+" : "−"}${num(Math.abs(d), 1)} кг к прошлой неделе`;
    }
    lines.push(w, "");
  }
  if (s.workouts) {
    let t = `💪 Тренировки: ${s.workouts}`;
    if (s.workouts_prev) t += ` (неделей раньше ${s.workouts_prev})`;
    t += ` · ${num(s.minutes)} мин`;
    if (s.volume) t += ` · ${num(s.volume / 1000, 1)} т`;
    lines.push(t);
    if (s.prs) lines.push(`🏆 Новых рекордов: ${s.prs}`);
    lines.push("");
  }
  if (s.streak >= 2) lines.push(`🔥 Серия: ${s.streak} ${plural(s.streak, "день", "дня", "дней")} подряд`, "");
  lines.push(`💡 ${weeklyAdvice(s)}`);
  return lines.join("\n");
}

function compose(r: Due): [string, string, string] | null {
  if (r.kind.startsWith("meal")) {
    const m = Number(r.payload.meal ?? 0);
    return [pick(MEAL_TEXT[m] ?? MEAL_TEXT[0]), "Записать", `add=${m}`];
  }
  if (r.kind === "workout") {
    const label = typeof r.payload.label === "string" && r.payload.label ? `\n${r.payload.label}` : "";
    return [`💪 Сегодня по плану тренировка!${label}`, "Начать тренировку", "workout"];
  }
  if (r.kind === "weigh") return ["⚖️ Взвесься натощак — так тренд веса будет точнее.", "Записать вес", "weigh"];
  if (r.kind === "streak") {
    const n = Number(r.payload.streak ?? 0);
    return [
      `🔥 Серия ${n} ${plural(n, "день", "дня", "дней")} под угрозой! Запиши хоть один приём пищи сегодня, чтобы её сохранить.`,
      "Спасти серию",
      "add=",
    ];
  }
  if (r.kind === "weekly") {
    const s = r.payload as unknown as Summary;
    if (!s.days_logged && !s.workouts && !s.weigh_ins) return null;
    return [weeklyText(s), "Открыть итоги", "week"];
  }
  return null;
}

async function send(chatId: number, text: string, button: string, link: string) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: [[{ text: button, web_app: { url: `${APP_URL}?${link}` } }]] },
    }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-notify-secret") !== SECRET) return json({ error: "forbidden" }, 403);
  const { data, error } = await admin.rpc("due_reminders");
  if (error) return json({ error: error.message }, 500);
  let sent = 0;
  for (const r of (data ?? []) as Due[]) {
    // Сначала отмечаем — повторный запуск не пришлёт дубль
    const { data: ins } = await admin
      .from("reminder_log")
      .upsert({ user_id: r.user_id, kind: r.kind, day: r.day }, { onConflict: "user_id,kind,day", ignoreDuplicates: true })
      .select("user_id");
    if (!ins?.length) continue;
    const msg = compose(r);
    if (!msg) continue;
    if (await send(r.tg_id, ...msg)) sent++;
  }
  return json({ due: data?.length ?? 0, sent });
});
