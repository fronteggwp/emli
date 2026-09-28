import fs from "node:fs";
import sharp from "sharp";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const MODEL = process.argv[2] ?? "deepseek-v4.1-flash";
async function call(content, max, extra) {
  const t0 = Date.now();
  const res = await fetch(`${env.A6_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.A6_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: max, temperature: 0.2, messages: [{ role: "user", content }], ...extra }),
    signal: AbortSignal.timeout(150000),
  }).catch((e) => ({ status: e.message, json: async () => null }));
  const j = await res.json().catch(() => null);
  const m = j?.choices?.[0]?.message;
  const text = m?.content ?? "";
  let p = null;
  try { p = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "x"); } catch {}
  return { sec: ((Date.now() - t0) / 1000).toFixed(1), p, tok: j?.usage?.completion_tokens, rs: m?.reasoning_content?.length ?? 0, err: p ? null : `${res.status} ${String(j?.error?.message ?? text).replace(/\s+/g, " ").slice(0, 90)}` };
}
console.log(`=== ${MODEL}`);
const V = { "без параметров": {}, "thinking disabled": { thinking: { type: "disabled" } }, "reasoning_effort low": { reasoning_effort: "low" }, "enable_thinking false": { enable_thinking: false } };
for (const [name, extra] of Object.entries(V)) {
  const r = await call('Сколько ккал в 100 г гречки варёной? Ответ только JSON: {"kcal":0}', 1500, extra);
  console.log(`  JSON  ${name.padEnd(22)} ${r.sec}с | ток ${r.tok} | рассужд. ${r.rs} симв | ${r.p ? JSON.stringify(r.p) : "ОШИБКА " + r.err}`);
}
const best = { thinking: { type: "disabled" } };
const img = async (id) => `data:image/jpeg;base64,${(await sharp(`public/recipes/img/${id}.webp`).resize(768).jpeg({ quality: 82 }).toBuffer()).toString("base64")}`;
for (const [id, title, ref] of [["greek-salad", "Греческий салат", 312], ["chicken-teriyaki", "Курица терияки", 550], ["syrniki-v-duhovke", "Сырники", 251]]) {
  const r = await call([{ type: "text", text: 'Определи блюдо на фото (по-русски) и оцени порцию. Только JSON: {"dish":"","grams":0,"kcal":0}' }, { type: "image_url", image_url: { url: await img(id) } }], 2000, best);
  console.log(`  фото  ${title.padEnd(16)} ${r.sec}с | ${r.p ? `«${r.p.dish}» ${r.p.grams}г ${r.p.kcal} ккал (рецепт ≈${ref})` : "ОШИБКА " + r.err} | ток ${r.tok}`);
}
const recipes = JSON.parse(fs.readFileSync("public/recipes.json", "utf8"));
const cands = recipes.filter((r) => r.category !== "drink").slice(0, 60).map((r, i) => `r${i + 1} | ${r.title} | ${r.category} | ${Math.round(r.serving.kcal)}ккал ${Math.round(r.serving.protein)}б`).join("\n");
const r = await call(`Составь меню на 3 дня (завтрак, обед, ужин, перекус), 2000 ккал и белок 140 г в день. Только коды из списка.\n${cands}\nОтвет JSON: {"note":"","slots":[{"d":1,"m":0,"r":"r1","cook":true}]}`, 4000, best);
console.log(`  меню 3 дня             ${r.sec}с | ${r.p ? `слотов ${r.p.slots?.length}, заметка: ${String(r.p.note).slice(0, 70)}` : "ОШИБКА " + r.err} | ток ${r.tok}`);
