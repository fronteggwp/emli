// Выгрузка товаров СНГ из полного экспорта Open Food Facts в JSONL (~13 ГБ, как в API: КБЖУ полнее, чем в CSV).
// 1) curl -L -C - -o tools/.cache/off-products.jsonl.gz https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
// 2) node tools/off-extract-jsonl.mjs      → tools/.cache/off-cis.json
// 3) node tools/barcode-import.mjs --file  → общая база штрихкодов Emli
// Читаем потоком, строку разбираем только если товар из нужных стран или с кодом этих стран.
import fs from "node:fs";
import zlib from "node:zlib";
import readline from "node:readline";

const SRC = new URL("./.cache/off-products.jsonl.gz", import.meta.url);
const OUT = new URL("./.cache/off-cis.json", import.meta.url);
const COUNTRIES = ["russia", "belarus", "kazakhstan", "ukraine", "uzbekistan", "armenia", "georgia", "moldova", "kyrgyzstan", "azerbaijan", "tajikistan"].map((c) => `"en:${c}"`);
// GS1: 460–469 Россия, 470 Киргизия, 476 Азербайджан, 478 Узбекистан, 481 Беларусь, 482 Украина, 484 Молдова, 485 Армения, 486 Грузия, 487 Казахстан
const PREFIX = /^(46\d|470|476|478|481|482|484|485|486|487)\d{10}$/;
const CODE = /"code":"(\d{8,14})"/;

const out = fs.createWriteStream(OUT);
const rl = readline.createInterface({ input: fs.createReadStream(SRC).pipe(zlib.createGunzip()), crlfDelay: Infinity });
let lines = 0;
let kept = 0;
let withKcal = 0;
const t0 = Date.now();
for await (const line of rl) {
  lines++;
  if (lines % 250000 === 0) console.log(`${lines} строк, взяли ${kept} (с КБЖУ ${withKcal}), ${Math.round((Date.now() - t0) / 1000)} с`);
  const code = CODE.exec(line)?.[1];
  if (!code) continue;
  if (!PREFIX.test(code) && !COUNTRIES.some((c) => line.includes(c))) continue;
  let p;
  try {
    p = JSON.parse(line);
  } catch {
    continue;
  }
  const n = p.nutriments ?? {};
  const row = {
    code,
    brands: p.brands ?? null,
    product_quantity: p.product_quantity ?? null,
    product_quantity_unit: p.product_quantity_unit ?? null,
    serving_quantity: p.serving_quantity ?? null,
    name_ru: p.product_name_ru ?? null,
    name_main: p.product_name ?? null,
    name_any: p.generic_name_ru ?? p.generic_name ?? null,
    kcal: n["energy-kcal_100g"] ?? null,
    kj: n["energy-kj_100g"] ?? null,
    energy: n["energy_100g"] ?? null,
    protein: n["proteins_100g"] ?? null,
    fat: n["fat_100g"] ?? null,
    carbs: n["carbohydrates_100g"] ?? null,
    quantity: p.quantity ?? null,
    image_url: p.image_front_small_url ?? null,
  };
  if (row.kcal != null || row.kj != null || row.energy != null) withKcal++;
  out.write(JSON.stringify(row) + "\n");
  kept++;
}
out.end();
console.log(`готово: ${lines} строк, товаров СНГ ${kept}, с КБЖУ ${withKcal}, за ${Math.round((Date.now() - t0) / 1000)} с`);
