// Проверка харнеса распознавания еды: node tools/ai-food-test.mjs [id рецептов через запятую]
// Входит тестовым пользователем (секрет из .env.local), шлёт фото блюд в функцию ai-food.
import fs from "node:fs";
import sharp from "sharp";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const pub = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = pub.VITE_SUPABASE_URL;
const ANON = pub.VITE_SUPABASE_KEY;
const recipes = JSON.parse(fs.readFileSync(new URL("../public/recipes.json", import.meta.url), "utf8"));
const ids = process.argv[2]?.split(",") ?? ["syrniki-v-duhovke", "borscht-classical", "greek-salad", "chicken-teriyaki", "chicken-pilaf", "omlet-s-ovoshchami"];

const auth = await (
  await fetch(`${URL_}/functions/v1/tg-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ devSecret: env.VITE_DEV_LOGIN_SECRET, devUser: 1 }),
  })
).json();
if (!auth.access_token) throw new Error("вход не удался");

for (const id of ids) {
  const r = recipes.find((x) => x.id === id);
  if (!r?.photo) {
    console.log(`\n${id}: нет фото`);
    continue;
  }
  const file = new URL(`../public/recipes/img/${id}.webp`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
  const img = `data:image/jpeg;base64,${(await sharp(file).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer()).toString("base64")}`;
  const res = await fetch(`${URL_}/functions/v1/ai-food`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${auth.access_token}` },
    body: JSON.stringify({ image: img }),
  });
  const j = await res.json();
  console.log(`\n■ ${r.title}  (в рецепте Emli: ${r.serving.kcal} ккал на ${r.serving.grams} г)`);
  if (!res.ok) {
    console.log("  ОШИБКА", res.status, JSON.stringify(j).slice(0, 200));
    continue;
  }
  console.log(`  ИИ: «${j.dish}» — ${j.comment ?? ""}`);
  for (const it of j.items) {
    const src = it.source === "ai" ? "оценка ИИ" : it.source === "product" ? `товар: ${it.matched}${it.brand ? " (" + it.brand + ")" : ""}` : `база: ${it.matched}`;
    console.log(`   • ${it.name.padEnd(28)} ${String(it.grams).padStart(4)} г  ${String(it.kcal).padStart(4)} ккал  Б${it.protein} Ж${it.fat} У${it.carbs}  [${src}]`);
  }
  console.log(`  ИТОГО ${j.total.kcal} ккал · Б${j.total.protein} Ж${j.total.fat} У${j.total.carbs}   ⏱ ${(j.ms.total / 1000).toFixed(1)} с (фото ${(j.ms.see / 1000).toFixed(1)}, база ${(j.ms.search / 1000).toFixed(1)}, выбор ${(j.ms.pick / 1000).toFixed(1)})`);
}
