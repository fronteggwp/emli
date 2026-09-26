// Печатает пачку упражнений для перевода: node dump.mjs <номер пачки> [размер]
import fs from "node:fs";
const list = JSON.parse(fs.readFileSync(new URL("./exercises.json", import.meta.url), "utf8")).sort((a, b) => a.id.localeCompare(b.id));
const k = Number(process.argv[2] ?? 0);
const size = Number(process.argv[3] ?? 60);
const batch = list.slice(k * size, (k + 1) * size);
for (const e of batch) {
  const instr = e.instructions.join(" ").replace(/\s+/g, " ");
  console.log(`## ${e.id} | ${e.name} | ${e.category} | ${e.equipment} | ${e.primaryMuscles.join(",")}\n${instr}`);
}
console.error(`batch ${k}: ${batch.length} of ${list.length}`);
