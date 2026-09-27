// Словарь ингредиентов для списка покупок: ИИ один раз размечает все названия из рецептов.
// node tools/ingredients-gen.mjs → public/ingredients.json (потом проверяем глазами и правим руками)
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const KEY = env.AI_API_KEY;
const BASE = (env.AI_BASE_URL || "https://vip.auto-code.net").replace(/\/$/, "");
const MODEL = "deepseek-v4.1-flash";

const recipes = JSON.parse(fs.readFileSync("public/recipes.json", "utf8"));
const names = [...new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.name)))].sort();
const out = fs.existsSync("public/ingredients.json") ? JSON.parse(fs.readFileSync("public/ingredients.json", "utf8")) : {};
const todo = names.filter((n) => !out[n]);
console.log(`всего ${names.length}, осталось ${todo.length}`);

const PROMPT = `Ты помогаешь составить список покупок в российском магазине. Для каждого ингредиента из рецептов верни объект:
"n": короткое общее название для списка покупок, чтобы одинаковые продукты склеивались ("Помидоры свежие", "Помидор" → "Помидоры"; "Куриное филе", "Грудка куриная" → "Куриное филе"; "Творог 5%" оставь с жирностью; "Лук репчатый", "Луковица" → "Лук репчатый"). С большой буквы.
"d": отдел: veg (овощи, зелень, грибы), fruit (фрукты, ягоды), meat (мясо, птица, колбасы), fish (рыба, морепродукты), dairy (молочное, сыр, яйца), grain (крупы, макароны, мука, хлопья), bakery (хлеб, лаваш, лепёшки), can (консервы, соусы, бульоны), nuts (орехи, семена, сухофрукты), frozen (заморозка), other (прочее: протеин, какао, шоколад), pantry (соль, перец, специи, сахар, масло растительное/оливковое, уксус, разрыхлитель, ваниль — то, что обычно есть дома).
"u": как считать в магазине, если естественно штуками или упаковками: {"w":"шт","g":вес одной штуки в граммах} (яйцо 55, лимон 120, луковица 90, помидор 120, огурец 120, морковь 80, картофель 120, банан 120, яблоко 180, перец болгарский 150, авокадо 150, чеснок — {"w":"зубч.","g":5}) или упаковка {"w":"пачка","g":200} (творог 200, масло сливочное 180, сыр твёрдый 200, сметана 300, консервы банка 400/тунец 185), молоко/кефир {"w":"бут.","g":900}. Иначе null.
"l": true, если это жидкость (считаем в мл), иначе false.
"s": "skip" — если покупать не нужно (вода, кипяток, лёд); иначе null.
"x": массив меток ограничений из набора: fish (рыба), seafood (морепродукты), pork (свинина, бекон, сало), beef, poultry, meat (любое мясо и мясные продукты, в т.ч. бульон, колбаса), dairy (молоко и молочные продукты, сыр, сливочное масло), egg, gluten (пшеница, мука, макароны, хлеб, булгур, кускус, манка, перловка, ячмень, овсянка не всегда — ставь только для явных пшеничных/ржаных/ячменных), nuts (орехи, арахис, ореховая паста), mushroom, sugar (сахар, мёд, сгущёнка, сиропы), alcohol, honey. Пустой массив, если ничего.
Ответ — только JSON: {"items": {"<исходное название>": {"n":..,"d":..,"u":..,"l":..,"s":..,"x":[..]}, ...}} для ВСЕХ названий ниже, ключи — ровно как в списке.`;

async function ask(batch) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 8000,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Отвечай только валидным JSON." },
        { role: "user", content: `${PROMPT}\n\n${batch.map((n) => `- ${n}`).join("\n")}` },
      ],
    }),
  });
  const j = await res.json();
  const txt = j.choices?.[0]?.message?.content ?? "";
  return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)).items;
}

const SIZE = 45;
for (let i = 0; i < todo.length; i += SIZE) {
  const batch = todo.slice(i, i + SIZE);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const items = await ask(batch);
      let got = 0;
      for (const n of batch) if (items[n]) (out[n] = items[n]), got++;
      console.log(`${i + batch.length}/${todo.length}: +${got}`);
      break;
    } catch (e) {
      console.log("повтор", e.message);
    }
  }
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  fs.writeFileSync("public/ingredients.json", JSON.stringify(sorted, null, 0).replace(/},"/g, '},\n"'));
}
console.log("готово", Object.keys(out).length);
