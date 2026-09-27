// Загрузка товаров Open Food Facts (Россия, Беларусь, Казахстан, Украина…) с КБЖУ в общую базу штрихкодов Emli.
// node tools/barcode-import.mjs [страны через запятую]   — через API поиска (медленно, лимиты)
// node tools/barcode-import.mjs --file                    — из выгрузки tools/.cache/off-cis.json (python tools/off-extract.py)
// Данные Open Food Facts — лицензия ODbL (открытые, с указанием источника). Лимит поиска OFF — 10 запросов в минуту.
import fs from "node:fs";

const read = (p) =>
  Object.fromEntries(
    fs.readFileSync(new URL(p, import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
const env = read("../.env.local");
const pub = read("../.env");
const countries = (process.argv[2] ?? "russia,belarus,kazakhstan,ukraine,uzbekistan,armenia,georgia,moldova,kyrgyzstan").split(",");
const FIELDS = "code,product_name,product_name_ru,generic_name_ru,brands,nutriments,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,image_front_small_url";
const UA = "Emli/1.0 (nutrition diary import; https://t.me/myemli_bot)";
const PAGE = 100;

const num = (v) => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
};
const r1 = (n) => Math.round(n * 10) / 10;
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const realName = (s) => {
  const t = clip(s, 160);
  return t.length > 2 && /[a-zа-яё]{2,}/i.test(t) ? t : null;
};
function checksumOk(code) {
  if (![8, 12, 13, 14].includes(code.length) || !/^\d+$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function toRow(p) {
  const code = String(p.code ?? "");
  if (!checksumOk(code)) return null;
  const name = realName(p.product_name_ru) ?? realName(p.product_name) ?? realName(p.generic_name_ru);
  if (!name) return null;
  const n = p.nutriments ?? {};
  let kcal = num(n["energy-kcal_100g"]);
  if (!Number.isFinite(kcal)) {
    const kj = num(n["energy-kj_100g"] ?? n["energy_100g"]);
    if (Number.isFinite(kj)) kcal = kj / 4.184;
  }
  const protein = num(n["proteins_100g"]);
  const fat = num(n["fat_100g"]);
  const carbs = num(n["carbohydrates_100g"]);
  if (!Number.isFinite(kcal) || [protein, fat, carbs].filter(Number.isFinite).length < 2) return null;
  const v = { kcal: r1(kcal), protein: r1(Number.isFinite(protein) ? protein : 0), fat: r1(Number.isFinite(fat) ? fat : 0), carbs: r1(Number.isFinite(carbs) ? carbs : 0) };
  // Отбрасываем явные ошибки ввода: калории не сходятся с БЖУ
  if (v.kcal > 950 || v.protein + v.fat + v.carbs > 105 || v.protein > 100 || v.fat > 100 || v.carbs > 100) return null;
  if (Math.abs(v.protein * 4 + v.fat * 9 + v.carbs * 4 - v.kcal) > Math.max(45, v.kcal * 0.3)) return null;
  const unit = String(p.product_quantity_unit ?? "").toLowerCase();
  const serving = String(p.serving_quantity_unit ?? "g").toLowerCase() === "g" && num(p.serving_quantity) > 0 && num(p.serving_quantity) < 2000 ? r1(num(p.serving_quantity)) : null;
  return {
    barcode: code,
    name,
    brand: clip(String(p.brands ?? "").split(",")[0], 80) || null,
    ...v,
    serving_g: serving,
    net_g: num(p.product_quantity) > 0 && num(p.product_quantity) < 20000 ? r1(num(p.product_quantity)) : null,
    liquid: unit === "ml" || unit === "l",
    source: "off",
    trust: 90,
    image_url: p.image_front_small_url ?? null,
  };
}

async function get(url) {
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
      if (res.status === 429 || res.status >= 500) throw new Error(String(res.status));
      return await res.json();
    } catch (e) {
      console.log("  повтор через 20 с:", e.message);
      await new Promise((r) => setTimeout(r, 20000));
    }
  }
  return null;
}

async function upload(rows) {
  for (let i = 0; i < rows.length; i += 1000) {
    const res = await fetch(`${pub.VITE_SUPABASE_URL}/functions/v1/barcode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: pub.VITE_SUPABASE_KEY, "x-admin-secret": env.ADMIN_SECRET },
      body: JSON.stringify({ action: "import", items: rows.slice(i, i + 1000) }),
    });
    const j = await res.json();
    if (!j.ok) console.log("  ошибка загрузки:", j.error);
  }
}

/** Картинка лицевой стороны по коду товара (как её раскладывает Open Food Facts) */
function frontUrl(code, key, rev) {
  if (!key || !rev) return null;
  const path = code.length > 8 ? `${code.slice(0, 3)}/${code.slice(3, 6)}/${code.slice(6, 9)}/${code.slice(9)}` : code;
  return `https://images.openfoodfacts.org/images/products/${path}/${key}.${rev}.200.jpg`;
}

if (process.argv[2] === "--file") {
  const file = new URL("./.cache/off-cis.json", import.meta.url);
  const lines = fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  const rows = [];
  const seen = new Set();
  for (const l of lines) {
    const x = JSON.parse(l);
    const n = (v) => (v == null || v === "" ? NaN : Number(v));
    const kcal = Number.isFinite(n(x.kcal)) ? n(x.kcal) : (Number.isFinite(n(x.kj)) ? n(x.kj) : n(x.energy)) / 4.184;
    // Объём/масса упаковки в CSV — строкой («500 мл», «0,9 л»)
    const q = String(x.quantity ?? "").toLowerCase();
    const liquid = /\d\s*(мл|ml|л|l)/.test(q);
    const row = toRow({
      code: x.code,
      product_name_ru: x.name_ru,
      product_name: x.name_main ?? x.name_any,
      brands: x.brands,
      nutriments: { "energy-kcal_100g": kcal, proteins_100g: n(x.protein), fat_100g: n(x.fat), carbohydrates_100g: n(x.carbs) },
      serving_quantity: x.serving_quantity,
      product_quantity: x.product_quantity,
      product_quantity_unit: x.product_quantity_unit ?? (liquid ? "ml" : "g"),
      image_front_small_url: x.image_url ?? frontUrl(String(x.code), x.front_key, x.front_rev),
    });
    if (row && !seen.has(row.barcode)) {
      seen.add(row.barcode);
      rows.push(row);
    }
  }
  console.log(`в выгрузке ${lines.length}, годных (название + КБЖУ сходятся) ${rows.length}`);
  for (let i = 0; i < rows.length; i += 5000) {
    await upload(rows.slice(i, i + 5000));
    console.log(`загружено ${Math.min(i + 5000, rows.length)} / ${rows.length}`);
  }
  process.exit(0);
}

let total = 0;
for (const c of countries) {
  let page = 1;
  let pages = 1;
  let kept = 0;
  do {
    const d = await get(`https://world.openfoodfacts.org/api/v2/search?countries_tags_en=${c}&states_tags=en:nutrition-facts-completed&fields=${FIELDS}&page_size=${PAGE}&page=${page}&sort_by=code`);
    if (!d) {
      page++;
      continue;
    }
    pages = Math.ceil((d.count ?? 0) / PAGE);
    const seen = new Set();
    const rows = (d.products ?? []).map(toRow).filter((r) => r && !seen.has(r.barcode) && seen.add(r.barcode));
    await upload(rows);
    kept += rows.length;
    console.log(`${c}: страница ${page}/${pages}, взяли ${rows.length} из ${(d.products ?? []).length}`);
    page++;
    await new Promise((r) => setTimeout(r, 6500)); // не чаще 10 запросов в минуту
  } while (page <= pages);
  console.log(`== ${c}: ${kept}`);
  total += kept;
}
console.log("Всего загружено:", total);
