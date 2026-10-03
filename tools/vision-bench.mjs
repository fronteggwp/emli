// Сравнение моделей ИИ по фото на 100 взвешенных блюдах из Nutrition5k (Google, CC-BY 4.0).
//   node tools/vision-bench.mjs                      — модели по умолчанию
//   node tools/vision-bench.mjs kimi-k3,gpt-5.2      — свои модели через запятую
//   node tools/vision-bench.mjs --models             — какие модели есть на агрегаторе
// Ключ и адрес — из .env.local (AI_API_KEY, AI_BASE_URL); в вывод не попадают.
// Цена: укажи в PRICES ниже ($ за 1 млн токенов вход/выход), если агрегатор не присылает usage.cost.
// Промпт — тот же SEE_PROMPT, что в supabase/functions/ai-food (читается из файла), КБЖУ = граммы × per100 модели.
// Это шаг «модель смотрит фото» без поиска по базе: поиск у всех моделей общий и ошибку зрения не исправляет.
import fs from "node:fs";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const envFile = new URL(".env.local", root);
const env = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]))
  : {};
// Ключ можно передать и переменной окружения: AI_API_KEY=… AI_BASE_URL=https://openrouter.ai/api node tools/vision-bench.mjs
const KEY = process.env.AI_API_KEY ?? env.AI_API_KEY;
const BASE = (process.env.AI_BASE_URL ?? env.AI_BASE_URL)?.replace(/\/$/, "");
if (!KEY || !BASE) throw new Error("Нужны AI_API_KEY и AI_BASE_URL (в .env.local или в окружении)");
const OPENROUTER = BASE.includes("openrouter.ai");

if (process.argv[2] === "--models") {
  const j = await (await fetch(`${BASE}/v1/models`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
  const vision = (j.data ?? []).filter((m) => !m.architecture || m.architecture.input_modalities?.includes("image"));
  const price = (m) => (m.pricing ? ` $${(m.pricing.prompt * 1e6).toFixed(2)}/$${(m.pricing.completion * 1e6).toFixed(2)} за 1М` : "");
  console.log(vision.map((m) => m.id + price(m)).sort().join("\n"));
  process.exit(0);
}

const MODELS = process.argv[2]?.split(",") ?? (OPENROUTER ? ["moonshotai/kimi-k3", "anthropic/claude-sonnet-5"] : ["kimi-k3", "claude-sonnet-5"]);
const LIMIT = Number(process.env.N ?? 100);
const PARALLEL = 4;
// $ за 1 млн токенов [вход, выход] — заполнить по прайсу агрегатора, если он не присылает стоимость сам
const PRICES = {};

const src = fs.readFileSync(new URL("supabase/functions/ai-food/index.ts", root), "utf8");
const grab = (name) => src.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`))?.[1] ?? src.match(new RegExp(`const ${name} = "([^"]*)";`))?.[1];
const SYSTEM = grab("SYSTEM");
const SEE_PROMPT = grab("SEE_PROMPT");
if (!SYSTEM || !SEE_PROMPT) throw new Error("Не нашёл SYSTEM/SEE_PROMPT в ai-food");

// Рассуждения выключаем, как в приложении. OpenRouter: reasoning.enabled=false; модели, где выключить нельзя, — минимальные рассуждения.
const noThinking = (model, low) =>
  OPENROUTER
    ? { reasoning: low ? { effort: "low" } : { enabled: false }, usage: { include: true } }
    : model.startsWith("gemini") ? { reasoning_effort: "none" } : { thinking: { type: "disabled" }, enable_thinking: false };
const mustThink = new Set();

// 100 блюд из тестовой части Nutrition5k (фото сверху), равномерно от 30 до 1000+ ккал; вес и КБЖУ — по взвешиванию
const IDS = [
  "1560444892", "1567007751", "1565638478", "1565034605", "1565035774", "1560444914", "1558639876", "1563909469",
  "1567007814", "1561574815", "1561574428", "1565020796", "1563208439", "1567007848", "1560800951", "1562690950",
  "1560444931", "1561662190", "1563909507", "1567785709", "1566502472", "1563998210", "1564686966", "1561741090",
  "1560444948", "1567107839", "1565020822", "1561393741", "1566838351", "1566416701", "1561574456", "1564428144",
  "1565898128", "1565986702", "1558635618", "1560975601", "1562617939", "1565898158", "1562009894", "1565711498",
  "1563551134", "1560801829", "1563998244", "1561405389", "1564689138", "1562099157", "1565638550", "1563566939",
  "1561662926", "1565898193", "1559850314", "1563221054", "1567785778", "1561661377", "1562703408", "1565034681",
  "1564687013", "1561405411", "1563551164", "1565811000", "1560801020", "1560368464", "1564427455", "1566838407",
  "1561148021", "1565896745", "1561148042", "1564687046", "1566589967", "1562700593", "1565020926", "1566316726",
  "1560367952", "1562691032", "1560801859", "1561663580", "1560368019", "1557862783", "1566920339", "1568401199",
  "1566850142", "1562009006", "1565711527", "1561654392", "1564689219", "1560801883", "1559849497", "1568401261",
  "1562691064", "1565118782", "1566849987", "1565030391", "1563998323", "1562172643", "1566590007", "1562963325",
  "1558549806", "1566414342", "1566328805", "1558373159",
].map((n) => `dish_${n}`);
const N5K = "https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset";
const cacheDir = new URL("tools/.n5k-cache/", root);
fs.mkdirSync(cacheDir, { recursive: true });

/** Разметка: dish_id, ккал, масса, жиры, углеводы, белки, дальше ингредиенты */
async function labels() {
  const file = new URL("labels.csv", cacheDir);
  if (!fs.existsSync(file)) {
    const parts = await Promise.all([1, 2].map(async (n) => (await fetch(`${N5K}/metadata/dish_metadata_cafe${n}.csv`)).text()));
    fs.writeFileSync(file, parts.join("\n"));
  }
  const rows = new Map(fs.readFileSync(file, "utf8").split("\n").map((l) => l.split(",")).map((c) => [c[0], c]));
  return IDS.map((id) => {
    const c = rows.get(id);
    return { id, kcal: +c[1], grams: +c[2], fat: +c[3], carbs: +c[4], protein: +c[5] };
  });
}
const dishes = (await labels()).slice(0, LIMIT);

async function image(id) {
  const file = new URL(`${id}.jpg`, cacheDir);
  if (!fs.existsSync(file)) {
    const res = await fetch(`${N5K}/imagery/realsense_overhead/${id}/rgb.png`);
    if (!res.ok) throw new Error(`фото ${id}: ${res.status}`);
    // как в приложении: сторона до 1024, jpeg
    fs.writeFileSync(file, await sharp(Buffer.from(await res.arrayBuffer())).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer());
  }
  return `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
}

/** Текст ответа: некоторые продавцы отдают поток даже при stream: false */
function replyText(raw) {
  if (raw.trimStart().startsWith("data:")) {
    let text = "";
    let usage = null;
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:") || t === "data: [DONE]") continue;
      try {
        const c = JSON.parse(t.slice(5));
        text += c.choices?.[0]?.delta?.content ?? c.choices?.[0]?.message?.content ?? "";
        usage = c.usage ?? usage;
      } catch {}
    }
    return { text, usage };
  }
  const j = JSON.parse(raw);
  if (!j.choices) throw new Error(String(j.error?.message ?? raw).slice(0, 160));
  return { text: j.choices[0].message.content ?? "", usage: j.usage };
}

async function run(model, dish) {
  const t0 = Date.now();
  let res = await ask(model, dish);
  if (!res.ok && OPENROUTER && !mustThink.has(model)) {
    const body = await res.clone().text();
    if (res.status === 400 && /reason/i.test(body)) mustThink.add(model), (res = await ask(model, dish));
  }
  return parse(res, t0, model);
}

async function ask(model, dish) {
  return fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      ...noThinking(model, mustThink.has(model)),
      temperature: 0.1,
      max_tokens: 6000,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: [{ type: "text", text: SEE_PROMPT }, { type: "image_url", image_url: { url: await image(dish.id) } }] },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });
}

async function parse(res, t0, model) {
  const raw = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${raw.slice(0, 160)}`);
  const { text, usage } = replyText(raw);
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`не JSON: ${text.slice(0, 80)}`);
  const seen = JSON.parse(m[0]);
  const t = { grams: 0, kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const it of seen.items ?? []) {
    const g = Number(it.grams) || 0;
    const p = it.per100 ?? [];
    t.grams += g;
    t.kcal += (g * (Number(p[0]) || 0)) / 100;
    t.protein += (g * (Number(p[1]) || 0)) / 100;
    t.fat += (g * (Number(p[2]) || 0)) / 100;
    t.carbs += (g * (Number(p[3]) || 0)) / 100;
  }
  const tin = usage?.prompt_tokens ?? 0;
  const tout = usage?.completion_tokens ?? 0;
  const price = PRICES[model];
  const cost = usage?.cost ?? (price ? (tin * price[0] + tout * price[1]) / 1e6 : null);
  return { ...t, dish: seen.dish, sec: (Date.now() - t0) / 1000, tin, tout, cost };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const r = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : "—");

console.log(`Блюд: ${dishes.length}. Скачиваю фото…`);
await pool(dishes, 8, (d) => image(d.id));

const summary = [];
const detail = {};
for (const model of MODELS) {
  process.stdout.write(`${model}: `);
  const rows = await pool(dishes, PARALLEL, async (d) => {
    try {
      const x = await run(model, d);
      process.stdout.write(".");
      return { id: d.id, ...x };
    } catch (e) {
      process.stdout.write("x");
      return { id: d.id, error: e.message };
    }
  });
  console.log();
  detail[model] = rows;
  const ok = rows.map((x, k) => [x, dishes[k]]).filter(([x]) => !x.error);
  const ape = ok.map(([x, d]) => Math.abs(x.kcal - d.kcal) / d.kcal);
  const costs = ok.map(([x]) => x.cost).filter((c) => c != null);
  summary.push({
    model,
    ok: ok.length,
    kcalMAE: mean(ok.map(([x, d]) => Math.abs(x.kcal - d.kcal))),
    kcalMAPE: mean(ape) * 100,
    kcalMedAPE: median(ape) * 100,
    within20: (ape.filter((e) => e <= 0.2).length / Math.max(ok.length, 1)) * 100,
    bias: mean(ok.map(([x, d]) => (x.kcal - d.kcal) / d.kcal)) * 100,
    gramsMAPE: mean(ok.map(([x, d]) => Math.abs(x.grams - d.grams) / d.grams)) * 100,
    pMAE: mean(ok.map(([x, d]) => Math.abs(x.protein - d.protein))),
    fMAE: mean(ok.map(([x, d]) => Math.abs(x.fat - d.fat))),
    cMAE: mean(ok.map(([x, d]) => Math.abs(x.carbs - d.carbs))),
    sec: median(ok.map(([x]) => x.sec)),
    tin: mean(ok.map(([x]) => x.tin)),
    tout: mean(ok.map(([x]) => x.tout)),
    cost: costs.length ? mean(costs) : null,
  });
}

const head = "| Модель | Ответов | Ккал: ошибка, % | медиана, % | в пределах 20% | сдвиг, % | Ккал: ошибка, ккал | Вес: ошибка, % | Б / Ж / У: ошибка, г | Время, с | Токены вход/выход | $ за фото |";
const lines = [head, head.replace(/[^|]+/g, "---")];
for (const s of [...summary].sort((a, b) => a.kcalMAPE - b.kcalMAPE)) {
  lines.push(
    `| ${s.model} | ${s.ok}/${dishes.length} | ${r(s.kcalMAPE)} | ${r(s.kcalMedAPE)} | ${r(s.within20)}% | ${s.bias > 0 ? "+" : ""}${r(s.bias)} | ${r(s.kcalMAE)} | ${r(s.gramsMAPE)} | ${r(s.pMAE)} / ${r(s.fMAE)} / ${r(s.cMAE)} | ${r(s.sec, 1)} | ${r(s.tin)}/${r(s.tout)} | ${s.cost == null ? "—" : s.cost.toFixed(4)} |`,
  );
}
console.log("\n" + lines.join("\n"));

const outDir = new URL("tools/.n5k-cache/", root);
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
fs.writeFileSync(new URL(`results-${stamp}.json`, outDir), JSON.stringify({ models: MODELS, summary, detail }, null, 1));
fs.writeFileSync(new URL(`results-${stamp}.md`, outDir), lines.join("\n") + "\n");
console.log(`\nПодробно: tools/.n5k-cache/results-${stamp}.json`);
