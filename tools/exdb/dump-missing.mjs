// Печатает упражнения без перевода (и с ошибками проверки) для дозаполнения
import fs from "node:fs";
const base = JSON.parse(fs.readFileSync(new URL("./exercises.json", import.meta.url), "utf8"));
const ru = {};
for (const f of fs.readdirSync(new URL("./ru/", import.meta.url))) Object.assign(ru, JSON.parse(fs.readFileSync(new URL(`./ru/${f}`, import.meta.url), "utf8")));
const redo = new Set(process.argv.slice(2));
for (const e of base) {
  if (ru[e.id] && !redo.has(e.id)) continue;
  console.log(`## ${e.id} | ${e.name} | ${e.category} | ${e.equipment} | ${e.primaryMuscles.join(",")}\n${e.instructions.join(" ").replace(/\s+/g, " ")}`);
}
