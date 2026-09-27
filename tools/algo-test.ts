// Автотесты алгоритмов: npm test
// Каждый тест проверяет конкретное правило; при ошибке процесс завершается с кодом 1.
import assert from "node:assert/strict";
import { planFor, historyFor, roleOf, sessionSuccess, type Session } from "../src/lib/progression";
import { estimateTdee, trendSeries, macrosFor, checkinPlan, isCompleteDay, completeDays, caloriesFor } from "../src/lib/nutrition";
import { burnedKcal, e1rm, type Exercise } from "../src/lib/exercise";
import { planSplit, withPlans, type CheatPlan } from "../src/lib/cheat";
import { buildPlan, cookSessions, shoppingList, qtyText, removeItem, replaceItem, sumItems, type Dish, type PlanPrefs, type Dict } from "../src/lib/mealplan";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("  ✓", name);
  } catch (e) {
    failed++;
    console.log("  ✗", name, "\n    ", e instanceof Error ? e.message : e);
  }
}

const squat = { id: "Barbell_Squat", n: "Присед", e: "barbell", pm: ["quadriceps"], sm: [], c: "strength", f: "push" } as unknown as Exercise;
const bench = { id: "Bench", n: "Жим", e: "barbell", pm: ["chest"], sm: [], c: "strength", f: "push" } as unknown as Exercise;
const ses = (w: number, reps: number[], o: { target?: string; planned?: number; program?: string; day?: number } = {}): Session => ({
  at: "2026-09-01",
  programDay: o.day ?? 0,
  program: o.program ?? null,
  sets: reps.map((r, i) => ({ weight: w, reps: r, kind: "normal", target: o.target ?? null, planned: o.planned ?? null, order: i })),
});
const base = { programDayTitle: undefined, bestE1rm: null, programSessions: 5 };

console.log("\nПрогрессия");
test("линейная: все 3 подхода по 5 → +5 кг к приседу", () => {
  const p = planFor({ ...base, program: "starting-strength", role: "main", ex: squat, targetReps: "5", workingSets: 3, history: [ses(100, [5, 5, 5], { planned: 3, target: "5" })] });
  assert.equal(p.weight, 105);
});
test("линейная: выполнен 1 подход из 3 — НЕ прибавляем", () => {
  const p = planFor({ ...base, program: "starting-strength", role: "main", ex: squat, targetReps: "5", workingSets: 3, history: [ses(100, [5], { planned: 3, target: "5" })] });
  assert.equal(p.weight, 100);
  assert.equal(p.tone, "same");
});
test("линейная: 3 неудачи на одном весе → −10%", () => {
  const h = [ses(100, [5, 4, 3], { planned: 3 }), ses(100, [5, 5, 4], { planned: 3 }), ses(100, [4, 4, 4], { planned: 3 })];
  const p = planFor({ ...base, program: "starting-strength", role: "main", ex: squat, targetReps: "5", workingSets: 3, history: h });
  assert.equal(p.weight, 90);
});
test("двойная: неполная тренировка на верху диапазона — НЕ прибавляем", () => {
  const p = planFor({ ...base, program: "phul", role: "main", ex: bench, targetReps: "8-12", workingSets: 3, history: [ses(60, [12], { planned: 3 })] });
  assert.notEqual(p.tone, "up");
});
test("двойная: все подходы на верху → +2,5", () => {
  const p = planFor({ ...base, program: "phul", role: "main", ex: bench, targetReps: "8-12", workingSets: 3, history: [ses(60, [12, 12, 12], { planned: 3 })] });
  assert.equal(p.weight, 62.5);
});
test("GZCLP T1: успешные 6×2 → прибавка, этап 6×2 сохраняется", () => {
  const p = planFor({ ...base, program: "gzclp", role: "t1", ex: squat, targetReps: "3", workingSets: 5, history: [ses(100, [2, 2, 2, 2, 2, 2], { planned: 6, target: "2" })] });
  assert.equal(p.weight, 105);
  assert.equal(p.sets?.length, 6);
  assert.equal(p.tone, "up");
});
test("GZCLP T1: провал 5×3 → 6×2 тем же весом", () => {
  const p = planFor({ ...base, program: "gzclp", role: "t1", ex: squat, targetReps: "3", workingSets: 5, history: [ses(100, [3, 3, 3, 2, 2], { planned: 5, target: "3" })] });
  assert.equal(p.sets?.length, 6);
  assert.equal(p.weight, 100);
});
test("GZCLP T1: провал 10×1 → сброс 85%", () => {
  const p = planFor({ ...base, program: "gzclp", role: "t1", ex: squat, targetReps: "3", workingSets: 5, history: [ses(100, [1, 1, 1, 1, 1, 1, 1, 1, 0, 0], { planned: 10, target: "1" })] });
  assert.equal(p.weight, 85);
});
test("5/3/1: ТМ хранится и растёт на +5 после цикла (присед)", () => {
  const p0 = planFor({ ...base, program: "531-bbb", role: "main", ex: squat, targetReps: "3-5", workingSets: 3, history: [], programSessions: 0, tm: { tm: 120, cycle: 0 } });
  const p1 = planFor({ ...base, program: "531-bbb", role: "main", ex: squat, targetReps: "3-5", workingSets: 3, history: [], programSessions: 16, tm: { tm: 120, cycle: 0 } });
  assert.equal(p0.sets?.[2].w, 102.5); // 85% от 120
  assert.equal(p1.sets?.[2].w, 107.5); // 85% от 125
});
test("5/3/1: роль берётся из шаблона, подсобка с 10 повторами — не BBB", () => {
  assert.equal(roleOf("Можно разбивать на мини-сеты", "531-bbb"), "accessory");
  assert.equal(roleOf("BBB: 50–60%", "531-bbb"), "bbb");
  assert.equal(roleOf("Волна 5/3/1", "531-bbb"), "main");
});
test("история: только своя программа", () => {
  const h = historyFor([ses(100, [5], { program: "gzclp" }), ses(80, [5], { program: "starting-strength" })], "starting-strength", "5", "main");
  assert.equal(h.length, 1);
  assert.equal(h[0].sets[0].weight, 80);
});
test("успех сессии учитывает цель каждого подхода", () => {
  assert.equal(sessionSuccess(ses(100, [2, 2, 2, 2, 2, 2], { planned: 6, target: "2" }), 3, 5), true);
});

console.log("\nТренировки");
test("1ПМ: больше 12 повторов не считаем (как на сервере)", () => {
  assert.equal(e1rm(60, 15), 0);
  assert.equal(e1rm(100, 5), 116.7);
});
test("калории: один короткий подход в открытой час тренировке ≠ час работы", () => {
  const kcal = burnedKcal([{ met: 7.5, minutes: 0.5 }], 80, 60);
  assert.ok(kcal < 20, `получилось ${kcal}`);
});
test("калории: работа не больше реальной длительности", () => {
  const kcal = burnedKcal([{ met: 5, minutes: 120 }], 80, 30);
  assert.equal(kcal, Math.round((4 * 80 * 30) / 60));
});

console.log("\nПитание");
const days: string[] = [];
const d0 = new Date("2026-08-01T12:00:00Z");
for (let i = 0; i < 50; i++) days.push(new Date(d0.getTime() + i * 864e5).toISOString().slice(0, 10));
const noise = (i: number) => Math.sin(i * 12.9898) * 0.6;
test("тренд гасит выброс", () => {
  const w = days.map((d, i) => ({ day: d, weight_kg: 80 + (i === 30 ? 3 : 0), body_fat: null }));
  const t = trendSeries(w, days[49]);
  assert.ok(Math.abs(t[30].trend - 80) < 0.5);
});
test("расход: регулярные данные → ≈2500 (±3%)", () => {
  const weights = days.map((d, i) => ({ day: d, weight_kg: 80 - (0.5 / 7) * i + noise(i), body_fat: null })).filter((_, i) => i % 3 !== 1);
  const trend = trendSeries(weights, days[49]);
  const totals = days.map((d, i) => ({ day: d, kcal: i % 9 === 4 ? 600 : 1950, protein: 0, fat: 0, carbs: 0, entries: 5 }));
  const est = estimateTdee(totals, trend, 2300, days[49]);
  assert.ok(Math.abs(est.value - 2500) / 2500 < 0.03, `получилось ${est.value}`);
});
test("расход: одно давнее взвешивание → уверенность 0, остаёмся на формуле", () => {
  const trend = trendSeries([{ day: days[0], weight_kg: 80, body_fat: null }], days[49]);
  const totals = days.map((d) => ({ day: d, kcal: 1500, protein: 0, fat: 0, carbs: 0, entries: 5 }));
  const est = estimateTdee(totals, trend, 2500, days[49]);
  assert.equal(est.confidence, 0);
  assert.equal(est.value, 2500);
});
test("полнота дня: одна запись на треть нормы — неполный", () => {
  assert.equal(isCompleteDay(700, 2000, undefined, 2000, 1), false);
  assert.equal(isCompleteDay(1800, 2000, undefined, 2000, 4), true);
  assert.equal(isCompleteDay(700, 2000, "complete", 2000, 1), true);
});
test("полнота: ручные отметки учитываются", () => {
  const t = [{ day: "2026-09-01", kcal: 1900, protein: 0, fat: 0, carbs: 0, entries: 4 }];
  assert.equal(completeDays(t, new Map([["2026-09-01", "incomplete"]])).length, 0);
});
test("белок при 120 кг и 175 см считается от опорного веса", () => {
  const m = macrosFor(2000, 120, "lose", 175);
  assert.ok(m.protein < 160, `получилось ${m.protein}`);
});
test("поддержание при достижении цели = расход, без шага 250", () => {
  const c = checkinPlan({ tdee: 2500, current: 70, kind: "lose", rateKgWeek: -0.5, targetWeight: 71, sex: "male", prevCalories: 1500 });
  assert.equal(c.reached, true);
  assert.equal(c.calories, caloriesFor(2500, 0, "male"));
});
test("корректировка без цели: шаг не больше 250", () => {
  const c = checkinPlan({ tdee: 3000, current: 80, kind: "lose", rateKgWeek: -0.5, targetWeight: 70, sex: "male", prevCalories: 1500 });
  assert.equal(c.calories, 1750);
});

console.log("\nЧитмил");
const plan = (extra: number, spread: number): CheatPlan => ({ id: "p", day: "2026-09-10", extra_kcal: extra, spread_days: spread, mode: "before", title: null, created_at: "" });
test("бюджет сохраняется: сумма дней не меняется", () => {
  const baseOf = () => 2200;
  const p = plan(800, 2);
  const daysAround = ["2026-09-08", "2026-09-09", "2026-09-10"];
  const sum = daysAround.reduce((a, d) => a + withPlans({ calories: 2200, protein: 150, fat: 70, carbs: 230 }, [p], d, baseOf).calories, 0);
  assert.equal(sum, 3 * 2200);
});
test("минимум: при норме 1500 компенсация ограничена, бонус = компенсации", () => {
  const baseOf = () => 1500;
  const s = planSplit(plan(800, 1), baseOf);
  assert.equal(s.bonus, 300); // 1500 − max(1200, 1050)
  assert.equal(s.short, 500);
  const sum = ["2026-09-09", "2026-09-10"].reduce((a, d) => a + withPlans({ calories: 1500, protein: 120, fat: 50, carbs: 150 }, [plan(800, 1)], d, baseOf).calories, 0);
  assert.equal(sum, 3000);
});
test("недостаток на одном дне переносится на другие дни компенсации", () => {
  const baseOf = (d: string) => (d === "2026-09-09" ? 1500 : 2500);
  const s = planSplit(plan(900, 2), baseOf);
  assert.equal(s.bonus, 900);
  assert.equal(s.cuts.get("2026-09-09"), 300);
  assert.equal(s.cuts.get("2026-09-08"), 600);
});

console.log("\nПлан питания");
const dish = (code: string, o: Partial<Dish> & { kcal: number; p?: number }): Dish => ({
  code, kind: "recipe", ref: code, title: code, emoji: "🍽", category: "main", time: 20, servings: 4, difficulty: 1,
  serving: { kcal: o.kcal, protein: o.p ?? 20, fat: 10, carbs: 30, grams: 300 },
  ingredients: [{ name: "Куриное филе", grams: 600 }, { name: "Лук репчатый", grams: 180 }, { name: "Вода", grams: 500 }],
  tags: [], flags: [], ...o,
});
const D = new Map<string, Dish>([
  ["r1", dish("r1", { kcal: 500, p: 40 })],
  ["r2", dish("r2", { kcal: 450, p: 30 })],
  ["b1", dish("b1", { kcal: 300, p: 25, category: "breakfast", servings: 1, basic: true, meals: [0, 3], ingredients: [{ name: "Яйцо куриное", grams: 110 }] })],
  ["b2", dish("b2", { kcal: 200, p: 30, category: "snack", servings: 1, basic: true, meals: [3], ingredients: [{ name: "Творог 5%", grams: 180 }] })],
]);
const prefs: PlanPrefs = { days: 3, start: "2026-10-01", meals: [0, 1, 2], people: 1, cook: "batch", time: 30, exclude: [], style: [], wishes: "" };
const days3 = ["2026-10-01", "2026-10-02", "2026-10-03"];
const goal = () => ({ kcal: 2000, protein: 150 });
const dict: Dict = {
  "Куриное филе": { n: "Куриное филе", d: "meat", u: null, l: false, s: null, x: ["poultry", "meat"] },
  "Лук репчатый": { n: "Лук репчатый", d: "veg", u: { w: "шт", g: 90 }, l: false, s: null, x: [] },
  "Вода": { n: "Вода", d: "other", u: null, l: true, s: "skip", x: [] },
  "Яйцо куриное": { n: "Яйца куриные", d: "dairy", u: { w: "шт", g: 55 }, l: false, s: null, x: ["egg"] },
};

test("заготовка: обед на 3 дня — одна готовка, остальное из холодильника", () => {
  const items = buildPlan([1, 2, 3].flatMap((d) => [{ d, m: 0, r: "b1" }, { d, m: 1, r: "r1", cook: d === 1 }, { d, m: 2, r: "r2" }]), { prefs, days: days3, dishes: D, goal });
  const lunches = items.filter((i) => i.meal === 1);
  assert.equal(lunches.length, 3);
  assert.equal(lunches.filter((i) => i.cook).length, 1);
  assert.ok(lunches.every((i) => i.batch === lunches[0].batch));
});
test("заготовка не дольше 3 суток: на 4-й день готовим заново", () => {
  const days4 = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
  const items = buildPlan([1, 2, 3, 4].map((d) => ({ d, m: 1, r: "r1", cook: d === 1 })), { prefs: { ...prefs, days: 4, meals: [1] }, days: days4, dishes: D, goal });
  assert.equal(items.filter((i) => i.cook).length, 2);
});
test("порции подгоняются к норме дня (±10%)", () => {
  const items = buildPlan([1, 2, 3].flatMap((d) => [{ d, m: 0, r: "b1" }, { d, m: 1, r: "r1" }, { d, m: 2, r: "r2" }]), { prefs, days: days3, dishes: D, goal });
  for (const day of days3) {
    const k = sumItems(items.filter((i) => i.day === day)).kcal;
    const want = 2000 * 0.9; // завтрак + обед + ужин = 90% нормы
    assert.ok(Math.abs(k - want) / want < 0.1, `${day}: ${k} vs ${want}`);
  }
});
test("пустой слот ИИ заполняется подходящим блюдом (суп не на завтрак)", () => {
  const items = buildPlan([{ d: 1, m: 1, r: "r1" }], { prefs: { ...prefs, days: 1 }, days: [days3[0]], dishes: D, goal });
  const breakfast = items.find((i) => i.meal === 0);
  assert.ok(breakfast && breakfast.ref === "b1");
});
test("мало белка — перекус становится белковым", () => {
  const low = new Map(D);
  low.set("r1", dish("r1", { kcal: 600, p: 10 }));
  low.set("r2", dish("r2", { kcal: 600, p: 10 }));
  const items = buildPlan([{ d: 1, m: 1, r: "r1" }, { d: 1, m: 2, r: "r2" }, { d: 1, m: 3, r: "b1" }], {
    prefs: { ...prefs, days: 1, meals: [1, 2, 3] }, days: [days3[0]], dishes: low, goal, proteinBoost: ["b2"],
  });
  assert.ok(items.some((i) => i.ref === "b2"));
});
test("удалили день готовки — готовка переезжает на следующий приём заготовки", () => {
  const items = buildPlan([1, 2, 3].map((d) => ({ d, m: 1, r: "r1", cook: d === 1 })), { prefs: { ...prefs, meals: [1] }, days: days3, dishes: D, goal });
  const cookId = items.find((i) => i.cook)!.id;
  const after = removeItem(items, cookId);
  assert.equal(after.filter((i) => i.cook).length, 1);
  assert.equal(after.find((i) => i.cook)!.day, "2026-10-02");
});
test("замена одного приёма из заготовки не ломает остальные", () => {
  const items = buildPlan([1, 2, 3].map((d) => ({ d, m: 1, r: "r1", cook: d === 1 })), { prefs: { ...prefs, meals: [1] }, days: days3, dishes: D, goal });
  const first = items.find((i) => i.cook)!;
  const after = replaceItem(items, first.id, D.get("r2")!, "one");
  assert.equal(after.filter((i) => i.ref === "r1" && i.cook).length, 1);
  assert.equal(after.find((i) => i.id === first.id)!.ref, "r2");
});
test("покупки: заготовка на семью из 2 — продукты на все порции, вода не покупается", () => {
  const items = buildPlan([1, 2].map((d) => ({ d, m: 1, r: "r1", cook: d === 1 })), {
    prefs: { ...prefs, days: 2, meals: [1], people: 2 }, days: days3.slice(0, 2), dishes: D, goal: () => ({ kcal: 500 / 0.35, protein: 100 }),
  });
  const s = cookSessions(items, 2);
  assert.equal(s.length, 1);
  assert.equal(s[0].servings, 4); // 1+1 твои + по порции второму человеку
  const list = shoppingList(items, (it) => D.get(it.ref), dict, 2);
  assert.equal(list.find((l) => l.name === "Куриное филе")!.grams, 600); // рецепт на 4 порции
  assert.ok(!list.some((l) => l.name === "Вода"));
  assert.equal(qtyText(list.find((l) => l.name === "Лук репчатый")!).main, "2 шт");
});
test("количество: упаковки и килограммы по-человечески", () => {
  assert.deepEqual(qtyText({ grams: 780, unit: { w: "пачка", g: 200 }, liquid: false }), { main: "775 г", sub: "4 пачки" });
  assert.equal(qtyText({ grams: 1260, unit: null, liquid: true }).main, "1,3 л");
  assert.equal(qtyText({ grams: 110, unit: { w: "шт", g: 55 }, liquid: false }).main, "2 шт");
});

test("каждый приём получает свою долю: лёгкий завтрак увеличивается, а не обед", () => {
  const items = buildPlan([{ d: 1, m: 0, r: "b1" }, { d: 1, m: 1, r: "r1" }, { d: 1, m: 2, r: "r2" }], { prefs: { ...prefs, days: 1 }, days: [days3[0]], dishes: D, goal });
  const b = items.find((i) => i.meal === 0)!;
  // 25% из 90% нормы 2000 ≈ 555 ккал, завтрак 300 ккал → порция растёт до ~1,75
  assert.ok(b.kcal >= 450, `завтрак ${b.kcal}`);
});
test("«не дома» из пожеланий: приём не заполняется и не раздувает остальные", () => {
  const items = buildPlan([{ d: 1, m: 0, r: "b1" }, { d: 1, m: 1, r: "r1" }], {
    prefs: { ...prefs, days: 1, skips: ["2026-10-01|2"] }, days: [days3[0]], dishes: D, goal,
  });
  assert.ok(!items.some((i) => i.meal === 2));
  const k = sumItems(items).kcal;
  assert.ok(Math.abs(k - 2000 * 0.6) / (2000 * 0.6) < 0.12, `${k}`);
});
test("режим заготовок: повтор блюда — из заготовки, даже если ИИ забыл cook:false", () => {
  const items = buildPlan([1, 2, 3].map((d) => ({ d, m: 1, r: "r1", cook: true })), { prefs: { ...prefs, meals: [1] }, days: days3, dishes: D, goal });
  assert.equal(items.filter((i) => i.cook).length, 1);
});
test("режим «каждый день»: слушаемся ИИ — повтор готовится заново", () => {
  const items = buildPlan([1, 2].map((d) => ({ d, m: 1, r: "r1", cook: true })), { prefs: { ...prefs, meals: [1], cook: "daily" }, days: days3.slice(0, 2), dishes: D, goal });
  assert.equal(items.filter((i) => i.cook).length, 2);
});
test("быстрые блюда (до 10 мин) собираются каждый раз и не считаются готовкой", () => {
  const q = new Map(D);
  q.set("r3", dish("r3", { kcal: 400, time: 5 }));
  const items = buildPlan([1, 2].map((d) => ({ d, m: 1, r: "r3", cook: false })), { prefs: { ...prefs, meals: [1] }, days: days3.slice(0, 2), dishes: q, goal });
  assert.ok(items.every((i) => i.cook && i.quick));
  assert.equal(cookSessions(items, 1).length, 0);
});

console.log(`\n${passed} прошло, ${failed} упало`);
if (failed) process.exit(1);
