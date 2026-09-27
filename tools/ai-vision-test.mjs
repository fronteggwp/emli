// Проверка моделей на фото еды: node tools/ai-vision-test.mjs
// Ключ и адрес — из .env.local (AI_API_KEY, AI_BASE_URL); в вывод не попадают.
import fs from "node:fs";
import sharp from "sharp";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const KEY = env.AI_API_KEY;
const BASE = env.AI_BASE_URL;
const MODELS = process.argv[2]?.split(",") ?? ["deepseek-v4-flash", "deepseek-v4.1-flash", "deepseek-v4.1-flash-official", "glm-5.2", "glm-5.3", "glm-5.3-flash", "kimi-k2.7-code"];
const DISHES = [
  ["syrniki-v-duhovke", "Сырники", 251],
  ["borscht-classical", "Борщ со сметаной", 321],
  ["greek-salad", "Греческий салат", 312],
  ["chicken-teriyaki", "Курица терияки", 550],
];
const PROMPT =
  "Ты нутрициолог. Посмотри на фото. Определи блюдо и оцени порцию, которая на фото. " +
  'Ответь ТОЛЬКО JSON без пояснений: {"dish": "название по-русски", "grams": число, "kcal": число, "protein": число, "fat": число, "carbs": число}';

async function img(id) {
  const buf = await sharp(new URL(`../public/recipes/img/${id}.webp`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")).resize(768).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

const images = Object.fromEntries(await Promise.all(DISHES.map(async ([id]) => [id, await img(id)])));

for (const model of MODELS) {
  console.log(`\n=== ${model}`);
  for (const [id, title, kcal] of DISHES) {
    const t0 = Date.now();
    let out = "";
    try {
      const res = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          temperature: 0.2,
          messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: images[id] } }] }],
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const j = await res.json().catch(() => null);
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      if (!res.ok || !j?.choices) {
        out = `ОШИБКА ${res.status}: ${JSON.stringify(j?.error?.message ?? j).slice(0, 140)}`;
      } else {
        const text = j.choices[0].message.content ?? "";
        const m = text.match(/\{[\s\S]*\}/);
        let parsed = null;
        try {
          parsed = m ? JSON.parse(m[0]) : null;
        } catch {}
        out = parsed
          ? `${sec}с | «${parsed.dish}» ${parsed.grams}г ${parsed.kcal} ккал (Б${parsed.protein} Ж${parsed.fat} У${parsed.carbs}) | tok ${j.usage?.prompt_tokens}/${j.usage?.completion_tokens}`
          : `${sec}с | не JSON: ${text.replace(/\s+/g, " ").slice(0, 120)}`;
      }
    } catch (e) {
      out = `ОШИБКА: ${e.message}`;
    }
    console.log(`  ${title.padEnd(18)} (≈${kcal}) → ${out}`);
  }
}
