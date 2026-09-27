// Проверка и сборка базы рецептов: node tools/recipes/check.mjs [--build]
// Каждый файл data/*.json — массив рецептов. Калории считаются из ингредиентов.
import fs from "node:fs";

const CATS = ["breakfast", "soup", "main", "salad", "side", "snack", "dessert", "drink"];
const dir = new URL("./data/", import.meta.url);
const all = [];
const photosFile = new URL("./photos.json", import.meta.url);
const photos = fs.existsSync(photosFile) ? JSON.parse(fs.readFileSync(photosFile, "utf8")) : {};
const ids = new Set();
let bad = 0;
const err = (f, id, m) => {
  bad++;
  console.log(`${f}: ${id}: ${m}`);
};

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  let list;
  try {
    list = JSON.parse(fs.readFileSync(new URL(f, dir), "utf8"));
  } catch (e) {
    err(f, "-", `НЕВАЛИДНЫЙ JSON: ${e.message}`);
    continue;
  }
  if (!Array.isArray(list)) {
    err(f, "-", "файл должен быть массивом");
    continue;
  }
  for (const r of list) {
    const id = r.id ?? "?";
    if (!/^[a-z0-9-]{3,60}$/.test(id)) err(f, id, "id: латиница-через-дефис");
    if (ids.has(id)) err(f, id, "повтор id");
    ids.add(id);
    if (!/[а-яё]/i.test(r.title ?? "")) err(f, id, "нет русского названия");
    if (!CATS.includes(r.category)) err(f, id, `category должна быть одной из ${CATS.join(", ")}`);
    if (!r.emoji) err(f, id, "нет emoji");
    if (!(r.time > 0 && r.time <= 600)) err(f, id, "time — минуты 1..600");
    if (!(r.servings >= 1 && r.servings <= 20)) err(f, id, "servings 1..20");
    if (![1, 2, 3].includes(r.difficulty)) err(f, id, "difficulty 1..3");
    if (!Array.isArray(r.steps) || r.steps.length < 3 || r.steps.join(" ").length < 150) err(f, id, "steps: минимум 3 содержательных шага (150+ символов)");
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 2) {
      err(f, id, "ingredients: минимум 2");
      continue;
    }
    const tot = [0, 0, 0, 0];
    let weight = 0;
    for (const ing of r.ingredients) {
      const [k, p, fat, c] = ing.per100 ?? [];
      if (!ing.name || !(ing.grams > 0) || [k, p, fat, c].some((v) => typeof v !== "number" || v < 0)) {
        err(f, id, `ингредиент «${ing.name}»: нужны name, grams>0 и per100 [ккал, б, ж, у]`);
        continue;
      }
      const calc = p * 4 + fat * 9 + c * 4;
      if (k > 30 && ing.grams > 10 && Math.abs(calc - k) / k > 0.35 && !/спирт|вино|пиво|коньяк|ром/i.test(ing.name)) err(f, id, `«${ing.name}»: ккал ${k} не сходятся с БЖУ (${Math.round(calc)})`);
      const m = ing.grams / 100;
      tot[0] += k * m;
      tot[1] += p * m;
      tot[2] += fat * m;
      tot[3] += c * m;
      if (!ing.skipWeight) weight += ing.grams;
    }
    const per = tot.map((v) => Math.round((v / r.servings) * 10) / 10);
    if (per[0] < 20 || per[0] > 2000) err(f, id, `калорий на порцию ${per[0]} — подозрительно`);
    all.push({
      id,
      title: r.title,
      emoji: r.emoji,
      category: r.category,
      tags: r.tags ?? [],
      time: r.time,
      servings: r.servings,
      difficulty: r.difficulty,
      description: r.description ?? "",
      ingredients: r.ingredients.map((i) => ({ name: i.name, grams: i.grams, note: i.note ?? null, per100: i.per100 })),
      steps: r.steps,
      tip: r.tip ?? null,
      serving: { kcal: Math.round(per[0]), protein: per[1], fat: per[2], carbs: per[3], grams: Math.round(weight / r.servings) },
      photo: photos[id] ? { author: photos[id].author, source: photos[id].source, license: photos[id].license, link: photos[id].link } : null,
    });
  }
}
const byCat = Object.fromEntries(CATS.map((c) => [c, all.filter((r) => r.category === c).length]));
console.log(`рецептов ${all.length}, ошибок ${bad}`, byCat);
if (process.argv.includes("--build")) {
  fs.writeFileSync(new URL("../../public/recipes.json", import.meta.url), JSON.stringify(all));
  console.log("→ public/recipes.json");
}
