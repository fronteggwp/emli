import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight, Globe, PackagePlus, Plus, ScanBarcode, Search, X, Zap } from "lucide-react";
import { useDay } from "@/state/day";
import { useLayer, useNav } from "@/nav/Nav";
import { getFood, useAddEntry, useFoodSearch, useMyFoods, useRecents } from "@/data/api";
import { offSearch } from "@/data/off";
import { useDebounced } from "@/lib/hooks";
import { MEALS, fmtNum, mealByTime, scaleMacros } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { Food, FoodDraft, Meal, RecentFood } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { Segmented } from "@/ui/Segmented";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { FoodDetailSheet } from "./FoodDetail";
import { QuickAddSheet } from "./QuickAdd";
import { CreateFoodSheet } from "./CreateFood";
import { ScannerSheet } from "./Scanner";
import { loadDetector } from "@/lib/barcode";
import {
  RECIPE_CATS,
  recipeItem,
  searchRecipes,
  templateTotal,
  useDeleteTemplate,
  useFavoriteFoods,
  useFavorites,
  useLogItems,
  useMealTemplates,
  useRecipes,
  useUserRecipes,
  userRecipeItem,
  userRecipeServing,
  type MealTemplate,
  type Recipe,
  type RecipeCategory,
  type TemplateItem,
} from "@/data/engage";
import { RecipeRow, RecipesScreen } from "@/pages/Recipes";
import { RecipeEditorScreen } from "@/pages/RecipeEditor";
import { LogRecipeSheet } from "./LogRecipe";
import { confirmDialog } from "@/lib/telegram";
import "@/pages/recipes.css";
import "./sheets.css";

type AddTab = "recent" | "fav" | "mine" | "recipes";

export function AddFoodSheet({ meal: initialMeal, tab: initialTab = "recent" }: { meal?: Meal; tab?: AddTab }) {
  const { day } = useDay();
  const nav = useNav();
  // Подгружаем распознавание штрихкодов заранее — сканер откроется без задержки
  useEffect(() => {
    const t = setTimeout(() => loadDetector().catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, []);
  const layer = useLayer();
  const [meal, setMeal] = useState<Meal>(initialMeal ?? (mealByTime() as Meal));
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<AddTab>(initialTab);
  const term = useDebounced(q.trim(), 220);
  const search = useFoodSearch(term);
  const recents = useRecents(meal);
  // Твоя обычная порция каждого продукта — подставляется в поиске
  const usual = useMemo(() => new Map((recents.data ?? []).filter((r) => r.food_id && r.grams).map((r) => [r.food_id!, r.grams!])), [recents.data]);
  // Свои частые продукты — выше в выдаче
  const searchSorted = useMemo(() => {
    const list = search.data ?? [];
    return [...list].sort((a, b) => Number(usual.has(b.id)) - Number(usual.has(a.id)));
  }, [search.data, usual]);
  const mine = useMyFoods();
  const recipes = useRecipes();
  const templates = useMealTemplates();
  const myRecipes = useUserRecipes();
  const log = useLogItems();
  const toast = useToast();
  // Мировую базу ищем параллельно, с чуть большей паузой — она медленнее нашей
  const offTerm = useDebounced(q.trim(), 450);
  const off = useQuery({
    queryKey: ["off", offTerm.toLowerCase()],
    enabled: offTerm.length >= 2,
    queryFn: ({ signal }) => offSearch(offTerm, signal),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 520);
    return () => clearTimeout(t);
  }, []);

  const open = (food: Food | FoodDraft, grams?: number) =>
    nav.sheet(<FoodDetailSheet food={food} meal={meal} day={day} grams={grams} onDone={layer.close} />);

  const openRecent = async (r: RecentFood) => {
    if (r.food_id) {
      try {
        open(await getFood(r.food_id), r.grams ?? undefined);
        return;
      } catch {
        /* продукт удалён — откроем по снимку */
      }
    }
    if (r.grams) {
      const k = 100 / r.grams;
      open(
        {
          name: r.name,
          brand: r.brand,
          barcode: null,
          category: null,
          kcal: Math.round(r.kcal * k),
          protein: Math.round(r.protein * k * 10) / 10,
          fat: Math.round(r.fat * k * 10) / 10,
          carbs: Math.round(r.carbs * k * 10) / 10,
          serving_g: null,
          serving_name: null,
          source: "user",
        },
        r.grams,
      );
    } else {
      nav.sheet(<QuickAddSheet meal={meal} preset={r} />);
    }
  };

  const searching = term.length >= 2;
  const foundTemplates = searching ? (templates.data ?? []).filter((t) => t.name.toLowerCase().includes(term.toLowerCase())) : [];
  const foundRecipes = searching ? searchRecipes(recipes.data ?? [], term).slice(0, 4) : [];

  const logItems = (items: TemplateItem[], templateId?: string) => {
    haptic.success();
    log.mutate({ items, day, meal, templateId });
    toast(`${MEALS[meal].name}: +${fmtNum(templateTotal(items).kcal)} ккал`, <Check size={18} color="var(--good)" />);
  };
  const openRecipe = (r: Recipe) =>
    nav.sheet(<LogRecipeSheet title={r.title} emoji={r.emoji} serving={r.serving} toItem={(p) => recipeItem(r, p)} meal={meal} onDone={layer.close} />);

  return (
    <>
      <SheetHeader
        title="Добавить еду"
        right={
          <Tap className="icon-btn" onClick={() => nav.sheet(<ScannerSheet meal={meal} onDone={layer.close} />, { full: true })} aria-label="Сканер">
            <ScanBarcode size={19} />
          </Tap>
        }
      />
      <div className="search-box" data-sheet-drag-ignore>
        <Search size={19} className="faint" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Гречка, творог, банан…"
          enterKeyHint="search"
          autoComplete="off"
        />
        <AnimatePresence>
          {q && (
            <motion.button
              className="icon-btn"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
            >
              <X size={16} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <div className="chips-row">
        {MEALS.map((m) => (
          <Tap
            key={m.id}
            className={`chip ${meal === m.id ? "on" : ""}`}
            onClick={() => {
              haptic.select();
              setMeal(m.id as Meal);
            }}
          >
            {m.emoji} {m.name}
          </Tap>
        ))}
      </div>

      <div className="sheet-body">
        {!searching ? (
          <>
            <div className="action-tiles" style={{ marginTop: 10 }}>
              <Tap className="action-tile" onClick={() => nav.sheet(<QuickAddSheet meal={meal} />)}>
                <span className="ico" style={{ background: "rgba(255,194,71,.15)", color: "var(--fat)" }}>
                  <Zap size={22} />
                </span>
                <span>
                  <div className="t">Быстро</div>
                  <div className="s">Только калории и БЖУ</div>
                </span>
              </Tap>
              <Tap className="action-tile" onClick={() => nav.sheet(<CreateFoodSheet meal={meal} onDone={layer.close} />)}>
                <span className="ico" style={{ background: "rgba(79,209,139,.15)", color: "var(--carbs)" }}>
                  <PackagePlus size={22} />
                </span>
                <span>
                  <div className="t">Свой продукт</div>
                  <div className="s">С этикетки упаковки</div>
                </span>
              </Tap>
            </div>
            <div style={{ margin: "18px 0 6px" }}>
              <Segmented
                size="sm"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "recent", label: "Частые" },
                  { value: "fav", label: "Избранное" },
                  { value: "mine", label: "Моё" },
                  { value: "recipes", label: "Рецепты" },
                ]}
              />
            </div>
            {tab === "recent" ? (
              recents.data?.length ? (
                recents.data.map((r) => (
                  <FoodRow
                    key={r.name + r.last_used}
                    name={r.name}
                    sub={[r.brand, r.grams ? `${fmtNum(r.grams)} г` : "быстрая запись"].filter(Boolean).join(" · ")}
                    kcal={r.kcal}
                    kcalNote={r.grams ? "за порцию" : undefined}
                    onOpen={() => openRecent(r)}
                    quick={{ meal, day, entry: { ...r, food_id: r.food_id } }}
                  />
                ))
              ) : (
                <div className="empty">
                  <div className="big">🍽️</div>
                  Здесь появится то, что ты ешь чаще всего
                </div>
              )
            ) : tab === "fav" ? (
              <FavTab meal={meal} day={day} onOpenFood={(f) => open(f)} onOpenRecipe={openRecipe} />
            ) : tab === "mine" ? (
              <>
                <div className="group-label row" style={{ justifyContent: "space-between" }}>
                  <span>⭐ Мои приёмы пищи</span>
                </div>
                {templates.data?.length ? (
                  templates.data.map((t) => <TemplateRow key={t.id} t={t} onLog={() => logItems(t.items, t.id)} />)
                ) : (
                  <div className="faint" style={{ fontSize: 14, padding: "6px 2px 4px" }}>
                    Запиши приём в дневник и нажми значок закладки у него — набор сохранится сюда и будет добавляться в один тап.
                  </div>
                )}

                <div className="group-label row" style={{ justifyContent: "space-between" }}>
                  <span>👩‍🍳 Мои рецепты</span>
                  <button style={{ color: "var(--kcal)", fontWeight: 600 }} onClick={() => nav.push(<RecipeEditorScreen />)}>
                    + Создать
                  </button>
                </div>
                {myRecipes.data?.length ? (
                  myRecipes.data.map((r) => {
                    const sv = userRecipeServing(r);
                    return (
                      <FoodRow
                        key={r.id}
                        name={`${r.emoji} ${r.title}`}
                        sub={`${r.servings} порц. · порция ${fmtNum(sv.grams)} г`}
                        kcal={sv.kcal}
                        kcalNote="за порцию"
                        onOpen={() =>
                          nav.sheet(<LogRecipeSheet title={r.title} emoji={r.emoji} serving={sv} toItem={(p) => userRecipeItem(r, p)} meal={meal} onDone={layer.close} />)
                        }
                        onQuickItems={() => logItems([userRecipeItem(r, 1)])}
                      />
                    );
                  })
                ) : (
                  <div className="faint" style={{ fontSize: 14, padding: "6px 2px 4px" }}>
                    Собери своё блюдо из продуктов — Emli посчитает КБЖУ порции.
                  </div>
                )}

                <div className="group-label">📦 Мои продукты</div>
                {mine.data?.length ? (
                  mine.data.map((f) => <DbFoodRow key={f.id} food={f} meal={meal} day={day} onOpen={() => open(f)} />)
                ) : (
                  <div className="faint" style={{ fontSize: 14, padding: "6px 2px" }}>
                    Своих продуктов пока нет. Создай продукт или отсканируй штрихкод.
                  </div>
                )}
              </>
            ) : (
              <RecipesTab meal={meal} onOpen={openRecipe} onQuick={(r) => logItems([recipeItem(r, 1)])} />
            )}
          </>
        ) : (
          <>
            {(foundTemplates.length > 0 || foundRecipes.length > 0) && (
              <>
                {foundTemplates.map((t) => (
                  <TemplateRow key={t.id} t={t} onLog={() => logItems(t.items, t.id)} />
                ))}
                {foundRecipes.map((r) => (
                  <RecipeRow key={r.id} r={r} onOpen={() => openRecipe(r)} onQuick={() => logItems([recipeItem(r, 1)])} />
                ))}
                <div className="group-label">Продукты</div>
              </>
            )}
            {search.data?.length ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={term}>
                {searchSorted.map((f) => (
                  <DbFoodRow key={f.id} food={f} meal={meal} day={day} usualGrams={usual.get(f.id)} onOpen={() => open(f, usual.get(f.id))} />
                ))}
              </motion.div>
            ) : search.isFetching ? (
              <SkeletonRows />
            ) : (
              <div className="faint" style={{ padding: "10px 2px", fontSize: 14 }}>
                В базе Emli ничего — смотри мировую базу ниже
              </div>
            )}

            <div className="group-label row" style={{ gap: 6 }}>
              <Globe size={13} /> Open Food Facts
            </div>
            {off.data?.length ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={"off" + offTerm}>
                {off.data.map((f, i) => (
                  <FoodRow
                    key={(f.barcode ?? "") + i}
                    name={f.name}
                    sub={[f.brand, `Б ${fmt1(f.protein)} · Ж ${fmt1(f.fat)} · У ${fmt1(f.carbs)}`].filter(Boolean).join(" · ")}
                    kcal={f.kcal}
                    kcalNote="на 100 г"
                    onOpen={() => open(f)}
                  />
                ))}
              </motion.div>
            ) : off.isFetching || offTerm !== q.trim() ? (
              <SkeletonRows />
            ) : off.isError ? (
              <div className="empty">
                Мировая база не ответила.{" "}
                <button style={{ color: "var(--kcal)", fontWeight: 600 }} onClick={() => off.refetch()}>
                  Повторить
                </button>
              </div>
            ) : (
              <div className="empty">
                Не нашёл «{term}».{" "}
                <button style={{ color: "var(--kcal)", fontWeight: 600 }} onClick={() => nav.sheet(<CreateFoodSheet meal={meal} name={term} onDone={layer.close} />)}>
                  Создать продукт
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

const fmt1 = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

function SkeletonRows() {
  return (
    <div style={{ padding: "8px 0" }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="row" style={{ padding: "12px 0" }}>
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 16, width: `${70 - i * 8}%` }} />
            <div className="skeleton" style={{ height: 12, width: "40%", marginTop: 8 }} />
          </div>
          <div className="skeleton" style={{ height: 20, width: 48 }} />
        </div>
      ))}
    </div>
  );
}

function DbFoodRow({ food, meal, day, onOpen, usualGrams }: { food: Food; meal: Meal; day: string; onOpen: () => void; usualGrams?: number }) {
  const grams = usualGrams ?? food.serving_g ?? 100;
  const m = scaleMacros(food, grams);
  const portion = usualGrams
    ? `обычно ${fmtNum(grams)} г`
    : food.serving_g
      ? `${food.serving_name ?? "порция"} · ${fmtNum(grams)} г`
      : "100 г";
  return (
    <FoodRow
      name={food.name}
      sub={[food.brand, portion].filter(Boolean).join(" · ")}
      kcal={m.kcal}
      kcalNote={usualGrams || food.serving_g ? "за порцию" : "на 100 г"}
      onOpen={onOpen}
      quick={{ meal, day, entry: { ...m, name: food.name, brand: food.brand, grams, food_id: food.id } }}
    />
  );
}

type QuickSpec = {
  meal: Meal;
  day: string;
  entry: { name: string; brand: string | null; grams: number | null; food_id: string | null; kcal: number; protein: number; fat: number; carbs: number };
};

function FoodRow({
  name,
  sub,
  kcal,
  kcalNote,
  onOpen,
  quick,
  onQuickItems,
}: {
  name: string;
  sub: string;
  kcal: number;
  kcalNote?: string;
  onOpen: () => void;
  quick?: QuickSpec;
  onQuickItems?: () => void;
}) {
  const add = useAddEntry();
  const toast = useToast();
  const [done, setDone] = useState(false);
  const onQuick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onQuickItems) {
      onQuickItems();
      setDone(true);
      setTimeout(() => setDone(false), 1400);
      return;
    }
    if (!quick) return;
    haptic.success();
    add.mutate({ ...quick.entry, day: quick.day, meal: quick.meal });
    toast(`${MEALS[quick.meal].name}: +${fmtNum(quick.entry.kcal)} ккал`, <Check size={18} color="var(--good)" />);
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  };
  return (
    <button className="food-row press" onClick={onOpen}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="food-row-name">{name}</div>
        <div className="food-row-sub">{sub}</div>
      </div>
      <div className="food-row-kcal num">
        {fmtNum(kcal)}
        {kcalNote && <small>{kcalNote}</small>}
      </div>
      {(quick || onQuickItems) && (
        <span className={`quick-add tap ${done ? "done" : ""}`} style={{ ["--tap-scale" as string]: 0.8 }} onClick={onQuick} role="button" aria-label="Добавить сразу">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={done ? "d" : "p"}
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 25 }}
              style={{ display: "grid" }}
            >
              {done ? <Check size={18} strokeWidth={3} /> : <Plus size={18} strokeWidth={2.4} />}
            </motion.span>
          </AnimatePresence>
        </span>
      )}
    </button>
  );
}

// ───────────── Вкладки: избранное, приёмы, рецепты

function FavTab({ meal, day, onOpenFood, onOpenRecipe }: { meal: Meal; day: string; onOpenFood: (f: Food) => void; onOpenRecipe: (r: Recipe) => void }) {
  const fav = useFavorites();
  const foods = useFavoriteFoods();
  const recipes = useRecipes();
  const log = useLogItems();
  const toast = useToast();
  const favRecipes = (fav.data ?? [])
    .filter((f) => f.kind === "recipe")
    .map((f) => recipes.data?.find((r) => r.id === f.ref))
    .filter((r): r is Recipe => !!r);
  if (fav.isLoading || foods.isLoading) return <SkeletonRows />;
  if (!foods.data?.length && !favRecipes.length)
    return (
      <div className="empty">
        <div className="big">❤️</div>
        Нажми на сердечко у продукта или рецепта — он появится здесь
      </div>
    );
  return (
    <>
      {(foods.data ?? []).map((f) => (
        <DbFoodRow key={f.id} food={f} meal={meal} day={day} onOpen={() => onOpenFood(f)} />
      ))}
      {favRecipes.length > 0 && <div className="group-label">Рецепты</div>}
      {favRecipes.map((r) => (
        <RecipeRow
          key={r.id}
          r={r}
          onOpen={() => onOpenRecipe(r)}
          onQuick={() => {
            haptic.success();
            const item = recipeItem(r, 1);
            log.mutate({ items: [item], day, meal });
            toast(`${MEALS[meal].name}: +${fmtNum(item.kcal)} ккал`, <Check size={18} color="var(--good)" />);
          }}
        />
      ))}
    </>
  );
}

function TemplateRow({ t, onLog }: { t: MealTemplate; onLog: () => void }) {
  const del = useDeleteTemplate();
  const total = templateTotal(t.items);
  const names = t.items.map((i) => i.name);
  return (
    <FoodRow
      name={`${t.emoji} ${t.name}`}
      sub={names.slice(0, 2).join(", ") + (names.length > 2 ? ` и ещё ${names.length - 2}` : "")}
      kcal={total.kcal}
      kcalNote={`${t.items.length} прод.`}
      onOpen={async () => {
        if (await confirmDialog(`Удалить «${t.name}» из моих приёмов?`)) del.mutate(t.id);
      }}
      onQuickItems={onLog}
    />
  );
}

function RecipesTab({ meal, onOpen, onQuick }: { meal: Meal; onOpen: (r: Recipe) => void; onQuick: (r: Recipe) => void }) {
  const nav = useNav();
  const recipes = useRecipes();
  const [cat, setCat] = useState<RecipeCategory>(meal === 0 ? "breakfast" : meal === 3 ? "snack" : "main");
  const list = (recipes.data ?? []).filter((r) => r.category === cat);
  return (
    <>
      <div className="chips-row" style={{ margin: "4px -16px 4px", padding: "0 16px" }}>
        {RECIPE_CATS.map((c) => (
          <Tap
            key={c.id}
            className={`chip ${cat === c.id ? "on" : ""}`}
            style={{ height: 32, fontSize: 13 }}
            onClick={() => {
              haptic.select();
              setCat(c.id);
            }}
          >
            {c.emoji} {c.name}
          </Tap>
        ))}
      </div>
      {recipes.isLoading ? (
        <SkeletonRows />
      ) : (
        list.map((r) => <RecipeRow key={r.id} r={r} onOpen={() => onOpen(r)} onQuick={() => onQuick(r)} />)
      )}
      <button className="food-row press" style={{ justifyContent: "center", color: "var(--kcal)", fontWeight: 600 }} onClick={() => nav.push(<RecipesScreen />)}>
        Вся книга рецептов <ChevronRight size={16} />
      </button>
    </>
  );
}
