/*
 * План питания: всё, что считается без ИИ.
 * ИИ выбирает блюда и раскладывает их по дням; здесь — заготовки, порции под норму,
 * добор белка, список покупок в штуках/упаковках, замены и удаления.
 * Модуль чистый (без сети и React) — его проверяют автотесты.
 */
import type { Macros, Meal } from "./types";

export type CookMode = "daily" | "every2" | "batch";
export type PlanPrefs = {
  days: number;
  start: string;
  meals: Meal[];
  people: number;
  cook: CookMode;
  /** Сколько минут готов стоять у плиты в будни; 0 — не важно */
  time: number;
  exclude: string[];
  style: string[];
  wishes: string;
  /** Приёмы «не дома» из пожеланий: "день|приём" — не заполняем и не считаем в норме плана */
  skips?: string[];
};

/** Блюдо, из которого строится план: рецепт Emli, простое блюдо из продуктов или свой рецепт */
export type Dish = {
  code: string;
  kind: "recipe" | "mine";
  ref: string;
  title: string;
  emoji: string;
  category: string;
  time: number | null;
  servings: number;
  difficulty: number;
  serving: Macros & { grams: number };
  ingredients: { name: string; grams: number }[];
  tags: string[];
  flags: string[];
  basic?: boolean;
  meals?: Meal[];
  img?: string | null;
};

export type PlanItem = Macros & {
  id: string;
  day: string;
  meal: Meal;
  kind: "recipe" | "mine";
  ref: string;
  title: string;
  emoji: string;
  /** Твои порции (в порциях рецепта) */
  portions: number;
  grams: number;
  /** В этот приём блюдо готовится (или собирается); иначе — берём из заготовки */
  cook: boolean;
  /** Одна заготовка = одна готовка на несколько приёмов */
  batch: string;
  basic?: boolean;
  /** Собирается за пару минут (простое блюдо или рецепт до 10 мин) — не «готовка» и не заготовка */
  quick?: boolean;
  locked?: boolean;
  eaten?: boolean;
  /** Запись в дневнике, созданная отметкой «Съел» — чтобы отмена её удаляла */
  entry?: string;
  skipped?: boolean;
};

/** Ответ ИИ: блюда по слотам (d — номер дня с 1, m — приём, r — код блюда) */
export type AiSlot = { d: number; m: number; r: string; cook?: boolean };

export const MEAL_SHARE = [0.25, 0.35, 0.3, 0.1];
/** Готовое блюдо храним в холодильнике не дольше 3 суток: день готовки + 2 */
export const KEEP_DAYS = 2;
const MAX_PER_SLOT = 2;

// ───────────── Ограничения

export const EXCLUDE: { id: string; label: string; flags: string[] }[] = [
  { id: "no_fish", label: "Без рыбы", flags: ["fish", "seafood"] },
  { id: "no_pork", label: "Без свинины", flags: ["pork"] },
  { id: "vegetarian", label: "Вегетарианское", flags: ["meat", "poultry", "beef", "pork", "fish", "seafood"] },
  { id: "vegan", label: "Веган", flags: ["meat", "poultry", "beef", "pork", "fish", "seafood", "dairy", "egg", "honey"] },
  { id: "no_dairy", label: "Без молочного", flags: ["dairy"] },
  { id: "no_gluten", label: "Без глютена", flags: ["gluten"] },
  { id: "no_egg", label: "Без яиц", flags: ["egg"] },
  { id: "no_nuts", label: "Без орехов", flags: ["nuts"] },
  { id: "no_mushroom", label: "Без грибов", flags: ["mushroom"] },
  { id: "no_sugar", label: "Без сахара", flags: ["sugar"] },
];

export const STYLES: { id: string; label: string; hint: string }[] = [
  { id: "protein", label: "Больше белка", hint: "белок в каждом приёме, мясо/рыба/творог/бобовые" },
  { id: "budget", label: "Бюджетно", hint: "недорогие продукты: крупы, курица, яйца, сезонные овощи, консервы" },
  { id: "simple", label: "Попроще", hint: "лёгкие рецепты, мало ингредиентов, простые блюда из продуктов" },
  { id: "variety", label: "Разнообразно", hint: "как можно меньше повторов, разные кухни и белки" },
  { id: "sweet", label: "Сладкое иногда", hint: "1–3 полезных десерта в неделю на перекус" },
  { id: "favorites", label: "Мои любимые", hint: "чаще ставь блюда с пометкой ♥" },
];

export function allowed(d: Dish, exclude: string[]) {
  const bad = new Set(EXCLUDE.filter((e) => exclude.includes(e.id)).flatMap((e) => e.flags));
  return !d.flags.some((f) => bad.has(f));
}

/** Подходит ли блюдо к приёму пищи — чтобы суп не оказался на завтрак */
export function fitsMeal(d: Dish, m: Meal) {
  if (d.meals) return d.meals.includes(m);
  const c = d.category;
  if (m === 0) return c === "breakfast" || c === "snack";
  if (m === 3) return c === "snack" || c === "dessert" || c === "breakfast";
  if (c === "drink") return false;
  return c !== "breakfast" && c !== "dessert";
}

// ───────────── Порции и КБЖУ

export const quarter = (n: number) => Math.round(n * 4) / 4;
/** 1 → «1», 1.5 → «1,5», 1.25 → «1,25», 10 → «10» */
export const portionsText = (p: number) => p.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

export function withPortions<T extends PlanItem>(it: T, dish: Pick<Dish, "serving">, portions: number): T {
  const p = clamp(quarter(portions), 0.25, 4);
  const s = dish.serving;
  return {
    ...it,
    portions: p,
    grams: Math.round(s.grams * p),
    kcal: Math.round(s.kcal * p),
    protein: r1(s.protein * p),
    fat: r1(s.fat * p),
    carbs: r1(s.carbs * p),
  };
}

export function sumItems(items: Macros[]): Macros {
  return items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, fat: a.fat + i.fat, carbs: a.carbs + i.carbs }), {
    kcal: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
  });
}

/** Доля дневной нормы на выбранные приёмы: планируешь только обед и ужин — цель 65% нормы */
export const mealsShare = (meals: Meal[]) => meals.reduce<number>((a, m) => a + MEAL_SHARE[m], 0);

export type DayGoal = { kcal: number; protein: number };

let seq = 0;
export const newId = () => `${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Порции на день: подгоняем калории к цели, не трогая съеденное и закреплённое.
 * Сначала каждый приём — к своей доле дня (завтрак 25%, обед 35%…), потом добиваем день
 * самым крупным блюдом шагами по ¼ порции.
 */
export function fitDay(items: PlanItem[], dishOf: (it: PlanItem) => Dish | undefined, goalKcal: number, keepIds?: Set<string>): PlanItem[] {
  const fixed = items.filter((i) => i.eaten || i.locked || i.skipped || keepIds?.has(i.id));
  const free = items.filter((i) => !fixed.includes(i));
  if (!free.length) return items;
  const fixedKcal = sumItems(fixed.filter((i) => !i.skipped)).kcal;
  const base = free.map((i) => ({ it: i, dish: dishOf(i) }));
  const live = items.filter((i) => !i.skipped);
  const meals = [...new Set(live.map((i) => i.meal))];
  const shareSum = meals.reduce<number>((a, m) => a + MEAL_SHARE[m], 0) || 1;
  const factor = new Map<Meal, number>();
  for (const m of meals) {
    const goalM = (goalKcal * MEAL_SHARE[m]) / shareSum;
    const fixedM = sumItems(fixed.filter((i) => i.meal === m && !i.skipped)).kcal;
    const baseM = base.filter((b) => b.it.meal === m).reduce((a, b) => a + (b.dish?.serving.kcal ?? b.it.kcal), 0);
    if (baseM > 0) factor.set(m, clamp((goalM - fixedM) / baseM, 0.6, 1.8));
  }
  let out = base.map(({ it, dish }) => (dish ? withPortions(it, dish, clamp(factor.get(it.meal) ?? 1, 0.5, 2.5)) : it));
  for (let step = 0; step < 6; step++) {
    const total = fixedKcal + sumItems(out).kcal;
    const diff = goalKcal - total;
    if (Math.abs(diff) < 90) break;
    // Больше всего калорий на ¼ порции — самое «крупное» блюдо
    const idx = out
      .map((it, i) => ({ i, q: (dishOf(it)?.serving.kcal ?? 0) / 4, p: it.portions }))
      .filter((x) => x.q > 0 && (diff > 0 ? x.p < 2.5 : x.p > 0.5))
      .sort((a, b) => b.q - a.q)[0];
    if (!idx || idx.q > Math.abs(diff) * 1.6) break;
    const it = out[idx.i];
    out[idx.i] = withPortions(it, dishOf(it)!, it.portions + (diff > 0 ? 0.25 : -0.25));
  }
  const byId = new Map(out.map((i) => [i.id, i]));
  return items.map((i) => byId.get(i.id) ?? i);
}

// ───────────── Сборка плана из ответа ИИ

export type BuildCtx = {
  prefs: PlanPrefs;
  days: string[];
  dishes: Map<string, Dish>;
  goal: (day: string) => DayGoal;
  /** Что оставить как есть при пересборке: съеденное, закреплённое, прошедшие дни */
  keep?: PlanItem[];
  /** Белковые добавки, если белка не хватает (коды блюд, по приоритету) */
  proteinBoost?: string[];
};

const dishKey = (d: Pick<Dish, "kind" | "ref">) => `${d.kind}:${d.ref}`;
export const isQuick = (d: Pick<Dish, "basic" | "time">) => !!d.basic || (d.time ?? 99) <= 10;
/** Одна заготовка — не больше трёх приёмов */
const MAX_BATCH = 3;

export function itemFrom(dish: Dish, day: string, meal: Meal, portions = 1): PlanItem {
  const id = newId();
  return withPortions(
    {
      id,
      day,
      meal,
      kind: dish.kind,
      ref: dish.ref,
      title: dish.title,
      emoji: dish.emoji,
      portions: 1,
      grams: 0,
      kcal: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      cook: true,
      batch: id,
      basic: dish.basic || undefined,
      quick: isQuick(dish) || undefined,
    },
    dish,
    portions,
  );
}

/** Запасной выбор, если ИИ пропустил слот: подходящее блюдо, которое реже всего встречается */
function fallback(meal: Meal, dishes: Dish[], used: Map<string, number>, want: number) {
  return dishes
    .filter((d) => fitsMeal(d, meal))
    .map((d) => ({ d, score: (used.get(dishKey(d)) ?? 0) * 400 + Math.abs(d.serving.kcal - want) + (d.basic ? 0 : 30) }))
    .sort((a, b) => a.score - b.score)[0]?.d;
}

export function buildPlan(slots: AiSlot[], ctx: BuildCtx): PlanItem[] {
  const { prefs, days, dishes, goal } = ctx;
  const keep = ctx.keep ?? [];
  const skips = new Set(prefs.skips ?? []);
  const covered = new Set([...keep.map((k) => `${k.day}|${k.meal}`), ...skips]);
  const usable = [...dishes.values()];
  const used = new Map<string, number>();
  for (const k of keep) used.set(`${k.kind}:${k.ref}`, (used.get(`${k.kind}:${k.ref}`) ?? 0) + 1);

  // 1) Проверяем ответ ИИ: день, приём, блюдо — из списка, не больше двух блюд в приёме
  type Pick = { di: number; meal: Meal; dish: Dish; cook: boolean };
  const picks: Pick[] = [];
  const perSlot = new Map<string, number>();
  for (const s of slots) {
    const di = Math.round(s.d) - 1;
    const meal = s.m as Meal;
    const dish = dishes.get(String(s.r));
    if (!dish || di < 0 || di >= days.length || !prefs.meals.includes(meal)) continue;
    const key = `${days[di]}|${meal}`;
    if (covered.has(key)) continue;
    const n = perSlot.get(key) ?? 0;
    if (n >= MAX_PER_SLOT) continue;
    if (picks.some((p) => p.di === di && p.meal === meal && p.dish === dish)) continue;
    perSlot.set(key, n + 1);
    picks.push({ di, meal, dish, cook: s.cook !== false });
    used.set(dishKey(dish), (used.get(dishKey(dish)) ?? 0) + 1);
  }
  // 2) Пустые слоты заполняем сами
  days.forEach((day, di) => {
    for (const meal of prefs.meals) {
      const key = `${day}|${meal}`;
      if (covered.has(key) || perSlot.has(key)) continue;
      const d = fallback(meal, usable, used, goal(day).kcal * MEAL_SHARE[meal]);
      if (!d) continue;
      picks.push({ di, meal, dish: d, cook: true });
      perSlot.set(key, 1);
      used.set(dishKey(d), (used.get(dishKey(d)) ?? 0) + 1);
    }
  });
  picks.sort((a, b) => a.di - b.di || a.meal - b.meal);

  // 3) Заготовки: «из заготовки» — только если блюдо готовили не раньше чем 2 дня назад.
  //    В режимах «через день» и «заготовки» повтор блюда в эти 2 дня — всегда из заготовки,
  //    даже если ИИ забыл это отметить; в режиме «каждый день» слушаемся ИИ.
  const open = new Map<string, { batch: string; di: number; n: number }>();
  const items: PlanItem[] = picks.map((p) => {
    const it = itemFrom(p.dish, days[p.di], p.meal);
    const k = dishKey(p.dish);
    const o = open.get(k);
    const leftover = !isQuick(p.dish) && o && p.di - o.di <= KEEP_DAYS && o.n < MAX_BATCH && (!p.cook || prefs.cook !== "daily");
    if (leftover) {
      it.cook = false;
      it.batch = o.batch;
      o.n++;
    } else open.set(k, { batch: it.batch, di: p.di, n: 1 });
    return it;
  });

  // 4) Порции под норму + белок
  const dishOf = (it: PlanItem) => dishes.get(codeOf(dishes, it));
  const result: PlanItem[] = [...keep];
  const keepIds = new Set(keep.map((k) => k.id));
  for (const day of days) {
    let list = [...keep.filter((k) => k.day === day), ...items.filter((i) => i.day === day)];
    if (!list.length) continue;
    const g = goal(day);
    const share = mealsShare(prefs.meals.filter((m) => !skips.has(`${day}|${m}`)));
    list = fitDay(list, dishOf, g.kcal * share, keepIds);
    const p = sumItems(list.filter((i) => !i.skipped)).protein;
    const boost = (ctx.proteinBoost ?? []).map((c) => dishes.get(c)).find((d) => d && allowed(d, prefs.exclude));
    const snackKey = `${day}|3`;
    if (boost && p < g.protein * share * 0.85 && prefs.meals.includes(3) && !covered.has(snackKey)) {
      const snacks = list.filter((i) => i.meal === 3);
      if (!snacks.some((s) => s.ref === boost.ref)) {
        // Слабый перекус меняем на белковый, иначе добавляем вторым блюдом
        const weak = snacks.find((s) => !s.locked && !s.eaten && s.protein < 8);
        const add = itemFrom(boost, day, 3);
        list = weak ? list.map((i) => (i === weak ? add : i)) : snacks.length < MAX_PER_SLOT ? [...list, add] : list;
        list = fitDay(list, dishOf, g.kcal * share, keepIds);
      }
    }
    result.push(...list.filter((i) => !keep.includes(i)));
  }
  return sortItems(result);
}

export const sortItems = (items: PlanItem[]) =>
  [...items].sort((a, b) => a.day.localeCompare(b.day) || a.meal - b.meal || Number(b.cook) - Number(a.cook));

/** Код блюда по элементу плана (карта dishes — по кодам) */
export function codeOf(dishes: Map<string, Dish>, it: Pick<PlanItem, "kind" | "ref">) {
  for (const [code, d] of dishes) if (d.kind === it.kind && d.ref === it.ref) return code;
  return "";
}

// ───────────── Правки плана

/** Убрали/заменили готовку — следующий приём из той же заготовки становится готовкой */
function repairBatch(items: PlanItem[], batch: string): PlanItem[] {
  const rest = items.filter((i) => i.batch === batch && !i.skipped);
  if (!rest.length || rest.some((i) => i.cook)) return items;
  const first = rest.sort((a, b) => a.day.localeCompare(b.day) || a.meal - b.meal)[0];
  return items.map((i) => (i.id === first.id ? { ...i, cook: true } : i));
}

export function removeItem(items: PlanItem[], id: string) {
  const it = items.find((i) => i.id === id);
  if (!it) return items;
  return repairBatch(
    items.filter((i) => i.id !== id),
    it.batch,
  );
}

/** Замена блюда: в этом приёме или во всех приёмах той же заготовки; калорийность порции сохраняем */
export function replaceItem(items: PlanItem[], id: string, dish: Dish, scope: "one" | "batch" = "one") {
  const it = items.find((i) => i.id === id);
  if (!it) return items;
  const targets = scope === "batch" ? items.filter((i) => i.batch === it.batch && !i.eaten) : [it];
  const batch = newId();
  const ids = new Set(targets.map((t) => t.id));
  const first = [...targets].sort((a, b) => a.day.localeCompare(b.day) || a.meal - b.meal)[0];
  let out = items.map((i) => {
    if (!ids.has(i.id)) return i;
    const p = clamp(i.kcal / Math.max(dish.serving.kcal, 1), 0.5, 2.5);
    const n = withPortions({ ...itemFrom(dish, i.day, i.meal), id: i.id }, dish, p);
    return { ...n, batch: scope === "batch" ? batch : newId(), cook: scope === "batch" ? i.id === first.id || !!dish.basic : true, locked: i.locked };
  });
  if (scope === "one") out = repairBatch(out, it.batch);
  return sortItems(out);
}

export function addItem(items: PlanItem[], dish: Dish, day: string, meal: Meal, kcal?: number) {
  const p = kcal ? clamp(kcal / Math.max(dish.serving.kcal, 1), 0.5, 2.5) : 1;
  return sortItems([...items, itemFrom(dish, day, meal, p)]);
}

// ───────────── Готовка

export type CookSession = {
  batch: string;
  day: string;
  meal: Meal;
  item: PlanItem;
  /** Приёмы, которые закрывает эта готовка (включая сам день готовки) */
  eats: PlanItem[];
  /** Сколько порций готовить на всех (твои порции + по порции на каждого члена семьи) */
  servings: number;
};

export function cookSessions(items: PlanItem[], people: number): CookSession[] {
  const live = items.filter((i) => !i.skipped);
  return live
    .filter((i) => i.cook && !i.basic && !i.quick)
    .map((c) => {
      const eats = live.filter((i) => i.batch === c.batch).sort((a, b) => a.day.localeCompare(b.day) || a.meal - b.meal);
      const mine = eats.reduce((a, i) => a + i.portions, 0);
      return { batch: c.batch, day: c.day, meal: c.meal, item: c, eats, servings: quarter(mine + (people - 1) * eats.length) };
    })
    .sort((a, b) => a.day.localeCompare(b.day) || a.meal - b.meal);
}

// ───────────── Список покупок

export type DictEntry = { n: string; d: string; u: { w: string; g: number } | null; l: boolean; s: "skip" | null; x: string[]; k?: number };
export type Dict = Record<string, DictEntry>;

export const DEPTS: { id: string; name: string; emoji: string }[] = [
  { id: "veg", name: "Овощи и зелень", emoji: "🥦" },
  { id: "fruit", name: "Фрукты и ягоды", emoji: "🍎" },
  { id: "meat", name: "Мясо и птица", emoji: "🥩" },
  { id: "fish", name: "Рыба и морепродукты", emoji: "🐟" },
  { id: "dairy", name: "Молочное и яйца", emoji: "🥛" },
  { id: "bakery", name: "Хлеб", emoji: "🍞" },
  { id: "grain", name: "Крупы и макароны", emoji: "🌾" },
  { id: "can", name: "Консервы и соусы", emoji: "🥫" },
  { id: "nuts", name: "Орехи и сухофрукты", emoji: "🥜" },
  { id: "frozen", name: "Заморозка", emoji: "🧊" },
  { id: "other", name: "Разное", emoji: "🛒" },
  { id: "pantry", name: "Проверь, есть ли дома", emoji: "🧂" },
];

/** Отдел для продукта не из словаря (свои рецепты) — по ключевым словам */
const GUESS: [RegExp, string][] = [
  [/кур|индей|говя|свин|фарш|мяс|колбас|сосис|ветчин|бекон|печен/i, "meat"],
  [/рыб|лосос|сёмг|семг|треск|минта|тунец|кревет|кальмар|форел|скумбр|сельд/i, "fish"],
  [/молок|кефир|йогурт|творог|сыр|сметан|сливк|масло сливоч|ряженк|яйц|яйко/i, "dairy"],
  [/хлеб|лаваш|батон|булк|лепёш|лепеш|хлебц/i, "bakery"],
  [/круп|рис|греч|овся|булгур|кускус|макарон|паст|мука|киноа|пшен|перлов/i, "grain"],
  [/яблок|банан|апельс|лимон|ягод|клубн|малин|груш|киви|виноград|манго|персик|черник/i, "fruit"],
  [/орех|миндал|кешью|семечк|изюм|кураг|финик|чернослив|семена/i, "nuts"],
  [/консерв|соус|кетчуп|майонез|горчиц|паста томат|фасоль|нут|горошек/i, "can"],
  [/соль|перец мол|специ|сахар|масло|уксус|корица|паприк|ванил/i, "pantry"],
  [/огур|помид|томат|капуст|морков|лук|чеснок|картоф|перец|кабач|баклаж|зелен|укроп|петруш|салат|брокк|свёкл|свекл|гриб|шампин|шпинат|тыкв|сельдер/i, "veg"],
];

export function entryFor(name: string, dict: Dict): DictEntry {
  const hit = dict[name];
  if (hit) return hit;
  const clean = name.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const dept = GUESS.find(([re]) => re.test(clean))?.[1] ?? "other";
  return { n: clean.charAt(0).toUpperCase() + clean.slice(1), d: dept, u: null, l: false, s: null, x: [] };
}

export type ShopLine = {
  key: string;
  name: string;
  dept: string;
  grams: number;
  unit: { w: string; g: number } | null;
  liquid: boolean;
  /** Для каких блюд нужен продукт */
  uses: string[];
};

export const shopKey = (name: string) => name.toLowerCase().replace(/ё/g, "е").trim();

export function shoppingList(items: PlanItem[], dishOf: (it: PlanItem) => Dish | undefined, dict: Dict, people: number): ShopLine[] {
  const map = new Map<string, ShopLine>();
  const live = items.filter((i) => !i.skipped);
  // Заготовка покупается целиком на готовку; простые блюда — на каждый приём
  const groups = new Map<string, PlanItem[]>();
  for (const i of live) groups.set(i.batch, [...(groups.get(i.batch) ?? []), i]);
  for (const list of groups.values()) {
    const dish = dishOf(list[0]);
    if (!dish) continue;
    const servings = list.reduce((a, i) => a + i.portions, 0) + (people - 1) * list.length;
    const k = servings / Math.max(dish.servings, 1);
    for (const ing of dish.ingredients) {
      const e = entryFor(ing.name, dict);
      if (e.s === "skip" || !ing.grams) continue;
      const key = shopKey(e.n);
      const line = map.get(key) ?? { key, name: e.n, dept: e.d, grams: 0, unit: e.u, liquid: e.l, uses: [] };
      line.grams += ing.grams * k * (e.k ?? 1);
      if (!line.uses.includes(dish.title)) line.uses.push(dish.title);
      map.set(key, line);
    }
  }
  const order = new Map(DEPTS.map((d, i) => [d.id, i]));
  return [...map.values()].sort((a, b) => (order.get(a.dept) ?? 99) - (order.get(b.dept) ?? 99) || a.name.localeCompare(b.name, "ru"));
}

// ───────────── Количество по-человечески

const PLURAL: Record<string, [string, string, string]> = {
  "пачка": ["пачка", "пачки", "пачек"],
  "банка": ["банка", "банки", "банок"],
  "кочан": ["кочан", "кочана", "кочанов"],
  "буханка": ["буханка", "буханки", "буханок"],
  "плитка": ["плитка", "плитки", "плиток"],
};
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function niceGrams(g: number) {
  if (g < 50) return Math.max(5, Math.round(g / 5) * 5);
  if (g < 250) return Math.round(g / 10) * 10;
  if (g < 1000) return Math.round(g / 25) * 25;
  return Math.round(g / 50) * 50;
}

export function weightText(g: number, liquid: boolean) {
  const n = niceGrams(g);
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 ? 1 : 0).replace(".", ",")} ${liquid ? "л" : "кг"}`;
  return `${n} ${liquid ? "мл" : "г"}`;
}

/** «3 шт · ≈360 г», «800 г · 4 пачки», «450 мл» */
export function qtyText(line: Pick<ShopLine, "grams" | "unit" | "liquid">): { main: string; sub: string | null } {
  const { grams, unit, liquid } = line;
  if (unit && (unit.w === "шт" || unit.w === "зубч.")) {
    const n = Math.max(1, Math.ceil(grams / unit.g - 0.25));
    return { main: `${n} ${unit.w}`, sub: `≈ ${weightText(grams, liquid)}` };
  }
  if (unit) {
    const n = Math.max(1, Math.ceil(grams / unit.g - 0.15));
    const w = PLURAL[unit.w] ? plural(n, PLURAL[unit.w]) : unit.w;
    return { main: weightText(grams, liquid), sub: `${n} ${w}` };
  }
  return { main: weightText(grams, liquid), sub: null };
}
