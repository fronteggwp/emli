// План питания с ИИ. Модель только выбирает блюда из присланного списка и раскладывает их по дням;
// порции, КБЖУ, заготовки и покупки считает приложение (src/lib/mealplan.ts).
//  mode "plan" — меню на несколько дней; mode "swap" — 3 замены для одного блюда.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const AI_KEY = Deno.env.get("AI_API_KEY") ?? "";
const AI_BASE = Deno.env.get("AI_BASE_URL") ?? "";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "deepseek-v4.1-flash";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const LIMITS: Record<string, number> = { plan: 12, swap: 80 };

/** Рассуждения выключены (thinking: disabled); запас токенов — на случай, если модель всё же начнёт рассуждать */
const REASONING_ROOM = 1000;

/** Запрос к ИИ сжимаем gzip: несжатые запросы из Supabase к агрегатору идут до 20+ с, сжатые — 2–3 с */
async function gzipJson(value: unknown) {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function chat(messages: unknown[], maxTokens: number, temperature: number) {
  const res = await fetch(`${AI_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json", "Content-Encoding": "gzip" },
    body: await gzipJson({ model: AI_MODEL, thinking: { type: "disabled" }, temperature, max_tokens: maxTokens + REASONING_ROOM, enable_thinking: false, messages }),
    signal: AbortSignal.timeout(110_000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.choices) throw new Error(`ai ${res.status}: ${JSON.stringify(j?.error?.message ?? j).slice(0, 200)}`);
  const text: string = j.choices[0].message?.content ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("ai: не JSON");
  return JSON.parse(m[0]);
}

const SYSTEM =
  "Ты — шеф-повар и нутрициолог приложения Emli. Составляешь реалистичное домашнее меню только из присланного списка блюд. " +
  "Думаешь о том, как человек реально живёт: готовит заранее, ест остатки, хочет разнообразия и простоты в будни. " +
  "Отвечаешь строго JSON на русском, без пояснений вне JSON.";

const MEAL_NAMES = ["завтрак", "обед", "ужин", "перекус"];
const COOK_TEXT: Record<string, string> = {
  daily: "готовит каждый день свежее; остатки ужина можно доесть на следующий день",
  every2: "готовит примерно через день: одно блюдо на 2 дня",
  batch: "готовит 2–3 раза в неделю большими партиями: одно блюдо закрывает 2–3 приёма (например, обеды пн–ср)",
};

type Cand = { c: string; t: string; k: string; min: number | null; s: number; kcal: number; p: number; f?: number; cb?: number; tags?: string; fav?: boolean; meals?: string };
type Day = { d: number; label: string; weekend: boolean; kcal: number; protein: number; fat?: number; carbs?: number };

/** Белок на 100 ккал — главный показатель «белковости» блюда */
const p100 = (c: Cand) => (c.kcal > 0 ? Math.round((c.p / c.kcal) * 1000) / 10 : 0);

const clip = (s: unknown, n: number) => String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, n);
const candLine = (c: Cand) =>
  [c.c, clip(c.t, 60), clip(c.k, 12), c.min ? `${c.min}м` : "", `${c.s}п`, `${Math.round(c.kcal)}ккал Б${Math.round(c.p)} Ж${Math.round(c.f ?? 0)} У${Math.round(c.cb ?? 0)}`, `Б/100ккал ${p100(c)}`, clip(c.tags, 60) + (c.fav ? " ♥" : "") + (c.meals ? ` [${clip(c.meals, 30)}]` : "")].join(" | ");

/** Насколько белковым должно быть меню: сколько белка на 100 ккал нужно в среднем */
function proteinRule(days: Day[]) {
  const k = days.reduce((a, d) => a + d.kcal, 0);
  const p = days.reduce((a, d) => a + d.protein, 0);
  if (!k || !p) return "";
  const need = Math.round((p / k) * 1000) / 10;
  const share = Math.round(((p * 4) / k) * 100);
  return need >= 8
    ? `БЕЛОК — главный приоритет: нужно в среднем ${need} г белка на 100 ккал (${share}% калорий из белка), это очень белковое меню. Основу делай из блюд с Б/100ккал ≥ ${Math.max(7, Math.round(need - 2))}; блюда с Б/100ккал < 5 (крупы, выпечка, сладкое) — только небольшим дополнением.`
    : `Белок: в среднем ${need} г на 100 ккал (${share}% калорий) — держи основу меню из блюд с Б/100ккал не ниже ${Math.max(4, Math.round(need - 1))}.`;
}

function context(body: Record<string, unknown>) {
  const p = (body.prefs ?? {}) as Record<string, unknown>;
  const meals = (Array.isArray(p.meals) ? p.meals : [0, 1, 2, 3]).filter((m) => [0, 1, 2, 3].includes(Number(m))).map(Number);
  const lines = [
    `Приёмы пищи в плане: ${meals.map((m) => `${m} — ${MEAL_NAMES[m]}`).join(", ")}.`,
    `Готовка: ${COOK_TEXT[String(p.cook)] ?? COOK_TEXT.every2}.`,
    Number(p.time) > 0 ? `В будни у плиты не больше ${Number(p.time)} мин за раз; в выходные можно дольше.` : "Время готовки не ограничено.",
    Number(p.people) > 1 ? `Готовит на семью из ${Number(p.people)} человек — блюда должны подходить всем, без экзотики для одного.` : "",
    Array.isArray(p.exclude) && p.exclude.length ? `Исключено (уже отфильтровано, но учитывай в духе меню): ${p.exclude.map((x) => clip(x, 30)).join(", ")}.` : "",
    Array.isArray(p.style) && p.style.length ? `Стиль: ${p.style.map((x) => clip(x, 120)).join("; ")}.` : "",
    p.wishes ? `ПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ — главный источник правды, выполняй их буквально: «${clip(p.wishes, 400)}»` : "",
  ];
  return { meals, text: lines.filter(Boolean).join("\n") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const t0 = Date.now();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = await admin.auth.getUser(token);
  const uid = auth?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);
  if (!AI_KEY || !AI_BASE) return json({ error: "ai_not_configured" }, 500);

  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "swap" ? "swap" : "plan";
  const kind = `plan-${mode}`;
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("kind", kind).gte("created_at", since);
  if ((count ?? 0) >= LIMITS[mode]) return json({ error: "limit", limit: LIMITS[mode] }, 429);

  const cands: Cand[] = (Array.isArray(body.cands) ? body.cands : []).slice(0, 400);
  const codes = new Set(cands.map((c) => String(c.c)));
  if (cands.length < 3) return json({ error: "few_dishes" }, 400);
  const { meals, text } = context(body);
  const list = cands.map(candLine).join("\n");
  const log = (ok: boolean) => admin.from("ai_usage").insert({ user_id: uid, kind, ms: Date.now() - t0, ok });

  try {
    if (mode === "plan") {
      const days: Day[] = (Array.isArray(body.days) ? body.days : []).slice(0, 14);
      if (!days.length) return json({ error: "bad_request" }, 400);
      const keep = (Array.isArray(body.keep) ? body.keep : []).slice(0, 80) as { d: number; m: number; t: string }[];
      // Сколько разных блюд, которые надо готовить (не «простое» и не до 10 минут), помещается в ритм человека
      const cookMode = String((body.prefs as Record<string, unknown>)?.cook ?? "every2");
      const n = days.length;
      const maxCooked = cookMode === "daily" ? n * 2 : cookMode === "batch" ? Math.ceil(n * 0.8) + 1 : n + 1;
      const prompt = [
        `Составь меню на ${days.length} дн.`,
        "Дни (цель на весь день; порции мы подгоним сами, ±40%):",
        ...days.map(
          (d) =>
            `${d.d}) ${clip(d.label, 20)}${d.weekend ? " (выходной)" : ""} — ${Math.round(d.kcal)} ккал, Б ${Math.round(d.protein)} г${d.fat ? `, Ж ${Math.round(d.fat)} г` : ""}${d.carbs ? `, У ${Math.round(d.carbs)} г` : ""}`,
        ),
        proteinRule(days),
        text,
        keep.length ? `Уже зафиксировано — эти приёмы НЕ заполняй, но учитывай для разнообразия:\n${keep.map((k) => `д${k.d} ${MEAL_NAMES[k.m] ?? ""}: ${clip(k.t, 60)}`).join("\n")}` : "",
        "",
        "Блюда (код | название | тип | время | порций в рецепте | ккал и белок на 1 порцию | метки [подходящие приёмы]):",
        list,
        "",
        "Правила:",
        "- Только коды из списка. Каждый выбранный приём пищи каждого дня должен быть заполнен.",
        "- Завтрак — завтраки и простые блюда; перекус — простые блюда, перекусы, иногда полезный десерт; обед и ужин — горячее, суп, салат, гарнир, простые обеды.",
        "- В приёме 1–2 блюда. Второе — только если первое лёгкое: горячее + гарнир/салат, суп + салат. Гарнир без основного блюда не ставь.",
        "- Калории дня близки к цели, белок — не меньше цели: в каждом основном приёме есть источник белка. Смотри на «Б/100ккал» блюда, а не только на граммы белка.",
        "- Если цель по жирам или углеводам низкая — жирные блюда (сливки, жареное, сыр, орехи) и крупные гарниры ставь реже и в паре с нежирным белком.",
        "- Заготовки: блюдо, приготовленное в день N, можно есть в дни N+1 и N+2 — для таких приёмов ставь \"cook\": false. Не больше 3 приёмов одного блюда подряд. Простые блюда (метка «простое») собираются каждый раз, для них cook: true.",
        "- Долгие рецепты — на выходные или в день заготовки.",
        `- ВАЖНО: разных блюд, которые нужно готовить (не «простое» и дольше 10 минут), за весь план — не больше ${maxCooked}. Разнообразие делай за счёт простых блюд, гарниров и салатов, а не новых сложных рецептов.`,
        "- Завтраки и перекусы — в основном простые блюда или быстрые до 10 минут; если завтрак готовится (сырники, запеканка) — готовь сразу на 2–3 дня.",
        "- Разнообразие: чередуй белок по дням (курица, рыба, говядина/индейка, яйца/творог, бобовые), не повторяй один завтрак больше 2 дней подряд.",
        "- Отмеченные ♥ — любимые блюда пользователя, ставь их охотнее.",
        "- Если в пожеланиях сказано, что какой-то приём человек ест не дома (гости, ресторан, праздник, командировка), НЕ ставь блюда в этот приём, а добавь его в \"skip\".",
        "- note пиши на «ты», дружелюбно и коротко.",
        "",
        'Ответ: {"note":"1–2 тёплых предложения на «ты»: как устроено меню — когда готовим, что заготавливаем, на что обратить внимание","slots":[{"d":1,"m":0,"r":"код","cook":true}],"skip":[{"d":5,"m":2}]}',
        "d — номер дня, m — приём: 0 завтрак, 1 обед, 2 ужин, 3 перекус.",
      ]
        .filter((x) => x !== "")
        .join("\n");
      const out = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], 3500, 0.5);
      const slots = (Array.isArray(out.slots) ? out.slots : [])
        .map((s: Record<string, unknown>) => ({ d: Number(s.d), m: Number(s.m), r: String(s.r ?? ""), cook: s.cook !== false }))
        .filter((s: { d: number; m: number; r: string }) => codes.has(s.r) && s.d >= 1 && s.d <= days.length && meals.includes(s.m));
      const skip = (Array.isArray(out.skip) ? out.skip : [])
        .map((s: Record<string, unknown>) => ({ d: Number(s.d), m: Number(s.m) }))
        .filter((s: { d: number; m: number }) => s.d >= 1 && s.d <= days.length && meals.includes(s.m));
      await log(true);
      return json({ note: typeof out.note === "string" ? clip(out.note, 400) : null, slots, skip, ms: Date.now() - t0 });
    }

    // Замены для одного блюда
    const slot = (body.slot ?? {}) as { label?: string; m?: number; cur?: string; kcal?: number; protein?: number };
    const menu = (Array.isArray(body.menu) ? body.menu : []).slice(0, 60).map((x: unknown) => clip(x, 60));
    const prompt = [
      `Предложи 3 замены для блюда «${clip(slot.cur, 80)}» — ${clip(slot.label, 30)}, ${MEAL_NAMES[Number(slot.m)] ?? "приём пищи"}, порция пользователя ≈ ${Math.round(Number(slot.kcal) || 0)} ккал, белок ≈ ${Math.round(Number(slot.protein) || 0)} г.`,
      menu.length ? `Остальное меню (избегай повторов): ${menu.join("; ")}.` : "",
      text,
      "",
      "Блюда (код | название | тип | время | порций | ккал и белок на порцию | метки):",
      list,
      "",
      "Правила: подходит к этому приёму пищи; по белку не хуже; три разных по характеру варианта (например: попроще, поинтереснее, полегче). Не предлагай само заменяемое блюдо.",
      'Ответ: {"options":[{"r":"код","why":"почему это хорошая замена — до 60 символов"}]}',
    ]
      .filter((x) => x !== "")
      .join("\n");
    const out = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], 400, 0.7);
    const options = (Array.isArray(out.options) ? out.options : [])
      .map((o: Record<string, unknown>) => ({ r: String(o.r ?? ""), why: clip(o.why, 90) }))
      .filter((o: { r: string }) => codes.has(o.r))
      .slice(0, 3);
    await log(true);
    return json({ options, ms: Date.now() - t0 });
  } catch (e) {
    await log(false);
    console.error(e);
    return json({ error: "failed" }, 502);
  }
});
