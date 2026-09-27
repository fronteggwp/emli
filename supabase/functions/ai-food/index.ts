// Распознавание еды по фото (мини-харнес):
//  1) модель раскладывает фото на продукты с граммовкой и своей оценкой КБЖУ на 100 г;
//  2) каждый продукт ищем в базе Emli (продукты + рецепты) — берём кандидатов;
//  3) второй быстрый запрос выбирает точное совпадение из кандидатов (или «нет»);
//  4) КБЖУ считаем сами: граммы × данные базы; нет в базе — оценка модели с пометкой.
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
const APP_URL = Deno.env.get("APP_URL") ?? "https://fronteggwp.github.io/emli/";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const DAILY_LIMIT = 40;

type Per100 = [number, number, number, number];
type Seen = { name: string; search: string; grams: number; per100: Per100; confidence?: number };
type Candidate = { key: string; food_id: string | null; name: string; brand: string | null; per100: Per100; kind: "food" | "recipe" };

async function chat(messages: unknown[], maxTokens: number) {
  const res = await fetch(`${AI_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: AI_MODEL, thinking: { type: "disabled" }, temperature: 0.1, max_tokens: maxTokens, messages }),
    signal: AbortSignal.timeout(45_000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.choices) throw new Error(`ai ${res.status}: ${JSON.stringify(j?.error?.message ?? j).slice(0, 200)}`);
  const text: string = j.choices[0].message?.content ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("ai: не JSON");
  return JSON.parse(m[0]);
}

const SYSTEM = "Ты опытный нутрициолог и эксперт по распознаванию еды на фото. Всегда отвечай строго на русском языке и только JSON без пояснений.";

const SEE_PROMPT = `Разбери фото еды на отдельные продукты и оцени вес каждого в граммах — в том виде, как он лежит (готовый).
Правила:
- Составное блюдо раскладывай на части, если части видны отдельно (мясо, гарнир, овощи, соус, хлеб). Однородное блюдо (суп, салат, каша, сырники, омлет) — одним продуктом.
- Вес оценивай по размеру: обычная тарелка ≈ 26 см, глубокая тарелка супа ≈ 300 г, столовая ложка ≈ 15 г, ломтик хлеба ≈ 30 г, куриное яйцо ≈ 55 г.
- Видимое масло, соус, заправку, сметану — отдельным продуктом.
- name — точное русское название с состоянием («рис отварной», «куриная грудка жареная»).
- search — 1–2 слова для поиска в базе продуктов («рис отварной», «грудка», «сметана»).
- per100 — твоя оценка [ккал, белки, жиры, углеводы] на 100 г.
- confidence — уверенность 0–1.
Ответ: {"dish":"общее название","items":[{"name":"","search":"","grams":0,"per100":[0,0,0,0],"confidence":0.8}],"comment":"одна фраза, что видно"}
Если еды на фото нет: {"dish":null,"items":[],"comment":"..."}`;

// ── Рецепты Emli — готовые блюда с точным КБЖУ (грузим один раз)
let recipesCache: { id: string; title: string; per100: Per100 }[] | null = null;
async function recipes() {
  if (recipesCache) return recipesCache;
  try {
    const list = (await (await fetch(`${APP_URL}recipes.json`)).json()) as { id: string; title: string; serving: { kcal: number; protein: number; fat: number; carbs: number; grams: number } }[];
    recipesCache = list
      .filter((r) => r.serving.grams > 0)
      .map((r) => {
        const k = 100 / r.serving.grams;
        return { id: r.id, title: r.title, per100: [r.serving.kcal * k, r.serving.protein * k, r.serving.fat * k, r.serving.carbs * k].map((v) => Math.round(v * 10) / 10) as Per100 };
      });
  } catch {
    recipesCache = [];
  }
  return recipesCache;
}
const words = (s: string) => s.toLowerCase().replace(/ё/g, "е").split(/[^а-яa-z0-9]+/).filter((w) => w.length >= 3);
const stem = (w: string) => (w.length > 5 ? w.slice(0, w.length - 2) : w);

async function candidatesFor(item: Seen, userClient: ReturnType<typeof createClient>): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const q of [...new Set([item.search, item.name, item.search.split(" ")[0]].filter((x) => x && x.length >= 2))]) {
    const { data } = await userClient.rpc("search_foods", { q, lim: 6 });
    for (const f of (data ?? []) as { id: string; name: string; brand: string | null; kcal: number; protein: number; fat: number; carbs: number }[]) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ key: "", food_id: f.id, name: f.name, brand: f.brand, per100: [+f.kcal, +f.protein, +f.fat, +f.carbs], kind: "food" });
    }
    if (out.length >= 6) break;
  }
  // Рецепты: по совпадению основ слов
  const iw = words(`${item.name} ${item.search}`).map(stem);
  const rs = (await recipes())
    .map((r) => ({ r, score: words(r.title).map(stem).filter((w) => iw.some((x) => x.startsWith(w) || w.startsWith(x))).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  for (const { r } of rs) out.push({ key: "", food_id: null, name: `${r.title} (рецепт Emli)`, brand: null, per100: r.per100, kind: "recipe" });
  return out.slice(0, 8);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const t0 = Date.now();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = await admin.auth.getUser(token);
  const uid = auth?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);
  if (!AI_KEY || !AI_BASE) return json({ error: "ai_not_configured" }, 500);

  // Лимит запросов в сутки
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: "limit", limit: DAILY_LIMIT }, 429);

  const body = await req.json().catch(() => ({}));
  const image: string = body.image ?? "";
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 2_500_000) return json({ error: "bad_image" }, 400);
  const hint = typeof body.hint === "string" ? body.hint.slice(0, 200) : "";

  const log = (ok: boolean) => admin.from("ai_usage").insert({ user_id: uid, kind: "food-photo", ms: Date.now() - t0, ok });
  try {
    // 1) Что на фото
    const seen = await chat(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: SEE_PROMPT + (hint ? `\nПодсказка пользователя: ${hint}` : "") },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      900,
    );
    const items: Seen[] = (Array.isArray(seen.items) ? seen.items : [])
      .filter((i: Seen) => i && i.name && Number(i.grams) > 0)
      .slice(0, 10)
      .map((i: Seen) => ({
        name: String(i.name).slice(0, 80),
        search: String(i.search || i.name).slice(0, 40),
        grams: Math.round(Math.min(2000, Number(i.grams))),
        per100: (Array.isArray(i.per100) ? i.per100 : [0, 0, 0, 0]).slice(0, 4).map((v: number) => Math.max(0, Number(v) || 0)) as Per100,
        confidence: Number(i.confidence) || 0.5,
      }));
    const tSee = Date.now() - t0;
    if (!items.length) {
      await log(true);
      return json({ dish: seen.dish ?? null, comment: seen.comment ?? "Еды на фото не видно", items: [], total: { kcal: 0, protein: 0, fat: 0, carbs: 0 }, ms: { see: tSee, total: Date.now() - t0 } });
    }

    // 2) Кандидаты из базы
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const cands = await Promise.all(items.map((i) => candidatesFor(i, userClient)));
    cands.forEach((list, i) => list.forEach((c, j) => (c.key = `${i + 1}.${j + 1}`)));
    const tSearchAt = Date.now();
    const tSearch = tSearchAt - t0;

    // 3) Выбор совпадений одним быстрым запросом
    let choices: (string | null)[] = items.map(() => null);
    if (cands.some((c) => c.length)) {
      const table = items
        .map((it, i) =>
          [
            `Продукт ${i + 1}: «${it.name}», ~${it.grams} г, оценка на 100 г: ${it.per100.join("/")}`,
            ...(cands[i].length ? cands[i].map((c) => `  ${c.key}) ${c.name}${c.brand ? ` (${c.brand})` : ""} — ${c.per100.join("/")}`) : ["  (кандидатов нет)"]),
          ].join("\n"),
        )
        .join("\n");
      const pick = await chat(
        [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content:
              `Для каждого продукта выбери из кандидатов базы тот, что соответствует ему по сути: тот же продукт в том же состоянии ` +
              `(варёный/жареный/сырой), похожая калорийность. Если подходящего нет — null. Числа: ккал/белки/жиры/углеводы на 100 г.\n\n${table}\n\n` +
              `Ответ: {"choices":["1.2", null, ...]} — ровно ${items.length} значений по порядку продуктов.`,
          },
        ],
        300,
      );
      if (Array.isArray(pick.choices)) choices = items.map((_, i) => (typeof pick.choices[i] === "string" ? pick.choices[i] : null));
    }

    // 4) Считаем КБЖУ сами
    const result = items.map((it, i) => {
      const c = cands[i].find((x) => x.key === choices[i]) ?? null;
      // Защита от явной ошибки выбора: калорийность отличается больше чем в 2,5 раза — не доверяем
      const sane = c && it.per100[0] > 0 ? c.per100[0] / it.per100[0] < 2.5 && it.per100[0] / Math.max(c.per100[0], 1) < 2.5 : !!c;
      const per100 = c && sane ? c.per100 : it.per100;
      const k = it.grams / 100;
      return {
        name: it.name,
        grams: it.grams,
        confidence: it.confidence,
        source: c && sane ? c.kind : "ai",
        food_id: c && sane ? c.food_id : null,
        matched: c && sane ? c.name : null,
        per100,
        kcal: Math.round(per100[0] * k),
        protein: Math.round(per100[1] * k * 10) / 10,
        fat: Math.round(per100[2] * k * 10) / 10,
        carbs: Math.round(per100[3] * k * 10) / 10,
      };
    });
    const total = result.reduce(
      (a, r) => ({ kcal: a.kcal + r.kcal, protein: a.protein + r.protein, fat: a.fat + r.fat, carbs: a.carbs + r.carbs }),
      { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    );
    await log(true);
    return json({
      dish: seen.dish ?? null,
      comment: seen.comment ?? null,
      items: result,
      total: { kcal: Math.round(total.kcal), protein: Math.round(total.protein), fat: Math.round(total.fat), carbs: Math.round(total.carbs) },
      ms: { see: tSee, search: tSearch - tSee, pick: Date.now() - tSearchAt, total: Date.now() - t0 },
    });
  } catch (e) {
    await log(false);
    return json({ error: "ai_failed", detail: e instanceof Error ? e.message : String(e) }, 502);
  }
});
