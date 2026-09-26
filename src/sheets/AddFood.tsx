import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Globe, PackagePlus, Plus, ScanBarcode, Search, X, Zap } from "lucide-react";
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
import "./sheets.css";

export function AddFoodSheet({ meal: initialMeal }: { meal?: Meal }) {
  const { day } = useDay();
  const nav = useNav();
  const layer = useLayer();
  const [meal, setMeal] = useState<Meal>(initialMeal ?? (mealByTime() as Meal));
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"recent" | "mine">("recent");
  const term = useDebounced(q.trim(), 220);
  const search = useFoodSearch(term);
  const recents = useRecents();
  const mine = useMyFoods();
  const [off, setOff] = useState<{ state: "idle" | "loading" | "done" | "error"; items: FoodDraft[] }>({ state: "idle", items: [] });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setOff({ state: "idle", items: [] }), [term]);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350);
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

  const searchOff = async () => {
    haptic.tap();
    setOff({ state: "loading", items: [] });
    try {
      setOff({ state: "done", items: await offSearch(term) });
    } catch {
      setOff({ state: "error", items: [] });
    }
  };

  const searching = term.length >= 2;

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
                  { value: "recent", label: "Недавние" },
                  { value: "mine", label: "Мои продукты" },
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
            ) : mine.data?.length ? (
              mine.data.map((f) => <DbFoodRow key={f.id} food={f} meal={meal} day={day} onOpen={() => open(f)} />)
            ) : (
              <div className="empty">
                <div className="big">📦</div>
                Своих продуктов пока нет. Создай продукт или отсканируй штрихкод.
              </div>
            )}
          </>
        ) : (
          <>
            {search.data?.length ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={term}>
                {search.data.map((f) => (
                  <DbFoodRow key={f.id} food={f} meal={meal} day={day} onOpen={() => open(f)} />
                ))}
              </motion.div>
            ) : search.isFetching ? (
              <SkeletonRows />
            ) : (
              <div className="empty" style={{ paddingBottom: 12 }}>
                В нашей базе ничего не нашлось
              </div>
            )}

            <div className="group-label">Мировая база продуктов</div>
            {off.state === "idle" && (
              <Tap className="btn btn-block btn-sm" style={{ marginTop: 6 }} onClick={searchOff}>
                <Globe size={17} /> Искать «{term}» в Open Food Facts
              </Tap>
            )}
            {off.state === "loading" && <SkeletonRows />}
            {off.state === "error" && <div className="empty">Не удалось связаться с базой. Попробуй ещё раз.</div>}
            {off.state === "done" &&
              (off.items.length ? (
                off.items.map((f, i) => (
                  <FoodRow
                    key={(f.barcode ?? "") + i}
                    name={f.name}
                    sub={[f.brand, `Б ${f.protein} · Ж ${f.fat} · У ${f.carbs}`].filter(Boolean).join(" · ")}
                    kcal={f.kcal}
                    kcalNote="на 100 г"
                    onOpen={() => open(f)}
                  />
                ))
              ) : (
                <div className="empty">
                  Ничего не нашлось.{" "}
                  <button style={{ color: "var(--kcal)", fontWeight: 600 }} onClick={() => nav.sheet(<CreateFoodSheet meal={meal} name={term} onDone={layer.close} />)}>
                    Создать «{term}»
                  </button>
                </div>
              ))}
          </>
        )}
      </div>
    </>
  );
}

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

function DbFoodRow({ food, meal, day, onOpen }: { food: Food; meal: Meal; day: string; onOpen: () => void }) {
  const grams = food.serving_g ?? 100;
  const m = scaleMacros(food, grams);
  const portion = food.serving_g ? `${food.serving_name ?? "порция"} · ${fmtNum(grams)} г` : "100 г";
  return (
    <FoodRow
      name={food.name}
      sub={[food.brand, portion].filter(Boolean).join(" · ")}
      kcal={m.kcal}
      kcalNote={food.serving_g ? "за порцию" : "на 100 г"}
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
}: {
  name: string;
  sub: string;
  kcal: number;
  kcalNote?: string;
  onOpen: () => void;
  quick?: QuickSpec;
}) {
  const add = useAddEntry();
  const toast = useToast();
  const [done, setDone] = useState(false);
  const onQuick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!quick) return;
    haptic.success();
    add.mutate({ ...quick.entry, day: quick.day, meal: quick.meal });
    toast(`${MEALS[quick.meal].name}: +${fmtNum(quick.entry.kcal)} ккал`, <Check size={18} color="var(--good)" />);
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  };
  return (
    <motion.button className="food-row" onClick={onOpen} whileTap={{ scale: 0.985 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="food-row-name">{name}</div>
        <div className="food-row-sub">{sub}</div>
      </div>
      <div className="food-row-kcal num">
        {fmtNum(kcal)}
        {kcalNote && <small>{kcalNote}</small>}
      </div>
      {quick && (
        <motion.span className={`quick-add ${done ? "done" : ""}`} onClick={onQuick} whileTap={{ scale: 0.8 }} role="button" aria-label="Добавить сразу">
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
        </motion.span>
      )}
    </motion.button>
  );
}
