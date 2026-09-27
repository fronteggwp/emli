// Составление плана: настройки + блюда → запрос к ИИ → план с порциями.
// Если ИИ недоступен — план собирается без него (подбор по приёму, калориям и разнообразию).
import { fmt, todayKey } from "@/lib/dates";
import {
  EXCLUDE,
  STYLES,
  allowed,
  buildPlan,
  fitsMeal,
  sumItems,
  type DayGoal,
  type Dish,
  type PlanItem,
  type PlanPrefs,
} from "@/lib/mealplan";
import type { Meal } from "@/lib/types";
import { aiPlan, aiSwap, dishKey, isWeekend, type AiCand } from "./mealplan";

type DishF = Dish & { fav?: boolean };

const USEFUL_TAGS = ["простое", "высокобелковое", "бюджетно", "быстро", "заготовка", "вегетарианское", "веганское", "для похудения", "на массу", "мой рецепт"];
const CAT_RU: Record<string, string> = { breakfast: "завтрак", main: "горячее", soup: "суп", salad: "салат", side: "гарнир", snack: "перекус", dessert: "десерт", drink: "напиток" };
const MEAL_RU = ["завтрак", "обед", "ужин", "перекус"];

/** Белковые добавки для добора белка — по приоритету */
const PROTEIN_BOOST = ["b-cottage", "b-greek-yogurt", "b-boiled-eggs", "b-protein-shake"];

/** Блюда, подходящие под ограничения и выбранные приёмы */
export function candidates(all: Map<string, DishF>, prefs: PlanPrefs, meals: Meal[] = prefs.meals) {
  return [...all.values()].filter((d) => {
    if (d.category === "drink") return false;
    if (d.category === "dessert" && !prefs.style.includes("sweet")) return false;
    if (!allowed(d, prefs.exclude)) return false;
    if (!meals.some((m) => fitsMeal(d, m))) return false;
    if (prefs.style.includes("simple") && d.difficulty > 2) return false;
    // Совсем долгие блюда при коротком времени у плиты
    if (prefs.time && prefs.time <= 30 && (d.time ?? 0) > 120) return false;
    return true;
  });
}

/** Коды для ИИ: короткие и без опечаток (r1, b3, m2) */
function encode(list: DishF[]) {
  const codes = new Map<string, Dish>();
  const n = { recipe: 0, basic: 0, mine: 0 };
  const cands: AiCand[] = list.map((d) => {
    const c = d.kind === "mine" ? `m${++n.mine}` : d.basic ? `b${++n.basic}` : `r${++n.recipe}`;
    codes.set(c, { ...d, code: c });
    return {
      c,
      t: d.title,
      k: d.basic ? "простое" : CAT_RU[d.category] ?? d.category,
      min: d.time,
      s: d.servings,
      kcal: Math.round(d.serving.kcal),
      p: Math.round(d.serving.protein),
      tags: d.tags.filter((t) => USEFUL_TAGS.includes(t)).join(", ") || undefined,
      fav: d.fav || undefined,
      meals: d.meals ? d.meals.map((m) => MEAL_RU[m]).join("/") : undefined,
    };
  });
  return { codes, cands };
}

const prefsForAi = (p: PlanPrefs) => ({
  meals: p.meals,
  cook: p.cook,
  time: p.time,
  people: p.people,
  exclude: EXCLUDE.filter((e) => p.exclude.includes(e.id)).map((e) => e.label),
  style: STYLES.filter((s) => p.style.includes(s.id)).map((s) => `${s.label} — ${s.hint}`),
  wishes: p.wishes.trim(),
});

export type GenInput = {
  prefs: PlanPrefs;
  days: string[];
  dishes: Map<string, DishF>;
  goal: (day: string) => DayGoal;
  /** Пересборка: что оставить (съеденное, закреплённое, прошедшие дни) */
  keep?: PlanItem[];
  /** Какие дни пересобрать (по умолчанию все начиная с сегодня) */
  only?: string[];
};

/** Составить план с ИИ. offline = true — без ИИ (запасной вариант) */
export async function generate(o: GenInput, offline = false): Promise<{ items: PlanItem[]; note: string | null; skips: string[] }> {
  const today = todayKey();
  const target = o.only ?? o.days.filter((d) => d >= today || o.days.every((x) => x < today));
  const keep = o.keep ?? [];
  const { codes, cands } = encode(candidates(o.dishes, o.prefs));
  const dishes = new Map(codes);
  // Белковые добавки нужны в карте блюд, даже если не попали в кандидаты
  for (const id of PROTEIN_BOOST) {
    const d = o.dishes.get(dishKey("recipe", id));
    if (d && ![...dishes.values()].some((x) => x.ref === id)) dishes.set(`boost-${id}`, { ...d, code: `boost-${id}` });
  }
  const boost = PROTEIN_BOOST.map((id) => [...dishes.entries()].find(([, d]) => d.ref === id)?.[0]).filter((x): x is string => !!x);

  let slots: { d: number; m: number; r: string; cook?: boolean }[] = [];
  let note: string | null = null;
  // Пропуски вне пересобираемых дней сохраняются
  let skips = (o.prefs.skips ?? []).filter((k) => !target.includes(k.split("|")[0]));
  if (!offline) {
    const res = await aiPlan({
      prefs: prefsForAi(o.prefs),
      days: target.map((day, i) => ({
        d: i + 1,
        label: fmt(day, "EEEEEE d.MM"),
        weekend: isWeekend(day),
        kcal: Math.round(o.goal(day).kcal),
        protein: Math.round(o.goal(day).protein),
      })),
      cands,
      keep: keep.filter((k) => target.includes(k.day)).map((k) => ({ d: target.indexOf(k.day) + 1, m: k.meal, t: k.title })),
    });
    slots = res.slots;
    note = res.note;
    skips = [...skips, ...(res.skip ?? []).map((s) => `${target[s.d - 1]}|${s.m}`)];
  }
  const built = buildPlan(slots, { prefs: { ...o.prefs, skips }, days: target, dishes, goal: o.goal, keep: keep.filter((k) => target.includes(k.day)), proteinBoost: boost });
  // Дни вне пересборки остаются как были
  const rest = keep.filter((k) => !target.includes(k.day));
  return { items: [...rest, ...built], note, skips };
}

/** Три замены для блюда: ИИ, а без связи — ближайшие по калориям и белку */
export async function swapOptions(o: { item: PlanItem; items: PlanItem[]; prefs: PlanPrefs; dishes: Map<string, DishF> }) {
  const list = candidates(o.dishes, o.prefs, [o.item.meal]).filter((d) => fitsMeal(d, o.item.meal) && !(d.kind === o.item.kind && d.ref === o.item.ref));
  const perPortion = (d: Dish) => {
    const k = o.item.kcal / Math.max(d.serving.kcal, 1);
    return { kcal: o.item.kcal, protein: d.serving.protein * Math.min(2.5, Math.max(0.5, k)) };
  };
  const local = () =>
    list
      .map((d) => ({ d, score: Math.abs(d.serving.kcal - o.item.kcal / Math.max(o.item.portions, 0.25)) - perPortion(d).protein * 4 + Math.random() * 60 }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((x) => ({ dish: x.d, why: null as string | null }));
  try {
    const { codes, cands } = encode(list);
    const res = await aiSwap({
      prefs: prefsForAi(o.prefs),
      cands,
      slot: { label: fmt(o.item.day, "EEEE d MMMM"), m: o.item.meal, cur: o.item.title, kcal: o.item.kcal, protein: o.item.protein },
      menu: [...new Set(o.items.filter((i) => i.id !== o.item.id).map((i) => i.title))],
    });
    const out = res.options.map((x) => ({ dish: codes.get(x.r)!, why: x.why || null })).filter((x) => x.dish);
    return { options: out.length ? out : local(), ai: out.length > 0 };
  } catch (e) {
    if (e instanceof Error && e.message === "limit") throw e;
    return { options: local(), ai: false };
  }
}

export const dayTotals = (items: PlanItem[], day: string) => sumItems(items.filter((i) => i.day === day && !i.skipped));
