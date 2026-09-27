// Прокси к поиску Open Food Facts (search-a-licious не отдаёт CORS-заголовки).
// Нормализует ответ в формат продукта Emli и кэширует популярные запросы в памяти.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  if (q.length < 2) return new Response("[]", { headers: { ...cors, "Content-Type": "application/json" } });

  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < TTL) {
    return new Response(hit.body, { headers: { ...cors, "Content-Type": "application/json", "X-Cache": "hit" } });
  }

  const url =
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&langs=ru,en&page_size=40` +
    `&fields=code,product_name,product_name_ru,brands,nutriments,serving_quantity,serving_quantity_unit`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Emli/0.1 (Telegram nutrition diary)" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`off ${res.status}`);
    const data = await res.json();
    const seen = new Set<string>();
    const foods = ((data.hits ?? []) as Hit[])
      .map(toFood)
      .filter((f): f is NonNullable<ReturnType<typeof toFood>> => {
        if (!f) return false;
        const key = `${f.name}|${f.brand}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 25);
    const body = JSON.stringify(foods);
    if (cache.size > 500) cache.clear();
    cache.set(q, { at: Date.now(), body });
    return new Response(body, { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
