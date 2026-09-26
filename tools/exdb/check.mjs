// Проверка переводов: node tools/exdb/check.mjs — сверяет ru/*.json с базой.
// Файлы читаются по порядку имён, более поздний перекрывает ранний (как в build.mjs).
import fs from "node:fs";
const base = JSON.parse(fs.readFileSync(new URL("./exercises.json", import.meta.url), "utf8"));
const ids = new Set(base.map((e) => e.id));
const dir = new URL("./ru/", import.meta.url);
const final = new Map();
let bad = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(new URL(f, dir), "utf8"));
  } catch (e) {
    console.log(`${f}: НЕВАЛИДНЫЙ JSON — ${e.message}`);
    bad++;
    continue;
  }
  for (const [id, v] of Object.entries(data)) {
    if (!ids.has(id)) {
      console.log(`${f}: неизвестный id ${id}`);
      bad++;
      continue;
    }
    final.set(id, { f, v });
  }
}
for (const [id, { f, v }] of final) {
  if (typeof v.n !== "string" || !v.n) { console.log(`${f}: ${id} без n`); bad++; }
  if (!/[а-яё]/i.test(v.n ?? "")) { console.log(`${f}: ${id} название не по-русски: ${v.n}`); bad++; }
  if (!Array.isArray(v.i) || v.i.length < 3) { console.log(`${f}: ${id} мало шагов i`); bad++; }
  const text = (v.i ?? []).join(" ");
  if (text.length < 70) { console.log(`${f}: ${id} слишком короткая техника (${text.length} симв.)`); bad++; }
  if (/Исходное положение установлено|Выполняйте движение/.test(text)) { console.log(`${f}: ${id} заглушка вместо перевода`); bad++; }
}
const missing = [...ids].filter((id) => !final.has(id));
console.log(`переведено ${final.size} из ${ids.size}, ошибок ${bad}, не хватает ${missing.length}`);
if (missing.length && missing.length < 80) console.log(missing.join("\n"));
