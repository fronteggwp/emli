// Распознавание еды по фото (мини-харнес):
//  1) модель смотрит фото и раскладывает блюдо на продукты с граммовкой и своей оценкой КБЖУ на 100 г;
//  2) продукты ищем в тех же базах, что поиск в приложении (справочник Emli + база товаров), готовые блюда не берём;
//  3) вторая модель видит выдачу, при необходимости ищет ещё раз другими словами и сама выбирает вариант
//     (или пересчитывает с сухого/сырого продукта);
//  4) КБЖУ считаем сами: граммы × данные базы; не нашлось — оценка модели с пометкой.
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
// Фото распознаёт отдельная модель: в сравнении на 10 блюдах gemini-3.8-flash без рассуждений — стабильная точность
// (ошибка ~13%, от прогона к прогону почти не меняется) и 5–11 с. Запасная (AI_VISION_BACKUP) подключается,
// если основная молчит дольше HEDGE_MS или упала; пустая строка — без запасной.
const VISION_MODEL = Deno.env.get("AI_VISION_MODEL") ?? "gemini-3.8-flash";
const VISION_BACKUP = Deno.env.get("AI_VISION_BACKUP") ?? "";
const HEDGE_MS = 10_000;
/** Поставщик gemini на агрегаторе не скачивает фото по ссылке (модель не видит картинку и выдумывает блюдо) — ей фото внутри запроса */
const inlineImage = (model: string) => model.startsWith("gemini");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const DAILY_LIMIT = 40;

type Per100 = [number, number, number, number];
type Seen = { name: string; search: string; grams: number; per100: Per100; confidence?: number; separate?: boolean };
type Candidate = { key: string; food_id: string | null; name: string; brand: string | null; per100: Per100; kind: "food" | "product" };

/** Рассуждения выключены (thinking: disabled); запас токенов — на случай, если модель всё же начнёт рассуждать */
const REASONING_ROOM = 1000;

/**
 * Фото для модели — ссылкой, а не внутри запроса: большие запросы из Supabase к агрегатору идут
 * десятки секунд, а подписанную ссылку провайдер скачивает сам за доли секунды.
 */
async function imageLink(dataUrl: string, uid: string) {
  const m = dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) return { url: dataUrl, done: async () => {} };
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const path = `${uid}/${crypto.randomUUID()}.${m[2] === "jpeg" ? "jpg" : m[2]}`;
  const up = await admin.storage.from("ai-tmp").upload(path, bytes, { contentType: m[1] });
  if (up.error) return { url: dataUrl, done: async () => {} };
  const { data } = await admin.storage.from("ai-tmp").createSignedUrl(path, 600);
  if (!data?.signedUrl) return { url: dataUrl, done: async () => void (await admin.storage.from("ai-tmp").remove([path])) };
  return { url: data.signedUrl, done: async () => void (await admin.storage.from("ai-tmp").remove([path])) };
}

/** Запрос к ИИ сжимаем gzip: несжатые запросы из Supabase к агрегатору идут до 20+ с, сжатые — 2–3 с */
async function gzipJson(value: unknown) {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Текст ответа модели. Обычно это один JSON, но некоторые продавцы на агрегаторе отдают поток
 * (строки «data: {...}») даже при stream: false — тогда склеиваем кусочки.
 */
async function replyText(res: Response) {
  const raw = await res.text();
  if (raw.trimStart().startsWith("data:")) {
    let out = "";
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:") || t === "data: [DONE]") continue;
      try {
        const c = JSON.parse(t.slice(5));
        out += c.choices?.[0]?.delta?.content ?? c.choices?.[0]?.message?.content ?? "";
      } catch {
        /* неполная строка */
      }
    }
    return { ok: res.ok && out.length > 0, text: out, error: out ? null : raw.slice(0, 200) };
  }
  let j: { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null = null;
  try {
    j = JSON.parse(raw);
  } catch {
    /* не JSON */
  }
  const text = j?.choices?.[0]?.message?.content ?? "";
  return { ok: res.ok && !!j?.choices, text, error: j?.error?.message ?? (j ? null : raw.slice(0, 200)) };
}

/**
 * Как выключить рассуждения, у каждой модели по-своему. Gemini понимает только reasoning_effort: "none"
 * (thinking/enable_thinking игнорирует и думает ~1000 токенов). Остальным reasoning_effort, наоборот, включает рассуждения.
 */
const noThinking = (model: string) => (model.startsWith("gemini") ? { reasoning_effort: "none" } : { thinking: { type: "disabled" }, enable_thinking: false });

async function chat(messages: unknown[], maxTokens: number, model = AI_MODEL, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(80_000);
  const res = await fetch(`${AI_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json", "Content-Encoding": "gzip" },
    body: await gzipJson({ model, stream: false, ...noThinking(model), temperature: 0.1, max_tokens: maxTokens + REASONING_ROOM, messages }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const reply = await replyText(res);
  if (!reply.ok) throw new Error(`ai ${model} ${res.status}: ${String(reply.error ?? "").slice(0, 200)}`);
  const text = reply.text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`ai ${model}: не JSON`);
  return JSON.parse(m[0]);
}

/** Основная модель; если молчит дольше HEDGE_MS или упала — параллельно запасная. Побеждает первый успешный ответ. */
function hedged<T>(run: (model: string, signal: AbortSignal) => Promise<T>) {
  return new Promise<{ value: T; model: string }>((resolve, reject) => {
    const ctrls: AbortController[] = [];
    let pending = 0;
    let backupStarted = false;
    let lastErr: unknown = null;
    let done = false;
    const timer = setTimeout(() => startBackup(), HEDGE_MS);
    const launch = (model: string) => {
      const c = new AbortController();
      ctrls.push(c);
      pending++;
      run(model, c.signal).then(
        (value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          ctrls.forEach((x) => x !== c && x.abort());
          resolve({ value, model });
        },
        (e) => {
          pending--;
          lastErr = e;
          if (done) return;
          if (!backupStarted) startBackup();
          else if (pending === 0) (done = true), reject(lastErr);
        },
      );
    };
    function startBackup() {
      clearTimeout(timer);
      if (done || backupStarted) return;
      backupStarted = true;
      if (VISION_BACKUP && VISION_BACKUP !== VISION_MODEL) launch(VISION_BACKUP);
      else if (pending === 0) (done = true), reject(lastErr);
    }
    launch(VISION_MODEL);
  });
}

const SYSTEM = "Ты опытный нутрициолог и эксперт по распознаванию еды на фото. Всегда отвечай строго на русском языке и только JSON без пояснений.";

// Промпт выбран сравнением 7 вариантов на 11 фото × 3 прогона (gemini-3.8-flash): черновик наблюдений «seen»
// (посуда, штуки, скрытое) + разложение на продукты с простыми названиями, как в базе — чтобы находились в поиске.
const SEE_PROMPT = `Ты оцениваешь еду на фото для дневника питания. Работай в два шага и запиши оба в JSON.
Шаг 1 — "seen": опиши то, что реально видно, до всяких выводов:
  "plate": посуда и её примерный размер (тарелка 20/24/27 см, глубокая миска, пиала, сковорода);
  "pieces": что можно посчитать поштучно и сколько (3 сырника, 12 пельменей, 2 ломтика хлеба);
  "fill": насколько заполнена посуда и высота слоя;
  "hidden": что не видно, но почти наверняка есть (масло для жарки, заправка, сахар в тесте, майонез внутри).
Шаг 2 — "items": переведи увиденное в отдельные продукты с граммами.
- Узнай блюдо. Если его легко спутать (сырники и овощные оладьи, пельмени и вареники, куриная и рыбная котлета), решай по срезу, цвету, начинке и подаче.
- Готовое блюдо разложи на продукты: суп — мясо, овощи, крупа, бульон; салат — ингредиенты и заправка; выпечка и изделия из теста или фарша — сырые ингредиенты, из которых сделана эта порция. Готовое блюдо одним пунктом не пиши.
- Поштучное считай как «штук × вес одной штуки» (сырник 55 г, оладья 45 г, пельмень 13 г, котлета 90 г, яйцо 55 г, ломтик хлеба 30 г).
- Всё из "hidden" обязательно включи отдельным продуктом с реалистичным весом.
- Подача рядом (хлеб, сметана или соус в пиале, варенье, напиток) — отдельными продуктами с "separate": true.
- Названия — простые, как в справочнике калорийности или на упаковке: «макароны варёные», а не «спагетти аль денте»; «мука пшеничная», «огурцы солёные», «масло подсолнечное», «сметана 15%», «фарш свино-говяжий». Без брендов и пояснений в скобках. Мелочь до 5 г (зелень, специи) не пиши.
Добавь в JSON поле "seen" перед "items".
Ответ — только JSON:
{"dish":"название блюда","items":[{"name":"","search":"","grams":0,"per100":[0,0,0,0],"separate":false,"confidence":0.8}],"comment":"одна фраза: что видно на фото"}
- name — продукт с состоянием: «гречка варёная», «куриная грудка жареная», «масло подсолнечное», «творог 5%».
- search — 1–2 слова для поиска в базе продуктов: «гречка варёная», «грудка», «масло подсолнечное».
- per100 — [ккал, белки, жиры, углеводы] на 100 г продукта именно в этом состоянии.
- separate — true, если подано отдельно от блюда (хлеб рядом, соус или сметана в пиале, варенье, напиток).
- confidence — уверенность 0–1.
Если еды на фото нет: {"dish":null,"items":[],"comment":"..."}`;

/** Готовые блюда в базе не ищем: блюдо модель раскладывает на продукты, КБЖУ берём по продуктам */
const DISH_CATEGORIES = new Set(["Готовые блюда", "Салаты"]);
const DISH_NAME = /^(сырники|блины|оладьи|пирож|омлет|вареники|пельмени|котлет|голубц)/i;
const PICK_ROUNDS = 3;

type Food = { id?: string; name: string; brand: string | null; category?: string | null; kcal: number; protein: number; fat: number; carbs: number };
const per100Of = (f: Food): Per100 => [+f.kcal, +f.protein, +f.fat, +f.carbs];

/**
 * Один поисковый запрос — в тех же двух базах, что поиск в приложении:
 * общая база продуктов Emli (справочник: «гречка варёная», «куриная грудка жареная») и
 * база товаров (штрихкоды Emli + Open Food Facts через food-search: «Мука пшеничная, Макфа»).
 */
async function searchBoth(q: string, userClient: ReturnType<typeof createClient>, token: string): Promise<Candidate[]> {
  const local = userClient
    .rpc("search_foods", { q, lim: 10 })
    .then(({ data }) =>
      ((data ?? []) as Food[])
        .filter((f) => !DISH_CATEGORIES.has(f.category ?? "") && !DISH_NAME.test(f.name))
        .slice(0, 7)
        .map((f): Candidate => ({ key: "", food_id: f.id ?? null, name: f.name, brand: f.brand, per100: per100Of(f), kind: "food" })),
    );
  const products = fetch(`${SUPABASE_URL}/functions/v1/food-search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
    signal: AbortSignal.timeout(4000),
  })
    .then((r) => r.json())
    .then((list: Food[]) =>
      Array.isArray(list)
        ? list
            .filter((f) => f.name && f.kcal > 0)
            .slice(0, 8)
            .map((f): Candidate => ({ key: "", food_id: null, name: f.name, brand: f.brand, per100: per100Of(f), kind: "product" }))
        : [],
    )
    .catch(() => [] as Candidate[]);
  const [a, b] = await Promise.all([local.then((x) => x, () => [] as Candidate[]), products]);
  return [...a, ...b];
}

const PICK_PROMPT = `Ты подбираешь продукты из базы для дневника питания. По фото уже определены продукты с весом и примерной оценкой КБЖУ.
Для каждого продукта найди в результатах поиска тот, чьи КБЖУ на 100 г правильно описывают ЭТОТ продукт в ЭТОМ состоянии.

Как выбирать:
- Тот же продукт и то же состояние. Готовое на тарелке (варёное, жареное, запечённое) — готовый вариант. Ингредиенты изделий из теста и фарша (сырники, котлеты, пельмени) — сырой вариант.
- Если есть только сухой или сырой вариант готового продукта — бери его и укажи product_grams: сколько граммов этого продукта ушло на порцию. Варёные крупы и макароны ≈ 0,35–0,4 от готового веса (200 г варёной гречки ≈ 75 г сухой); мясо и рыба при варке и жарке теряют 25–35% (100 г жареной грудки ≈ 140 г сырой). Если брал вариант в том же состоянии — product_grams не пиши.
- Не бери другой продукт (яйцо вместо курицы, огурец свежий вместо солёного), готовое блюдо или смесь вместо ингредиента (салат «Цезарь» вместо соуса), товар с явно ошибочными цифрами (25 ккал у мяса, белок у масла).
- Из нескольких похожих бери типичный: цифры, как у большинства похожих; базовый продукт Emli или обычный магазинный, а не особый (не «лайт», не «протеиновый», если на фото обычный).
- Сверяй цифры с оценкой по фото: вариант с пометкой ⚠ сильно расходится с ней по калориям, белку или жирам — это другой продукт или ошибка в базе, его не бери.
- Нет подходящего — "search" с 1–3 новыми запросами: синоним или проще («куриная грудка» вместо «куриное филе», «рис» вместо «рис басмати варёный», «сметана 15» вместо «сметана домашняя»). Не повторяй прошлые запросы.
- Если после поиска подходящего всё равно нет — "none": тогда останется оценка.
{LAST}
Продукты и результаты поиска (ккал, Б, Ж, У на 100 г):
{TABLE}

Ответ — только JSON, по одному решению на каждый продукт из списка:
{"decisions":[{"item":1,"action":"pick","id":"1.3","why":"коротко почему"},{"item":2,"action":"pick","id":"2.1","product_grams":75,"why":"..."},{"item":3,"action":"search","queries":["..."],"why":"..."},{"item":4,"action":"none","why":"..."}]}`;

type Decision = { item: number; action: "pick" | "search" | "none"; id?: string; product_grams?: number; queries?: string[]; why?: string };

/** КБЖУ на 100 г продукта с тарелки по выбранному варианту; product_grams — сколько граммов сухого/сырого ушло на порцию */
function effective(c: Candidate, d: Decision, it: Seen): Per100 {
  const pg = Number(d.product_grams);
  const factor = pg > 0 ? Math.min(3, Math.max(0.2, pg / it.grams)) : 1;
  return c.per100.map((v) => v * factor) as Per100;
}

/** Страховка от явной подмены: сравниваем с оценкой по фото не только калории, но и белки с жирами */
function plausible(c: Per100, est: Per100) {
  if (!(est[0] > 0)) return true;
  const ratio = (a: number, b: number) => Math.max(a, 1) / Math.max(b, 1);
  const within = (a: number, b: number, lim: number) => ratio(a, b) <= lim && ratio(b, a) <= lim;
  if (!within(c[0], est[0], 1.8)) return false;
  if (Math.max(c[1], est[1]) >= 8 && !within(c[1], est[1], 2.5)) return false;
  if (Math.max(c[2], est[2]) >= 8 && !within(c[2], est[2], 3)) return false;
  return true;
}

/**
 * Подбор продуктов в базе как у человека в поиске: модель видит выдачу, при необходимости ищет ещё
 * (до PICK_ROUNDS кругов, все продукты тарелки — одним запросом за круг) и сама выбирает вариант.
 */
async function pickFromBase(items: Seen[], userClient: ReturnType<typeof createClient>, token: string) {
  const pools: Candidate[][] = items.map(() => []);
  const asked: Set<string>[] = items.map(() => new Set());
  const add = (i: number, list: Candidate[]) => {
    for (const c of list) {
      const id = `${c.name}|${c.brand ?? ""}|${c.per100[0]}`.toLowerCase();
      if (pools[i].some((x) => `${x.name}|${x.brand ?? ""}|${x.per100[0]}`.toLowerCase() === id)) continue;
      pools[i].push({ ...c, key: `${i + 1}.${pools[i].length + 1}` });
    }
  };
  const search = (i: number, queries: string[]) =>
    Promise.all(
      [...new Set(queries.map((q) => String(q).trim().toLowerCase().slice(0, 40)))]
        .filter((q) => q.length >= 2 && !asked[i].has(q))
        .map(async (q) => {
          asked[i].add(q);
          add(i, await searchBoth(q, userClient, token));
        }),
    );
  await Promise.all(items.map((it, i) => search(i, [it.search, it.name])));

  const final: (Decision | null)[] = items.map(() => null);
  const notes: string[] = items.map(() => "");
  let open = items.map((_, i) => i);
  let rounds = 0;
  for (let round = 1; round <= PICK_ROUNDS && open.length; round++) {
    rounds = round;
    const last = round === PICK_ROUNDS;
    const table = open
      .map((i) => {
        const it = items[i];
        const head = `Продукт ${i + 1}: «${it.name}», ${it.grams} г на тарелке; оценка по фото: ${it.per100.map((v) => Math.round(v)).join("/")}; искали: ${[...asked[i]].join(", ")}`;
        const rows = pools[i]
          .slice(0, 24)
          .map((c) => `  ${c.key}) ${c.name}${c.brand ? ` [${c.brand}]` : ""}${c.kind === "food" ? " (база Emli)" : ""} — ${c.per100.map((v) => Math.round(v * 10) / 10).join("/")}${plausible(c.per100, it.per100) ? "" : " ⚠"}`);
        return [head, ...(rows.length ? rows : ["  (ничего не найдено)"])].join("\n");
      })
      .join("\n\n");
    const rule = last
      ? "\nЭто последний круг: \"search\" нельзя — выбери или ответь \"none\".\n"
      : round === 1
        ? "\nЭто первый круг: \"none\" нельзя — если подходящего нет, сделай \"search\" другими словами.\n"
        : "";
    const prompt = PICK_PROMPT.replace("{TABLE}", table).replace("{LAST}", rule);
    let decisions: Decision[] = [];
    try {
      const reply = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], 250 * open.length);
      decisions = Array.isArray(reply.decisions) ? reply.decisions : [];
    } catch {
      break; // выбор не удался — останутся оценки модели по фото
    }
    const again: { i: number; queries: string[] }[] = [];
    const retry: number[] = [];
    for (const i of open) {
      const d = decisions.find((x) => Number(x?.item) === i + 1);
      if (d?.action === "search" && !last && Array.isArray(d.queries) && d.queries.length) {
        again.push({ i, queries: d.queries.slice(0, 3) });
        continue;
      }
      // Выбор, который не проходит страховку, и «ничего не нашла» — возвращаем модели: пусть ищет другими словами
      const c = d?.action === "pick" ? (pools[i].find((x) => x.key === String(d.id)) ?? null) : null;
      const bad = c && !plausible(effective(c, d!, items[i]), items[i].per100);
      if (!last && (bad || !d || d.action === "none")) {
        notes[i] = bad ? `Прошлый выбор «${c!.name}» не подходит: цифры не сходятся с этим продуктом. Найди другой вариант или сделай search.` : "Подходящего пока нет — сделай search другими словами.";
        retry.push(i);
        continue;
      }
      final[i] = d ?? null;
    }
    open = [...again.map((x) => x.i), ...retry];
    await Promise.all(again.map(({ i, queries }) => search(i, queries)));
  }

  const result = items.map((it, i) => {
    const d = final[i];
    const c = d?.action === "pick" ? (pools[i].find((x) => x.key === String(d.id)) ?? null) : null;
    const eff = c ? effective(c, d!, it) : null;
    const factor = c ? eff![0] / Math.max(c.per100[0], 0.01) : 1;
    const ok = !!(c && eff && plausible(eff, it.per100));
    const per100 = ok ? eff! : it.per100;
    const k = it.grams / 100;
    return {
      name: it.name,
      grams: it.grams,
      confidence: it.confidence,
      separate: it.separate ?? false,
      source: ok ? c!.kind : "ai",
      food_id: ok ? c!.food_id : null,
      matched: ok ? c!.name : null,
      brand: ok ? c!.brand : null,
      product_grams: ok && Math.abs(factor - 1) > 0.01 ? Math.round(it.grams * factor) : null,
      note: d?.why ? String(d.why).slice(0, 160) : null,
      rejected: c && !ok ? c.name : null,
      per100: per100.map((v) => Math.round(v * 10) / 10) as Per100,
      kcal: Math.round(per100[0] * k),
      protein: Math.round(per100[1] * k * 10) / 10,
      fat: Math.round(per100[2] * k * 10) / 10,
      carbs: Math.round(per100[3] * k * 10) / 10,
    };
  });
  return { result, rounds, searches: asked.reduce((a, s) => a + s.size, 0) };
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
  const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("kind", "food-photo").gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: "limit", limit: DAILY_LIMIT }, 429);

  const body = await req.json().catch(() => ({}));
  const image: string = body.image ?? "";
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 2_500_000) return json({ error: "bad_image" }, 400);
  const hint = typeof body.hint === "string" ? body.hint.slice(0, 200) : "";

  // Ссылку на фото делаем, только если она нужна хоть одной из моделей
  const link = [VISION_MODEL, VISION_BACKUP].some((m) => m && !inlineImage(m)) ? await imageLink(image, uid) : { url: image, done: async () => {} };
  const log = (ok: boolean) => admin.from("ai_usage").insert({ user_id: uid, kind: "food-photo", ms: Date.now() - t0, ok });
  try {
    // 1) Что на фото
    const { value: seen, model: seenBy } = await hedged((model, signal) => chat(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                SEE_PROMPT +
                (hint
                  ? `\n\nПОДСКАЗКА ПОЛЬЗОВАТЕЛЯ — главный источник правды: если в ней названы продукты, их количество (штуки) или граммы, ` +
                    `используй именно их; по фото уточняй только то, чего в подсказке нет.\nПодсказка: «${hint}»`
                  : ""),
            },
            { type: "image_url", image_url: { url: inlineImage(model) ? image : link.url } },
          ],
        },
      ],
      1500,
      model,
      signal,
    )).finally(() => link.done());
    const items: Seen[] = (Array.isArray(seen.items) ? seen.items : [])
      .filter((i: Seen) => i && i.name && Number(i.grams) > 0)
      .slice(0, 10)
      .map((i: Seen) => ({
        name: String(i.name).slice(0, 80),
        search: String(i.search || i.name).slice(0, 40),
        grams: Math.round(Math.min(2000, Number(i.grams))),
        per100: (Array.isArray(i.per100) ? i.per100 : [0, 0, 0, 0]).slice(0, 4).map((v: number) => Math.max(0, Number(v) || 0)) as Per100,
        confidence: Number(i.confidence) || 0.5,
        separate: i.separate === true,
      }));
    const tSee = Date.now() - t0;
    if (!items.length) {
      await log(true);
      return json({ dish: seen.dish ?? null, comment: seen.comment ?? "Еды на фото не видно", items: [], total: { kcal: 0, protein: 0, fat: 0, carbs: 0 }, ms: { see: tSee, total: Date.now() - t0 }, model: seenBy });
    }

    // 2–3) Поиск продуктов в базе и выбор — моделью, с повторным поиском при необходимости
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const tPickAt = Date.now();
    const { result, rounds, searches } = await pickFromBase(items, userClient, token);
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
      ms: { see: tSee, pick: Date.now() - tPickAt, total: Date.now() - t0 },
      rounds,
      searches,
      model: seenBy,
    });
  } catch (e) {
    await log(false);
    return json({ error: "ai_failed", detail: e instanceof Error ? e.message : String(e) }, 502);
  }
});
