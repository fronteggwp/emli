// Open Food Facts — открытая мировая база упакованных продуктов (штрихкоды, бренды).
import type { FoodDraft } from "@/lib/types";

const FIELDS = "code,product_name,product_name_ru,generic_name_ru,brands,nutriments,serving_quantity,serving_quantity_unit,serving_size";

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_ru?: string;
  generic_name_ru?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
};

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

function toDraft(p: OffProduct): FoodDraft | null {
  const n = p.nutriments ?? {};
  let kcal = num(n["energy-kcal_100g"]);
  if (!Number.isFinite(kcal)) {
    const kj = num(n["energy_100g"]);
    if (Number.isFinite(kj)) kcal = kj / 4.184;
  }
  const protein = num(n["proteins_100g"]);
  const fat = num(n["fat_100g"]);
  const carbs = num(n["carbohydrates_100g"]);
  const name = (p.product_name_ru || p.product_name || p.generic_name_ru || "").trim();
  if (!name || !Number.isFinite(kcal)) return null;
  // Порция — только если она в граммах (мл без плотности в граммы не переводим)
  const unit = (p.serving_quantity_unit ?? (/\d\s*(г|g)\b/i.test(p.serving_size ?? "") ? "g" : "")).toLowerCase();
  const rawServing = num(p.serving_quantity);
  const serving = unit === "g" && rawServing > 0 && rawServing < 2000 ? rawServing : NaN;
  const missing = (
    [
      ["protein", protein],
      ["fat", fat],
      ["carbs", carbs],
    ] as const
  )
    .filter(([, v]) => !Number.isFinite(v))
    .map(([k]) => k);
  return {
    name: name.slice(0, 120),
    brand: p.brands?.split(",")[0]?.trim() || null,
    barcode: p.code ?? null,
    category: null,
    kcal: Math.round(kcal),
    protein: Number.isFinite(protein) ? r1(protein) : 0,
    fat: Number.isFinite(fat) ? r1(fat) : 0,
    carbs: Number.isFinite(carbs) ? r1(carbs) : 0,
    serving_g: Number.isFinite(serving) && serving > 0 ? r1(serving) : null,
    serving_name: Number.isFinite(serving) && serving > 0 ? "порция" : null,
    source: "off",
    missing: missing.length ? missing : undefined,
  };
}

/** null — продукта нет в базе; исключение — нет связи или сервис недоступен */
export async function offByBarcode(code: string, signal?: AbortSignal): Promise<FoodDraft | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`off ${res.status}`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  return toDraft({ ...data.product, code });
}

const SEARCH_URL = "https://ezhgiczvwsufzhwwwrkr.supabase.co/functions/v1/food-search";

/** Поиск по Open Food Facts через наш прокси (быстрый индекс search-a-licious + кэш) */
export async function offSearch(q: string, signal?: AbortSignal): Promise<FoodDraft[]> {
  const res = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error("off");
  const data = await res.json();
  return Array.isArray(data) ? (data as FoodDraft[]) : [];
}
