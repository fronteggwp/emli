// Open Food Facts — открытая мировая база упакованных продуктов (штрихкоды, бренды).
import type { FoodDraft, FoodOrigin } from "@/lib/types";

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

// ───────────── Поиск по штрихкоду: цепочка источников на сервере (функция barcode)

export type BarcodeProduct = {
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
  source: FoodOrigin["source"];
  image_url: string | null;
};
export type BarcodeResult = { status: "found" | "estimate" | "miss" | "invalid"; product: BarcodeProduct | null; tried?: string[] };

/** Контрольная цифра EAN/UPC: камера иногда ошибается в одной цифре — такие коды не ищем */
export function barcodeValid(code: string) {
  if (![8, 12, 13, 14].includes(code.length) || !/^\d+$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

async function invokeBarcode<T>(body: Record<string, unknown>): Promise<T> {
  const { supabase } = await import("@/lib/supabase");
  const { data, error } = await supabase.functions.invoke("barcode", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const b = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(b?.error ?? (ctx ? "failed" : "network"));
  }
  return data as T;
}

export const lookupBarcode = (code: string) => invokeBarcode<BarcodeResult>({ action: "lookup", code });

/** «МАЙОНЕЗ МОСКОВСКИЙ ПРОВАНСАЛЬ» → «Майонез московский провансаль» — кассовые базы пишут капсом */
const calm = (s: string) => (s.length > 6 && s === s.toUpperCase() && /[А-ЯЁA-Z]{3}/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s);

/** Товар из общей базы → черновик продукта для карточки */
export function productDraft(p: BarcodeProduct): FoodDraft | null {
  if (p.kcal == null) return null;
  return {
    name: p.name ? calm(p.name) : `Товар ${p.barcode}`,
    brand: p.brand,
    barcode: p.barcode,
    category: null,
    kcal: Math.round(p.kcal),
    protein: p.protein ?? 0,
    fat: p.fat ?? 0,
    carbs: p.carbs ?? 0,
    serving_g: p.serving_g,
    serving_name: p.serving_g ? "порция" : null,
    source: "off",
    origin: { source: p.source, image: p.image_url, net_g: p.net_g, liquid: p.liquid },
  };
}

export type LabelRead = { name: string | null; brand: string | null; kcal: number; protein: number; fat: number; carbs: number; net_g: number | null; serving_g: number | null; liquid: boolean };

/** Фото этикетки → КБЖУ на 100 г (ИИ читает таблицу пищевой ценности) */
export async function readLabel(image: string, hint?: string): Promise<LabelRead | null> {
  const r = await invokeBarcode<{ ok: boolean; label?: LabelRead }>({ action: "label", image, hint });
  return r.ok && r.label ? r.label : null;
}

/** Добавить товар в общую базу — следующий, кто отсканирует, найдёт его сразу */
export const contributeBarcode = (p: { barcode: string; name: string; brand: string | null; kcal: number; protein: number; fat: number; carbs: number; serving_g: number | null; net_g?: number | null; liquid?: boolean; from: "label" | "user" }) =>
  invokeBarcode<{ ok: boolean; shared: boolean }>({ action: "contribute", ...p });

/** Откуда данные — подпись для карточки продукта */
export const ORIGIN_TEXT: Record<FoodOrigin["source"], string> = {
  off: "Open Food Facts",
  off_label: "Прочитано ИИ с фото этикетки (Open Food Facts)",
  usda: "USDA FoodData Central",
  label: "С этикетки — добавили пользователи Emli",
  user: "Добавили пользователи Emli",
  estimate: "Оценка ИИ по названию — сверь с этикеткой",
  name: "Известно только название",
  miss: "",
  mine: "Твой продукт",
};
