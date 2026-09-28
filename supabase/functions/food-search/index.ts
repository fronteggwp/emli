// Поиск упакованных продуктов по названию: общая база штрихкодов Emli
// (товары России/Беларуси из Open Food Facts, с этикеток и от пользователей) и живой поиск Open Food Facts.
// Белорусские товары, подходящие под запрос, — первыми.
// Нормализует ответ в формат продукта Emli и кэширует популярные запросы в памяти.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

type Row = { barcode: string; name: string; brand: string | null; kcal: number; protein: number; fat: number; carbs: number; serving_g: number | null; source: string; image_url: string | null; net_g: number | null; liquid: boolean };
const fromEmli = (b: Row) => ({
  name: b.name,
  brand: b.brand,
  barcode: b.barcode,
  category: null,
  kcal: Math.round(Number(b.kcal)),
  protein: Number(b.protein),
  fat: Number(b.fat),
  carbs: Number(b.carbs),
  serving_g: b.serving_g ? Number(b.serving_g) : null,
  serving_name: b.serving_g ? "порция" : null,
  source: "off",
  origin: { source: b.source, image: b.image_url, net_g: b.net_g, liquid: b.liquid },
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Hit = {
  code?: string;
  product_name?: string;
  product_name_ru?: string;
  brands?: string[] | string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

const cache = new Map<string, { at: number; body: string }>();
const TTL = 6 * 3600 * 1000;

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

function toFood(h: Hit) {
  const n = h.nutriments ?? {};
  let kcal = num(n["energy-kcal_100g"]);
  if (!Number.isFinite(kcal)) {
    const kj = num(n["energy-kj_100g"] ?? n["energy_100g"]);
    if (Number.isFinite(kj)) kcal = kj / 4.184;
  }
  const name = (h.product_name_ru || h.product_name || "").trim();
  if (!name || !Number.isFinite(kcal) || kcal > 950) return null;
  const p = num(n["proteins_100g"]);
  const f = num(n["fat_100g"]);
  const c = num(n["carbohydrates_100g"]);
  const brand = Array.isArray(h.brands) ? h.brands[0] : h.brands?.split(",")[0];
  const unit = String((h as { serving_quantity_unit?: string }).serving_quantity_unit ?? "").toLowerCase();
  const rawServing = num(h.serving_quantity);
  const serving = unit === "g" && rawServing > 0 && rawServing < 2000 ? rawServing : NaN;
  const missing = [["protein", p], ["fat", f], ["carbs", c]].filter(([, v]) => !Number.isFinite(v as number)).map(([k]) => k);
  return {
    name: name.slice(0, 120),
    brand: brand?.trim() || null,
    barcode: h.code ?? null,
    category: null,
    kcal: Math.round(kcal),
    protein: Number.isFinite(p) ? r1(p) : 0,
    fat: Number.isFinite(f) ? r1(f) : 0,
    carbs: Number.isFinite(c) ? r1(c) : 0,
    serving_g: Number.isFinite(serving) && serving > 0 && serving < 2000 ? r1(serving) : null,
    serving_name: Number.isFinite(serving) && serving > 0 && serving < 2000 ? "порция" : null,
    source: "off",
    missing: missing.length ? missing : undefined,
  };
}

// Белорусские товары — по умолчанию первыми: штрихкод 481… или страна продажи «Беларусь» в Open Food Facts
const isBY = (barcode: string | null | undefined, countries?: string[] | string) =>
  String(barcode ?? "").startsWith("481") || (Array.isArray(countries) ? countries : [countries ?? ""]).some((c) => String(c).includes("belarus"));
const tokens = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/(\d),(\d)/g, "$1.$2").split(/[^а-яa-z0-9.]+/).filter(Boolean);
const same = (a: string, b: string) => a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5));
/** Товар действительно про запрос: все слова запроса есть в названии или бренде (по основе) — чтобы на «масло сливочное» не всплывал «сыр сливочный» */
const relevant = (f: { name: string; brand: string | null }, q: string) => {
  const nw = tokens(`${f.name} ${f.brand ?? ""}`).filter((w) => /[а-яa-z]/.test(w));
  return tokens(q)
    .filter((w) => /[а-яa-z]/.test(w) && w.length >= 3)
    .every((w) => nw.some((x) => same(x, w)));
};
/** Совпадают ли числа запроса (жирность 3,2 / 15%) — такие товары первыми */
const sameNumbers = (f: { name: string }, q: string) => {
  const nums = tokens(q).filter((w) => /^\d+(\.\d+)?$/.test(w));
  const have = tokens(f.name);
  return nums.length > 0 && nums.every((n) => have.includes(n));
};

async function off(q: string, belarus: boolean) {
  const url =
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(belarus ? `${q} countries_tags:"en:belarus"` : q)}&langs=ru,en&page_size=${belarus ? 20 : 40}` +
    `&fields=code,product_name,product_name_ru,brands,nutriments,serving_quantity,serving_quantity_unit,countries_tags`;
  const res = await fetch(url, { headers: { "User-Agent": "Emli/0.1 (Telegram nutrition diary)" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`off ${res.status}`);
  const data = await res.json();
  return ((data.hits ?? []) as (Hit & { countries_tags?: string[] })[])
    .map((h) => {
      const f = toFood(h);
      return f ? { ...f, by: belarus || isBY(h.code, h.countries_tags), fromBy: belarus } : null;
    })
    .filter((f): f is NonNullable<typeof f> => !!f);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  if (q.length < 2) return new Response("[]", { headers: { ...cors, "Content-Type": "application/json" } });

  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < TTL) {
    return new Response(hit.body, { headers: { ...cors, "Content-Type": "application/json", "X-Cache": "hit" } });
  }

  // Общая база Emli — быстро и без внешних лимитов; Open Food Facts — обычный запрос и отдельно по Беларуси
  const [own, all, by] = await Promise.all([
    admin.rpc("search_barcode_products", { q, lim: 20 }).then(({ data }) => ((data ?? []) as Row[]).map((b) => ({ ...fromEmli(b), by: isBY(b.barcode) }))),
    off(q, false).catch(() => null),
    off(q, true).catch(() => null),
  ]);
  if (!all && !by && !own.length) {
    return new Response(JSON.stringify({ error: "off unavailable" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const seen = new Set<string>();
  const merged: ((typeof own)[number] | NonNullable<typeof all>[number])[] = [];
  for (const f of [...own, ...(by ?? []), ...(all ?? [])]) {
    const key = `${f.name}|${f.brand}`.toLowerCase();
    if (seen.has(key) || (f.barcode && seen.has(`#${f.barcode}`))) continue;
    seen.add(key);
    if (f.barcode) seen.add(`#${f.barcode}`);
    merged.push(f);
  }
  // Белорусское и подходящее по словам — наверх; дальше прежний порядок (своя база, затем Open Food Facts).
  // Поиск по стране у Open Food Facts нестрогий (на «творог» может дать пиво) — такое из него выкидываем.
  const fit = (f: (typeof merged)[number]) => relevant(f, q);
  const top = merged.filter((f) => f.by && fit(f)).sort((x, y) => Number(sameNumbers(y, q)) - Number(sameNumbers(x, q)));
  const rest = merged.filter((f) => !(f.by && fit(f)) && !("fromBy" in f && f.fromBy && !fit(f)));
  const body = JSON.stringify([...top, ...rest].slice(0, 35).map(({ fromBy: _, ...f }: Record<string, unknown>) => f));
  if (all && by) {
    if (cache.size > 500) cache.clear();
    cache.set(q, { at: Date.now(), body });
  }
  return new Response(body, { headers: { ...cors, "Content-Type": "application/json" } });
});
