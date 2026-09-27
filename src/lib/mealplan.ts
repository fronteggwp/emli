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

/** Цель на день (или на часть дня, которую закрывает план): калории и БЖУ */
export type DayGoal = { kcal: number; protein: number; fat?: number; carbs?: number };

export const scaleGoal = (g: DayGoal, k: number): DayGoal => ({
  kcal: g.kcal * k,
  protein: g.protein * k,
  fat: g.fat != null ? g.fat * k : undefined,
  carbs: g.carbs != null ? g.carbs * k : undefined,
});

/**
 * Насколько день далёк от цели. Калории — главное, недобор белка — почти так же важен,
 * лишний жир и углеводы — мягче, небольшой перебор белка почти не штрафуется.
 * mealDev — насколько приёмы отклонились от своих долей дня (чтобы завтрак не превращался в 100 ккал).
 */
export function dayLoss(sum: Macros, g: DayGoal, mealDev = 0) {
  const k = (sum.kcal - g.kcal) / Math.max(g.kcal, 1);
  const pu = Math.max(0, g.protein - sum.protein) / Math.max(g.protein, 1);
  const po = Math.max(0, sum.protein - g.protein * 1.2) / Math.max(g.protein, 1);
  let l = 30 * k * k + 8 * pu * pu + 0.5 * po * po + 1 * mealDev;
  if (g.fat) {
    const x = (sum.fat - g.fat) / g.fat;
    l += (x > 0 ? 3 : 0.8) * x * x;
  }
  if (g.carbs) {
    const x = (sum.carbs - g.carbs) / g.carbs;
    l += (x > 0 ? 1.5 : 0.5) * x * x;
  }
  return l;
}

/** Сколько не хватает (+) или лишнего (−) по каждому показателю */
export function macroGaps(sum: Macros, g: DayGoal) {
  return {
    kcal: g.kcal - sum.kcal,
    protein: g.protein - sum.protein,
    fat: g.fat != null ? g.fat - sum.fat : 0,
    carbs: g.carbs != null ? g.carbs - sum.carbs : 0,
  };
}

/** День «сходится»: калории ±8%, белка не меньше 92%, жиров не больше 125%, углеводы 65–140% */
export function dayBalanced(sum: Macros, g: DayGoal) {
  if (Math.abs(sum.kcal - g.kcal) > g.kcal * 0.08) return false;
  if (sum.protein < g.protein * 0.92) return false;
  if (g.fat && sum.fat > g.fat * 1.25) return false;
  if (g.carbs && (sum.carbs < g.carbs * 0.65 || sum.carbs > g.carbs * 1.4)) return false;
  return true;
}

/**
 * Какое блюдо мешает дню сойтись, если порциями уже не подогнать:
 * лишние жиры — самое жирное, мало белка — самое «пустое» по белку, лишние углеводы — самое углеводное.
 */
export function culprit(items: PlanItem[], sum: Macros, g: DayGoal): { item: PlanItem; why: string } | null {
  const free = items.filter((i) => !i.eaten && !i.locked && !i.skipped && i.kcal > 80);
  if (!free.length) return null;
  const top = (by: (i: PlanItem) => number) => [...free].sort((a, b) => by(b) - by(a))[0];
  if (sum.protein < g.protein * 0.92) return { item: top((i) => i.kcal / Math.max(i.protein, 1)), why: "мало белка на калории" };
  if (g.fat && sum.fat > g.fat * 1.25) return { item: top((i) => i.fat), why: "больше всего жиров" };
  if (g.carbs && sum.carbs > g.carbs * 1.4) return { item: top((i) => i.carbs), why: "больше всего углеводов" };
  if (sum.kcal > g.kcal * 1.08) return { item: top((i) => i.kcal), why: "самое калорийное" };
  return null;
}

/** Главная причина, почему день не сходится — одной фразой */
export function balanceIssue(sum: Macros, g: DayGoal): string | null {
  const n = (x: number) => Math.round(Math.abs(x));
  if (sum.protein < g.protein * 0.92) return `Белка не хватает ${n(g.protein - sum.protein)} г`;
  if (sum.kcal > g.kcal * 1.08) return `Калорий на ${n(sum.kcal - g.kcal)} больше нормы`;
  if (sum.kcal < g.kcal * 0.92) return `Калорий на ${n(g.kcal - sum.kcal)} меньше нормы`;
  if (g.fat && sum.fat > g.fat * 1.25) return `Жиров на ${n(sum.fat - g.fat)} г больше нормы`;
  if (g.carbs && sum.carbs < g.carbs * 0.65) return `Углеводов не хватает ${n(g.carbs - sum.carbs)} г`;
  if (g.carbs && sum.carbs > g.carbs * 1.4) return `Углеводов на ${n(sum.carbs - g.carbs)} г больше нормы`;
  return null;
}

let seq = 0;
export const newId = () => `${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Порции на день под калории И БЖУ, не трогая съеденное и закреплённое.
 * 1) Каждый приём — к своей доле калорий дня (завтрак 25%, обед 35%…).
 * 2) Дальше шагами по ¼ порции: на каждом шаге берём то изменение, которое сильнее всего
 *    приближает день к цели (dayLoss) — так белковым блюдам порции растут, жирным и сладким уменьшаются.
 */
export function fitDay(items: PlanItem[], dishOf: (it: PlanItem) => Dish | undefined, goal: DayGoal, keepIds?: Set<string>): PlanItem[] {
  const isFixed = (i: PlanItem) => i.eaten || i.locked || i.skipped || keepIds?.has(i.id) || !dishOf(i);
  const live = items.filter((i) => !i.skipped);
  const free = live.filter((i) => !isFixed(i));
  if (!free.length) return items;
  const fixedSum = sumItems(live.filter(isFixed));
  const meals = [...new Set(live.map((i) => i.meal))];
  const shareSum = meals.reduce<number>((a, m) => a + MEAL_SHARE[m], 0) || 1;
  const mealGoal = (m: Meal) => (goal.kcal * MEAL_SHARE[m]) / shareSum;

  // 1) Стартовые порции — по калориям приёма
  const port = new Map<string, number>();
  for (const m of meals) {
    const fixedM = sumItems(live.filter((i) => i.meal === m && isFixed(i))).kcal;
    const inMeal = free.filter((i) => i.meal === m);
    const baseM = inMeal.reduce((a, i) => a + dishOf(i)!.serving.kcal, 0);
    const k = baseM > 0 ? clamp((mealGoal(m) - fixedM) / baseM, 0.6, 1.8) : 1;
    for (const i of inMeal) port.set(i.id, clamp(quarter(k), 0.5, maxPortions(dishOf(i)!)));
  }

  // 2) Жадный подбор шагами по ¼
  const srv = new Map(free.map((i) => [i.id, dishOf(i)!.serving]));
  const mealFixed = new Map(meals.map((m) => [m, sumItems(live.filter((i) => i.meal === m && isFixed(i))).kcal]));
  const evaluate = () => {
    const sum = { ...fixedSum };
    const mk = new Map(mealFixed);
    for (const i of free) {
      const p = port.get(i.id)!;
      const sv = srv.get(i.id)!;
      sum.kcal += sv.kcal * p;
      sum.protein += sv.protein * p;
      sum.fat += sv.fat * p;
      sum.carbs += sv.carbs * p;
      mk.set(i.meal, (mk.get(i.meal) ?? 0) + sv.kcal * p);
    }
    let dev = 0;
    for (const m of meals) dev += ((mk.get(m)! - mealGoal(m)) / Math.max(goal.kcal, 1)) ** 2;
    return dayLoss(sum, goal, dev);
  };
  let cur = evaluate();
  for (let step = 0; step < 120; step++) {
    let best: { id: string; p: number; loss: number } | null = null;
    for (const i of free) {
      const p0 = port.get(i.id)!;
      const max = maxPortions(dishOf(i)!);
      for (const d of [0.25, -0.25]) {
        const p = p0 + d;
        if (p < 0.5 || p > max) continue;
        port.set(i.id, p);
        const l = evaluate();
        port.set(i.id, p0);
        if (l < cur - 1e-6 && (!best || l < best.loss)) best = { id: i.id, p, loss: l };
      }
    }
    if (!best) break;
    port.set(best.id, best.p);
    cur = best.loss;
  }
  return items.map((i) => (port.has(i.id) ? withPortions(i, dishOf(i)!, port.get(i.id)!) : i));
}

/** Потолок порции: протеиновый коктейль ×3 или банка творога ×2,5 — так никто не ест */
export function maxPortions(d: Pick<Dish, "basic" | "category">) {
  if (d.basic) return d.category === "snack" ? 1.5 : 2;
  return 2.5;
}

/** Оценка дня как есть (для сравнения вариантов) */
function lossOfDay(items: PlanItem[], goal: DayGoal) {
  const live = items.filter((i) => !i.skipped);
  const meals = [...new Set(live.map((i) => i.meal))];
  const shareSum = meals.reduce<number>((a, m) => a + MEAL_SHARE[m], 0) || 1;
  let dev = 0;
  for (const m of meals) dev += ((sumItems(live.filter((i) => i.meal === m)).kcal - (goal.kcal * MEAL_SHARE[m]) / shareSum) / Math.max(goal.kcal, 1)) ** 2;
  return dayLoss(sumItems(live), goal, dev);
}

export type BalanceCtx = {
  dishOf: (it: PlanItem) => Dish | undefined;
  goal: DayGoal;
  keepIds?: Set<string>;
  /** Блюда-добавки: белковые (творог, йогурт, тунец…) и углеводные (банан, каша) — уже отфильтрованы по ограничениям */
  boosts: Dish[];
  /** В какие приёмы этого дня можно добавлять */
  meals: Meal[];
};

/**
 * Баланс дня: порции под КБЖУ, а если день всё равно не сходится — добавляем блюдо-добавку
 * (белковую или углеводную) туда, где она лучше всего закрывает разницу (слабый перекус заменяем),
 * и пересчитываем порции.
 */
export function balanceDay(items: PlanItem[], day: string, ctx: BalanceCtx): PlanItem[] {
  let list = fitDay(items, ctx.dishOf, ctx.goal, ctx.keepIds);
  for (let round = 0; round < 2; round++) {
    const sum = sumItems(list.filter((i) => !i.skipped));
    if (dayBalanced(sum, ctx.goal)) break;
    let best: { list: PlanItem[]; loss: number } | null = null;
    const now = lossOfDay(list, ctx.goal);
    for (const b of ctx.boosts) {
      if (list.some((i) => i.kind === b.kind && i.ref === b.ref)) continue;
      for (const m of ctx.meals) {
        if (!fitsMeal(b, m)) continue;
        const inMeal = list.filter((i) => i.meal === m && !i.skipped);
        // Заменять можно только лёгкий перекус; в основные приёмы добавка идёт вторым блюдом
        const weak = m === 3 ? inMeal.find((i) => !i.eaten && !i.locked && !ctx.keepIds?.has(i.id) && i.protein < 8) : undefined;
        const add = itemFrom(b, day, m);
        const cand = weak ? list.map((i) => (i === weak ? add : i)) : inMeal.length < MAX_PER_SLOT ? [...list, add] : null;
        if (!cand) continue;
        const fitted = fitDay(cand, ctx.dishOf, ctx.goal, ctx.keepIds);
        const l = lossOfDay(fitted, ctx.goal);
        if (l < now - 0.003 && (!best || l < best.loss)) best = { list: fitted, loss: l };
      }
    }
    if (!best) break;
    list = best.list;
  }
  return list;
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
/** Готовится до 10 минут (творог с ягодами, тост) — «собрать», не готовка и не заготовка */
export const isQuick = (d: Pick<Dish, "time">) => (d.time ?? 99) <= 10;
/** Быстрое ли блюдо в плане; у планов до этого флага все простые блюда считались быстрыми */
export const itemQuick = (i: Pick<PlanItem, "quick" | "basic">) => i.quick ?? !!i.basic;
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
      quick: isQuick(dish),
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

  // 4) Порции под КБЖУ + добор белка
  const dishOf = (it: PlanItem) => dishes.get(codeOf(dishes, it));
  const boosts = (ctx.proteinBoost ?? []).map((c) => dishes.get(c)).filter((d): d is Dish => !!d && allowed(d, prefs.exclude));
  const result: PlanItem[] = [...keep];
  const keepIds = new Set(keep.map((k) => k.id));
  for (const day of days) {
    const list = [...keep.filter((k) => k.day === day), ...items.filter((i) => i.day === day)];
    if (!list.length) continue;
    const open = prefs.meals.filter((m) => !skips.has(`${day}|${m}`));
    const g = scaleGoal(goal(day), mealsShare(open));
    const balanced = balanceDay(list, day, { dishOf, goal: g, keepIds, boosts, meals: open.filter((m) => !covered.has(`${day}|${m}`)) });
    result.push(...balanced.filter((i) => !keepIds.has(i.id)));
  }
  return sortItems(rebatch(result, prefs.cook));
}

/**
 * Добавки белка и замены появляются уже после раскладки заготовок: одно и то же блюдо в соседние дни
 * (например, отварная грудка пн и вт) объединяем в одну готовку — как при сборке плана.
 */
export function rebatch(items: PlanItem[], mode: CookMode): PlanItem[] {
  if (mode === "daily") return items;
  const sorted = sortItems(items);
  const size = new Map<string, number>();
  for (const i of sorted) size.set(i.batch, (size.get(i.batch) ?? 0) + 1);
  const open = new Map<string, { batch: string; day: string; n: number }>();
  const out = sorted.map((i) => {
    if (i.skipped || itemQuick(i)) return i;
    const k = `${i.kind}:${i.ref}`;
    const o = open.get(k);
    const alone = i.cook && !i.eaten && size.get(i.batch) === 1;
    if (alone && o && o.batch !== i.batch && daysApart(o.day, i.day) <= KEEP_DAYS && o.n < MAX_BATCH) {
      o.n++;
      return { ...i, cook: false, batch: o.batch };
    }
    if (i.cook) open.set(k, { batch: i.batch, day: i.day, n: size.get(i.batch) ?? 1 });
    return i;
  });
  return out;
}

const daysApart = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

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
    .filter((i) => i.cook && !itemQuick(i))
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
