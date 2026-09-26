// Собирает public/ex/catalog.json из free-exercise-db (exercises.json) и переводов tools/exdb/ru/*.json.
// Запуск: node tools/exdb/build.mjs
import fs from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const base = JSON.parse(fs.readFileSync(here("./exercises.json"), "utf8"));
const ru = {};
for (const f of fs.readdirSync(here("./ru/")).filter((f) => f.endsWith(".json"))) {
  Object.assign(ru, JSON.parse(fs.readFileSync(here(`./ru/${f}`), "utf8")));
}

const seen = new Set();
const out = [];
for (const e of base) {
  if (seen.has(e.id)) continue;
  seen.add(e.id);
  const t = ru[e.id];
  out.push({
    id: e.id,
    n: t?.n ?? e.name,
    en: e.name,
    a: t?.a ?? [],
    c: e.category,
    e: e.equipment ?? null,
    l: e.level,
    f: e.force ?? null,
    m: e.mechanic ?? null,
    pm: e.primaryMuscles,
    sm: e.secondaryMuscles,
    i: t?.i ?? e.instructions,
    t: t?.t ?? [],
    p: t?.p ?? 0,
    img: e.images.length,
  });
}
out.sort((a, b) => b.p - a.p || a.n.localeCompare(b.n, "ru"));
fs.writeFileSync(new URL("../../public/ex/catalog.json", import.meta.url), JSON.stringify(out));
const translated = out.filter((e) => ru[e.id]).length;
console.log(`catalog: ${out.length} упражнений, переведено ${translated}`);
