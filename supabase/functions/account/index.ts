// Аккаунт: выгрузка всех данных (файлы приходят в чат с ботом) и удаление аккаунта.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Таблица → колонка владельца
const TABLES: [string, string][] = [
  ["profiles", "id"],
  ["user_settings", "user_id"],
  ["goals", "user_id"],
  ["targets", "user_id"],
  ["weights", "user_id"],
  ["food_entries", "user_id"],
  ["foods", "owner_id"],
  ["cheat_plans", "user_id"],
  ["meal_templates", "user_id"],
  ["user_recipes", "user_id"],
  ["favorites", "user_id"],
  ["routines", "user_id"],
  ["workouts", "user_id"],
  ["workout_sets", "user_id"],
  ["custom_exercises", "user_id"],
  ["posts", "author_id"],
  ["achievements", "user_id"],
  ["reminders", "user_id"],
];

async function all(table: string, col: string, uid: string) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select("*").eq(col, uid).range(from, from + 999);
    if (error || !data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function csv(rows: Record<string, unknown>[], cols: [string, string][]) {
  // ; и BOM — чтобы Excel открыл по-русски без мастера импорта
  const lines = [cols.map((c) => c[1]).join(";"), ...rows.map((r) => cols.map(([k]) => csvCell(r[k])).join(";"))];
  return "﻿" + lines.join("\n");
}

async function sendDoc(chat: number, name: string, body: string, type: string, caption?: string) {
  const form = new FormData();
  form.append("chat_id", String(chat));
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([body], { type }), name);
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, { method: "POST", body: form });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = await admin.auth.getUser(token);
  const uid = auth?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);
  const { action } = await req.json().catch(() => ({}));
  const { data: me } = await admin.from("profiles").select("tg_id").eq("id", uid).maybeSingle();

  if (action === "export") {
    if (!me?.tg_id || me.tg_id < 0) return json({ error: "no_telegram" }, 400);
    const data: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const [t, c] of TABLES) data[t] = await all(t, c, uid);
    const day = new Date().toISOString().slice(0, 10);
    const entries = (data.food_entries as Record<string, unknown>[]).sort((a, b) =>
      String(a.day).localeCompare(String(b.day)) || Number(a.meal) - Number(b.meal),
    );
    const MEALS = ["Завтрак", "Обед", "Ужин", "Перекус"];
    const ok1 = await sendDoc(
      me.tg_id,
      `emli-дневник-${day}.csv`,
      csv(
        entries.map((e) => ({ ...e, meal: MEALS[Number(e.meal)] ?? e.meal })),
        [["day", "Дата"], ["meal", "Приём"], ["name", "Продукт"], ["brand", "Бренд"], ["grams", "Граммы"], ["kcal", "Ккал"], ["protein", "Белки"], ["fat", "Жиры"], ["carbs", "Углеводы"]],
      ),
      "text/csv",
      "📦 Твои данные из Emli: дневник питания, вес и полный архив",
    );
    const weights = (data.weights as Record<string, unknown>[]).sort((a, b) => String(a.day).localeCompare(String(b.day)));
    await sendDoc(me.tg_id, `emli-вес-${day}.csv`, csv(weights, [["day", "Дата"], ["weight_kg", "Вес, кг"], ["body_fat", "Жир, %"]]), "text/csv");
    await sendDoc(me.tg_id, `emli-архив-${day}.json`, JSON.stringify(data, null, 2), "application/json");
    return json({ ok: ok1 });
  }

  if (action === "delete") {
    // Фото и аватар в хранилище
    const { data: files } = await admin.storage.from("media").list(uid, { limit: 1000 });
    if (files?.length) await admin.storage.from("media").remove(files.map((f) => `${uid}/${f.name}`));
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "action" }, 400);
});
