// Проверка поиска по штрихкоду: node tools/barcode-test.mjs [коды через запятую]
// Входит тестовым пользователем и прогоняет коды через функцию barcode (цепочка источников).
import fs from "node:fs";

const read = (p) =>
  Object.fromEntries(
    fs.readFileSync(new URL(p, import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
const env = read("../.env.local");
const pub = read("../.env");
const codes = process.argv[2]?.split(",") ?? ["4810268047602", "4810112010516", "4810074000150", "4810285013321", "4601576009686", "4810268047603"];

const auth = await (
  await fetch(`${pub.VITE_SUPABASE_URL}/functions/v1/tg-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: pub.VITE_SUPABASE_KEY },
    body: JSON.stringify({ devSecret: env.VITE_DEV_LOGIN_SECRET, devUser: 1 }),
  })
).json();
if (!auth.access_token) throw new Error("вход не удался");

for (const code of codes) {
  const t0 = Date.now();
  const res = await fetch(`${pub.VITE_SUPABASE_URL}/functions/v1/barcode`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: pub.VITE_SUPABASE_KEY, Authorization: `Bearer ${auth.access_token}` },
    body: JSON.stringify({ action: "lookup", code }),
  });
  const j = await res.json();
  const p = j.product;
  console.log(
    `${code}  ${j.status?.padEnd(8)} ${((Date.now() - t0) / 1000).toFixed(1)}с  [${(j.tried ?? []).join(" → ")}]` +
      (p ? `\n    «${p.name}»${p.brand ? ` (${p.brand})` : ""} · ${p.source} · ${p.kcal ?? "—"} ккал Б${p.protein ?? "—"} Ж${p.fat ?? "—"} У${p.carbs ?? "—"}${p.net_g ? ` · ${p.net_g}${p.liquid ? " мл" : " г"}` : ""}` : ""),
  );
}
