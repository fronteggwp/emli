// Поиск продукта по штрихкоду — цепочка источников:
//  1) Open Food Facts — живой запрос в момент скана (открытая мировая база);
//  2) база Emli (barcode_products) — то, что уже находили, прочитали с этикеток и добавили пользователи;
//  3) в OFF есть фото этикетки без КБЖУ — читаем его ИИ;
//  4) USDA FoodData Central — для американских кодов (протеин, батончики), если задан FDC_API_KEY;
//  5) barcode-list.ru — только название (КБЖУ там нет) → оценка КБЖУ ИИ по названию с пометкой «оценка».
// Всё найденное сохраняется в базу Emli; пользователи дополняют её фото этикеток и ручным вводом.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-admin-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const AI_KEY = Deno.env.get("AI_API_KEY") ?? "";
const AI_BASE = Deno.env.get("AI_BASE_URL") ?? "";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "deepseek-v4.1-flash";
const FDC_KEY = Deno.env.get("FDC_API_KEY") ?? "";
const ADMIN = Deno.env.get("ADMIN_SECRET") ?? "";
const UA = "Emli/1.0 (nutrition diary; https://t.me/myemli_bot)";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

const TRUST: Record<string, number> = { off: 90, usda: 88, off_label: 80, label: 78, user: 60, estimate: 20, name: 5, miss: 0 };
const AI_DAILY = 60;

type Product = {
  barcode: string;
  name: string | null;
  brand: string | null;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  serving_g: number | null;
  net_g: number | null;
  liquid: boolean;
  source: string;
  trust: number;
  image_url: string | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
};
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
/** Настоящее название, а не штрихкод/артикул вместо него (в открытых базах такое бывает) */
const realName = (s: unknown) => {
  const t = clip(s, 160);
  return t.length > 2 && /[a-zа-яё]{2,}/i.test(t) ? t : null;
};

// ───────────── Штрихкод: проверка контрольной цифры и варианты записи

function checksumOk(code: string) {
  if (![8, 12, 13, 14].includes(code.length)) return false;
  const d = code.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Один товар может храниться как UPC-A (12), EAN-13 с ведущим нулём или GTIN-14 */
function variants(code: string) {
  const out = new Set([code]);
  if (code.length === 12) out.add("0" + code);
  if (code.length === 13 && code.startsWith("0")) out.add(code.slice(1));
  if (code.length === 14 && code.startsWith("0")) {
    out.add(code.slice(1));
    if (code.startsWith("00")) out.add(code.slice(2));
  }
  return [...out];
}

// ───────────── ИИ

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

async function chat(messages: unknown[], maxTokens: number) {
  const res = await fetch(`${AI_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json", "Content-Encoding": "gzip" },
    body: await gzipJson({ model: AI_MODEL, thinking: { type: "disabled" }, temperature: 0.1, max_tokens: maxTokens + REASONING_ROOM, enable_thinking: false, messages }),
    signal: AbortSignal.timeout(70_000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.choices) throw new Error(`ai ${res.status}`);
  const text: string = j.choices[0].message?.content ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("ai: не JSON");
  return JSON.parse(m[0]);
}

const SYSTEM = "Ты — эксперт по пищевой ценности продуктов и маркировке упаковок в России и Беларуси. Отвечай строго JSON без пояснений.";

const LABEL_PROMPT = `На фото упаковка продукта. Найди таблицу пищевой ценности и прочитай её точно, цифры не придумывай.
Верни значения на 100 г (или на 100 мл для напитков). Если на упаковке указано только «на порцию» — пересчитай на 100 г по массе порции.
Энергию бери в ккал (не в кДж). Если чего-то нет на фото — null.
Также прочитай с упаковки: name — полное название продукта (вид + вкус/жирность, без маркетинга), brand — торговая марка,
net_g — масса нетто или объём (число, г или мл), liquid — true для напитков/жидкостей, serving_g — масса порции, если указана.
Ответ: {"ok":true,"name":"","brand":"","kcal":0,"protein":0,"fat":0,"carbs":0,"net_g":null,"serving_g":null,"liquid":false}
Если таблицы пищевой ценности на фото нет: {"ok":false,"reason":"..."}`;

/** Проверка здравого смысла: калории сходятся с БЖУ, значения физически возможны */
function sane(p: { kcal: number; protein: number; fat: number; carbs: number }) {
  const { kcal, protein, fat, carbs } = p;
  if (![kcal, protein, fat, carbs].every((x) => Number.isFinite(x) && x >= 0)) return false;
  if (kcal > 950 || protein + fat + carbs > 105) return false;
  const byMacros = protein * 4 + fat * 9 + carbs * 4;
  return Math.abs(byMacros - kcal) <= Math.max(45, kcal * 0.28);
}

function fromAi(o: Record<string, unknown>) {
  let kcal = num(o.kcal);
  const protein = num(o.protein);
  const fat = num(o.fat);
  const carbs = num(o.carbs);
  // Перепутали кДж и ккал
  if (kcal > 950 && kcal / 4.184 < 950) kcal = kcal / 4.184;
  if (!Number.isFinite(kcal) && [protein, fat, carbs].every(Number.isFinite)) kcal = protein * 4 + fat * 9 + carbs * 4;
  return {
    kcal: r1(kcal),
    protein: r1(Number.isFinite(protein) ? protein : 0),
    fat: r1(Number.isFinite(fat) ? fat : 0),
    carbs: r1(Number.isFinite(carbs) ? carbs : 0),
    name: realName(o.name),
    brand: clip(o.brand, 80) || null,
    net_g: num(o.net_g) > 0 && num(o.net_g) < 20000 ? r1(num(o.net_g)) : null,
    serving_g: num(o.serving_g) > 0 && num(o.serving_g) < 2000 ? r1(num(o.serving_g)) : null,
    liquid: o.liquid === true,
  };
}


async function readLabel(image: string, hint?: string) {
  const out = await chat(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: LABEL_PROMPT + (hint ? `\nНазвание товара из базы (для справки): «${clip(hint, 120)}»` : "") },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
    500,
  );
  if (!out.ok) return null;
  const p = fromAi(out);
  return sane(p) ? p : null;
}

async function estimateByName(name: string, brand: string | null) {
  const out = await chat(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          `Товар из магазина: «${clip(name, 160)}»${brand ? `, бренд «${clip(brand, 60)}»` : ""}.\n` +
          `Оцени типичную пищевую ценность на 100 г (или 100 мл) для такого товара по данным производителей. ` +
          `Из названия возьми массу нетто (net_g), жирность и т.п. Дай аккуратное короткое название на русском (name, без КАПСА и артикулов).\n` +
          `Если это не еда/напиток — {"ok":false}.\n` +
          `Ответ: {"ok":true,"name":"","brand":"","kcal":0,"protein":0,"fat":0,"carbs":0,"net_g":null,"liquid":false,"confidence":0.0}`,
      },
    ],
    300,
  );
  if (!out.ok) return null;
  const p = fromAi(out);
  return sane(p) ? { ...p, confidence: Math.max(0, Math.min(1, num(out.confidence) || 0.5)) } : null;
}

/** Название из каталога часто КАПСОМ и с артикулами — приводим к аккуратному виду */
async function tidyName(raw: string) {
  if (raw !== raw.toUpperCase() && raw.length < 70) return { name: raw, brand: null as string | null };
  try {
    const out = await chat(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            `Название товара из кассовой базы: «${clip(raw, 200)}». Сделай короткое аккуратное название на русском в обычном регистре ` +
            `(вид продукта + вкус/жирность + масса), без упаковки, количества в коробке и артикулов; бренд — отдельно. ` +
            `Ответ: {"name":"","brand":""}`,
        },
      ],
      120,
    );
    return { name: realName(out.name) ?? raw, brand: clip(out.brand, 80) || null };
  } catch {
    return { name: raw, brand: null };
  }
}

// ───────────── Источники

type Off = {
  product_name?: string;
  product_name_ru?: string;
  generic_name_ru?: string;
  brands?: string;
  nutriments?: Record<string, number | string | undefined>;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  image_nutrition_url?: string;
  image_front_small_url?: string;
  image_url?: string;
};

function offNutrition(p: Off) {
  const n = p.nutriments ?? {};
  let kcal = num(n["energy-kcal_100g"]);
  if (!Number.isFinite(kcal)) {
    const kj = num(n["energy-kj_100g"] ?? n["energy_100g"]);
    if (Number.isFinite(kj)) kcal = kj / 4.184;
  }
  const protein = num(n["proteins_100g"]);
  const fat = num(n["fat_100g"]);
  const carbs = num(n["carbohydrates_100g"]);
  const known = [protein, fat, carbs].filter(Number.isFinite).length;
  if (!Number.isFinite(kcal) || known < 2) return null;
  const v = { kcal: r1(kcal), protein: r1(Number.isFinite(protein) ? protein : 0), fat: r1(Number.isFinite(fat) ? fat : 0), carbs: r1(Number.isFinite(carbs) ? carbs : 0) };
  return v.kcal <= 950 ? v : null;
}

async function fromOff(code: string) {
  const fields =
    "product_name,product_name_ru,generic_name_ru,brands,nutriments,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,image_nutrition_url,image_front_small_url,image_url";
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null;
  const d = await res.json();
  return d.status === 1 && d.product ? (d.product as Off) : null;
}

async function fromUsda(code: string) {
  if (!FDC_KEY) return null;
  const upc = code.replace(/^0+/, "");
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${FDC_KEY}&dataType=Branded&pageSize=5&query=${upc}`, { signal: AbortSignal.timeout(7000) });
  if (!res.ok) return null;
  const d = await res.json();
  const f = (d.foods ?? []).find((x: { gtinUpc?: string }) => String(x.gtinUpc ?? "").replace(/^0+/, "") === upc);
  if (!f) return null;
  const get = (id: number) => num(f.foodNutrients?.find((n: { nutrientId: number; value: number }) => n.nutrientId === id)?.value);
  const v = { kcal: r1(get(1008)), protein: r1(get(1003) || 0), fat: r1(get(1004) || 0), carbs: r1(get(1005) || 0) };
  if (!Number.isFinite(v.kcal) || !sane(v)) return null;
  const title = String(f.description ?? "").toLowerCase();
  return { ...v, name: title.charAt(0).toUpperCase() + title.slice(1), brand: clip(f.brandName ?? f.brandOwner, 80) || null, serving_g: f.servingSizeUnit === "g" ? r1(num(f.servingSize)) || null : null };
}

// barcode-list.ru просит не чаще раза в 10 секунд — соблюдаем на уровне экземпляра функции
let lastBl = 0;
async function nameFromBarcodeList(code: string) {
  if (Date.now() - lastBl < 10_000) return null;
  lastBl = Date.now();
  const res = await fetch(`https://barcode-list.ru/barcode/RU/%D0%9F%D0%BE%D0%B8%D1%81%D0%BA.htm?barcode=${code}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").trim()))
    .filter((c) => c.length >= 4 && c[1] === code);
  // Колонки: №, штрихкод, наименование, единица, рейтинг — берём самое «рейтинговое» осмысленное название
  const best = rows
    .map((c) => ({ name: c[2], rating: num(c[4]) || 0 }))
    .filter((r) => r.name && !/^\d+$/.test(r.name) && r.name.length > 3)
    .sort((a, b) => b.rating - a.rating || b.name.length - a.name.length)[0];
  return best ? realName(best.name) : null;
}

// ───────────── Общая база

async function save(p: Product) {
  const { data: cur } = await admin.from("barcode_products").select("trust,kcal").eq("barcode", p.barcode).maybeSingle();
  if (cur && cur.trust > p.trust && cur.kcal != null) return;
  await admin.from("barcode_products").upsert({ ...p, checked_at: new Date().toISOString() });
}

async function aiAllowed(uid: string) {
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", uid).in("kind", ["barcode-ai", "label"]).gte("created_at", since);
  return (count ?? 0) < AI_DAILY;
}
const logAi = (uid: string, kind: string, ms: number, ok: boolean) => admin.from("ai_usage").insert({ user_id: uid, kind, ms, ok });

const blank = (barcode: string): Product => ({
  barcode,
  name: null,
  brand: null,
  kcal: null,
  protein: null,
  fat: null,
  carbs: null,
  serving_g: null,
  net_g: null,
  liquid: false,
  source: "miss",
  trust: 0,
  image_url: null,
});

async function lookup(raw: string, uid: string) {
  const t0 = Date.now();
  const code = raw.replace(/\D/g, "");
  if (!checksumOk(code)) return { status: "invalid" };
  const codes = variants(code);
  const tried: string[] = [];

  let name: string | null = null;
  let brand: string | null = null;
  let image: string | null = null;
  let net: number | null = null;
  let liquid = false;

  // 1) Open Food Facts — живой запрос; 2) база Emli — параллельно, чтобы не ждать, если OFF тормозит
  const offTask = (async () => {
    for (const c of codes) {
      const o = await fromOff(c).catch(() => null);
      if (o) return o;
    }
    return null;
  })();
  const { data: rows } = await admin.from("barcode_products").select("*").in("barcode", codes);
  const known = ((rows ?? []) as (Product & { checked_at: string })[]).sort((a, b) => b.trust - a.trust)[0];
  const haveOwn = !!known && known.kcal != null && known.source !== "estimate";
  // Свой ответ есть — даём OFF 2,5 с на свежие данные; своего нет — ждём OFF до конца (до 4 с на код)
  const off = haveOwn ? await Promise.race([offTask, new Promise<null>((r) => setTimeout(() => r(null), 2500))]) : await offTask;
  tried.push("off");
  const age = known ? (Date.now() - new Date(known.checked_at).getTime()) / 86400_000 : Infinity;

  if (off) {
    name = realName(off.product_name_ru) ?? realName(off.product_name) ?? realName(off.generic_name_ru);
    brand = clip(off.brands?.split(",")[0], 80) || null;
    image = off.image_front_small_url ?? off.image_url ?? null;
    const unit = String(off.product_quantity_unit ?? "").toLowerCase();
    net = num(off.product_quantity) > 0 ? r1(num(off.product_quantity)) : null;
    liquid = unit === "ml" || unit === "l";
  }
  const offFull = off ? offNutrition(off) : null;
  // В OFF нет КБЖУ, а у нас есть (с этикетки, от пользователей) — берём своё
  if (!(offFull && name) && known && known.kcal != null && known.source !== "estimate") {
    tried.push("emli");
    return { status: "found", product: { ...known, name: known.name ?? name, brand: known.brand ?? brand, image_url: known.image_url ?? image }, tried, ms: Date.now() - t0 };
  }
  // Недавно уже искали везде и не нашли — не тратим ИИ повторно
  if (!off && known && age < 5) {
    tried.push("emli");
    return { status: known.source === "estimate" ? "estimate" : "miss", product: known.kcal != null || known.name ? known : null, tried, ms: Date.now() - t0 };
  }
  name = name ?? known?.name ?? null;
  brand = brand ?? known?.brand ?? null;

  if (off) {
    const nut = offNutrition(off);
    const serving = String(off.serving_quantity_unit ?? "g").toLowerCase() === "g" && num(off.serving_quantity) > 0 && num(off.serving_quantity) < 2000 ? r1(num(off.serving_quantity)) : null;
    if (nut && name) {
      const p: Product = { ...blank(code), ...nut, name, brand, serving_g: serving, net_g: net, liquid, source: "off", trust: TRUST.off, image_url: image };
      await save(p);
      return { status: "found", product: p, tried, ms: Date.now() - t0 };
    }
    // КБЖУ не внесено, но есть фото этикетки — читаем его
    if (off.image_nutrition_url && AI_KEY && (await aiAllowed(uid))) {
      const ta = Date.now();
      try {
        // Фото этикетки из OFF уже лежит по ссылке — модель скачает сама
        const lab = await readLabel(off.image_nutrition_url, name ?? undefined);
        await logAi(uid, "barcode-ai", Date.now() - ta, !!lab);
        if (lab) {
          tried.push("off_label");
          // С фото таблицы видно только общее «Майонез» — полное название берём из каталога, если его нет в OFF
          if (!name) {
            const raw = await nameFromBarcodeList(code).catch(() => null);
            tried.push("barcode-list");
            if (raw) {
              const t = await tidyName(raw);
              name = t.name;
              brand = brand ?? t.brand;
            }
          }
          const p: Product = {
            ...blank(code),
            kcal: lab.kcal,
            protein: lab.protein,
            fat: lab.fat,
            carbs: lab.carbs,
            name: name ?? lab.name,
            brand: brand ?? lab.brand,
            serving_g: serving ?? lab.serving_g,
            net_g: net ?? lab.net_g,
            liquid: liquid || lab.liquid,
            source: "off_label",
            trust: TRUST.off_label,
            image_url: image,
          };
          await save(p);
          return { status: "found", product: p, tried, ms: Date.now() - t0 };
        }
      } catch {
        await logAi(uid, "barcode-ai", Date.now() - ta, false);
      }
    }
  }

  // 3) USDA (американские коды)
  if (FDC_KEY && /^0/.test(code.padStart(13, "0"))) {
    const u = await fromUsda(code).catch(() => null);
    tried.push("usda");
    if (u) {
      const p: Product = { ...blank(code), ...u, net_g: null, liquid: false, source: "usda", trust: TRUST.usda, image_url: null };
      await save(p);
      return { status: "found", product: p, tried, ms: Date.now() - t0 };
    }
  }

  // 4) Название из каталога штрихкодов
  if (!name) {
    name = await nameFromBarcodeList(code).catch(() => null);
    tried.push("barcode-list");
  }

  // 5) Есть название — оцениваем КБЖУ по нему (честно помечаем как оценку)
  if (name && AI_KEY && (await aiAllowed(uid))) {
    const ta = Date.now();
    try {
      const est = await estimateByName(name, brand);
      await logAi(uid, "barcode-ai", Date.now() - ta, !!est);
      if (est) {
        const p: Product = {
          ...blank(code),
          kcal: est.kcal,
          protein: est.protein,
          fat: est.fat,
          carbs: est.carbs,
          name: est.name ?? name,
          brand: brand ?? est.brand,
          net_g: net ?? est.net_g,
          liquid: liquid || est.liquid,
          source: "estimate",
          trust: TRUST.estimate,
          image_url: image,
        };
        await save(p);
        return { status: "estimate", product: p, tried: [...tried, "estimate"], ms: Date.now() - t0 };
      }
    } catch {
      await logAi(uid, "barcode-ai", Date.now() - ta, false);
    }
  }

  const p: Product = { ...blank(code), name, brand, image_url: image, source: name ? "name" : "miss", trust: name ? TRUST.name : 0 };
  await save(p);
  return { status: "miss", product: name ? p : null, tried, ms: Date.now() - t0 };
}

// ───────────── Вклад пользователя

async function contribute(body: Record<string, unknown>, uid: string) {
  const code = String(body.barcode ?? "").replace(/\D/g, "");
  if (!checksumOk(code)) return json({ error: "bad_barcode" }, 400);
  const name = clip(body.name, 160);
  const v = { kcal: num(body.kcal), protein: num(body.protein), fat: num(body.fat), carbs: num(body.carbs) };
  if (name.length < 2 || !sane(v)) return json({ error: "bad_values" }, 400);
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await admin.from("barcode_contributions").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since);
  if ((count ?? 0) >= 40) return json({ error: "limit" }, 429);
  const from = body.from === "label" ? "label" : "user";
  const p: Product = {
    ...blank(code),
    ...v,
    kcal: r1(v.kcal),
    protein: r1(v.protein),
    fat: r1(v.fat),
    carbs: r1(v.carbs),
    name,
    brand: clip(body.brand, 80) || null,
    serving_g: num(body.serving_g) > 0 ? r1(num(body.serving_g)) : null,
    net_g: num(body.net_g) > 0 ? r1(num(body.net_g)) : null,
    liquid: body.liquid === true,
    source: from,
    trust: TRUST[from],
    image_url: null,
  };
  await admin.from("barcode_contributions").insert({ barcode: code, user_id: uid, payload: p });
  const { data: cur } = await admin.from("barcode_products").select("trust,kcal,source").eq("barcode", code).maybeSingle();
  // Данные с этикетки и ручной ввод заменяют оценки и «не найдено», но не проверенные открытые базы
  if (!cur || cur.kcal == null || cur.trust <= p.trust) {
    await admin.from("barcode_products").upsert({ ...p, contributed_by: uid, checked_at: new Date().toISOString() });
    return json({ ok: true, shared: true });
  }
  return json({ ok: true, shared: false });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const body = await req.json().catch(() => ({}));

  // Забыть коды (перепроверить заново) — только администратор
  if (body.action === "forget") {
    if (!ADMIN || req.headers.get("x-admin-secret") !== ADMIN) return json({ error: "forbidden" }, 403);
    const codes = (Array.isArray(body.codes) ? body.codes : []).map(String).slice(0, 100);
    await admin.from("barcode_products").delete().in("barcode", codes);
    return json({ ok: true });
  }
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = await admin.auth.getUser(token);
  const uid = auth?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);

  try {
    if (body.action === "lookup") return json(await lookup(String(body.code ?? ""), uid));
    if (body.action === "contribute") return await contribute(body, uid);
    if (body.action === "label") {
      const image = String(body.image ?? "");
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 2_500_000) return json({ error: "bad_image" }, 400);
      if (!(await aiAllowed(uid))) return json({ error: "limit" }, 429);
      const t0 = Date.now();
      const link = await imageLink(image, uid);
      const lab = await readLabel(link.url, typeof body.hint === "string" ? body.hint : undefined).catch(() => null);
      await link.done();
      await logAi(uid, "label", Date.now() - t0, !!lab);
      return lab ? json({ ok: true, label: lab }) : json({ ok: false, error: "no_label" });
    }
    return json({ error: "bad_request" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "failed" }, 502);
  }
});
