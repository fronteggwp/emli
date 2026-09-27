// Проверка плана питания с ИИ: node tools/ai-plan-test.mjs [дней] [--direct]
// Входит тестовым пользователем и шлёт в ai-plan те же данные, что и приложение.
// --direct — тот же промпт прямо в шлюз ИИ (видно сырой ответ модели).
import fs from "node:fs";

const read = (p) =>
  Object.fromEntries(
    fs.readFileSync(new URL(p, import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
const env = read("../.env.local");
const pub = read("../.env");
const days = Number(process.argv[2] ?? 7);
const recipes = JSON.parse(fs.readFileSync(new URL("../public/recipes.json", import.meta.url), "utf8"));
const CAT = { breakfast: "завтрак", main: "горячее", soup: "суп", salad: "салат", side: "гарнир", snack: "перекус", dessert: "десерт" };
const cands = recipes
  .filter((r) => r.category !== "drink" && r.category !== "dessert")
  .map((r, i) => ({ c: `r${i + 1}`, t: r.title, k: CAT[r.category], min: r.time, s: r.servings, kcal: Math.round(r.serving.kcal), p: Math.round(r.serving.protein), tags: r.tags.join(", ") }));
const body = {
  mode: "plan",
  prefs: { meals: [0, 1, 2, 3], cook: "batch", time: 30, people: 2, exclude: ["Без свинины"], style: ["Больше белка — белок в каждом приёме"], wishes: "люблю курицу и творог, в пятницу ужин в гостях" },
  days: Array.from({ length: days }, (_, i) => ({ d: i + 1, label: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"][i % 7], weekend: i % 7 >= 5, kcal: 2040, protein: 144 })),
  cands,
};
console.log(`кандидатов: ${cands.length}, дней: ${days}, размер запроса: ${JSON.stringify(body).length} байт`);

const auth = await (
  await fetch(`${pub.VITE_SUPABASE_URL}/functions/v1/tg-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: pub.VITE_SUPABASE_KEY },
    body: JSON.stringify({ devSecret: env.VITE_DEV_LOGIN_SECRET, devUser: 1 }),
  })
).json();
if (!auth.access_token) throw new Error("вход не удался");
const t0 = Date.now();
const res = await fetch(`${pub.VITE_SUPABASE_URL}/functions/v1/ai-plan`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: pub.VITE_SUPABASE_KEY, Authorization: `Bearer ${auth.access_token}` },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(`HTTP ${res.status} за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
let j;
try {
  j = JSON.parse(text);
} catch {
  console.log(text.slice(0, 500));
  process.exit(1);
}
if (!res.ok) {
  console.log(j);
  process.exit(1);
}
console.log("Заметка:", j.note);
console.log("Слотов:", j.slots.length, "ms:", j.ms);
const byCode = new Map(cands.map((c) => [c.c, c]));
for (let d = 1; d <= days; d++) {
  console.log(`\nДень ${d}:`);
  for (const s of j.slots.filter((x) => x.d === d)) console.log(`  ${["завтрак", "обед", "ужин", "перекус"][s.m]}: ${byCode.get(s.r)?.t ?? s.r}${s.cook ? "" : "  (заготовка)"}`);
}
