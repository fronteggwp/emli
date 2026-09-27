// Проверка алгоритмов на синтетических данных: npx rolldown tools/algo-test.ts -o <out>.mjs && node <out>.mjs
import { planFor, type Session } from "../src/lib/progression";
import { estimateTdee, trendSeries, macrosFor, checkinPlan } from "../src/lib/nutrition";
import { burnedKcal, type Exercise } from "../src/lib/exercise";

const squat = { id: "Barbell_Squat", n: "Присед", e: "barbell", pm: ["quadriceps"], sm: [], c: "strength", f: "push" } as unknown as Exercise;
const bench = { id: "Bench", n: "Жим", e: "barbell", pm: ["chest"], sm: [], c: "strength", f: "push" } as unknown as Exercise;
const ses = (w: number, reps: number[], day = 0): Session => ({ at: "2026-09-01", programDay: day, sets: reps.map((r) => ({ weight: w, reps: r, kind: "normal" })) });

const show = (label: string, p: ReturnType<typeof planFor>) =>
  console.log(label.padEnd(34), p.tone.padEnd(5), p.note ?? "—", p.sets ? JSON.stringify(p.sets) : "");

show("SS присед: успех 100×5×3", planFor({ program: "starting-strength", ex: squat, targetReps: "5", workingSets: 3, history: [ses(100, [5, 5, 5])], bestE1rm: null, programSessions: 5 }));
show("SS жим: успех 60", planFor({ program: "starting-strength", ex: bench, targetReps: "5", workingSets: 3, history: [ses(60, [5, 5, 5])], bestE1rm: null, programSessions: 5 }));
show("SS присед: 1 неудача", planFor({ program: "starting-strength", ex: squat, targetReps: "5", workingSets: 3, history: [ses(100, [5, 5, 3])], bestE1rm: null, programSessions: 5 }));
show("SS присед: 3 неудачи", planFor({ program: "starting-strength", ex: squat, targetReps: "5", workingSets: 3, history: [ses(100, [5, 4, 3]), ses(100, [5, 5, 4]), ses(100, [4, 4, 4])], bestE1rm: null, programSessions: 5 }));
for (const n of [0, 4, 8, 12]) show(`5/3/1 main, сессия ${n}`, planFor({ program: "531-bbb", ex: squat, targetReps: "3-5", workingSets: 3, history: [], bestE1rm: 140, programSessions: n }));
show("5/3/1 BBB", planFor({ program: "531-bbb", ex: squat, targetReps: "10", workingSets: 5, history: [], bestE1rm: 140, programSessions: 1 }));
show("GZCLP T1 успех", planFor({ program: "gzclp", ex: squat, targetReps: "3", workingSets: 5, history: [ses(100, [3, 3, 3, 3, 5])], bestE1rm: null, programSessions: 3 }));
show("GZCLP T1 1 неудача", planFor({ program: "gzclp", ex: squat, targetReps: "3", workingSets: 5, history: [ses(100, [3, 3, 3, 2, 2])], bestE1rm: null, programSessions: 3 }));
show("Двойная: верх 8-12", planFor({ program: "phul", ex: bench, targetReps: "8-12", workingSets: 3, history: [ses(60, [12, 12, 12])], bestE1rm: null, programSessions: 3 }));
show("Двойная: середина", planFor({ program: "phul", ex: bench, targetReps: "8-12", workingSets: 3, history: [ses(60, [10, 9, 8])], bestE1rm: null, programSessions: 3 }));
show("Двойная: 2 провала", planFor({ program: null, ex: bench, targetReps: "8-12", workingSets: 3, history: [ses(60, [7, 6, 6]), ses(60, [7, 7, 6])], bestE1rm: null, programSessions: 0 }));

// Тренд и расход: 80 кг, реально худеем 0,5 кг/нед, шум ±0,6 кг, 1 выброс, пропуски
const days: string[] = [];
const start = new Date("2026-08-01");
for (let i = 0; i < 50; i++) days.push(new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10));
const noise = (i: number) => Math.sin(i * 12.9898) * 0.6;
const weights = days
  .map((d, i) => ({ day: d, weight_kg: 80 - (0.5 / 7) * i + noise(i) + (i === 30 ? 2.5 : 0), body_fat: null }))
  .filter((_, i) => i % 3 !== 1);
const trend = trendSeries(weights, days[days.length - 1]);
console.log("\nтренд: начало", trend[0].trend, "конец", trend[trend.length - 1].trend, "(ожидаем ≈ 76,5) выброс 31-го дня:", trend[31].trend);
// Едим 1950 ккал, реальный расход = 1950 + 0,5*7700/7 = 2500
const totals = days.map((d, i) => ({ day: d, kcal: i % 9 === 4 ? 600 : 1950, protein: 0, fat: 0, carbs: 0, entries: 5 }));
const est = estimateTdee(totals, trend, 2300, days[days.length - 1]);
console.log("расход:", est, "(ожидаем ≈ 2500; неполные дни 600 ккал отброшены)");

console.log("\nБЖУ 1800 ккал, 120 кг, 175 см, похудение:", macrosFor(1800, 120, "lose", 175));
console.log("БЖУ 2500 ккал, 75 кг, набор:", macrosFor(2500, 75, "gain", 180));
console.log("Корректировка (цель достигнута):", checkinPlan({ tdee: 2500, current: 74.8, kind: "lose", rateKgWeek: -0.5, targetWeight: 75, sex: "male", prevCalories: 1950 }));
console.log("\nКалории 60 мин, 18 подходов, 80 кг:", burnedKcal([{ met: 5, sets: 18 }], 80, 60), "(было бы", Math.round(5 * 80), ")");
