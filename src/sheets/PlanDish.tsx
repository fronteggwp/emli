import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Check, Lock, Minus, Plus, RefreshCw, Search, Sparkles, Trash2, Unlock } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { NumberTicker } from "@/ui/NumberTicker";
import { useToast } from "@/ui/Toast";
import { confirmDialog, haptic } from "@/lib/telegram";
import { fmt, todayKey } from "@/lib/dates";
import { MEALS, fmtNum } from "@/lib/nutrition";
import { cookSessions, portionsText, removeItem, replaceItem, withPortions, type Dish } from "@/lib/mealplan";
import { dishOfItem, useDishes, useEatItem, usePlan, useUpdatePlan } from "@/data/mealplan";
import { swapOptions } from "@/data/planGen";
import { openRecipe } from "@/pages/MealPlan";
import { PlanPickerSheet } from "./PlanPicker";
import "./mealplan.css";


/** Блюдо из плана: порция, «съел», замена, закрепление, рецепт */
export function PlanDishSheet({ planId, itemId, own }: { planId: string; itemId: string; own: boolean }) {
  const nav = useNav();
  const layer = useLayer();
  const toast = useToast();
  const plan = usePlan(planId).data;
  const { map } = useDishes();
  const update = useUpdatePlan(planId);
  const eat = useEatItem(planId);
  const item = plan?.items.find((i) => i.id === itemId);
  const dish = item ? dishOfItem(map, item) : undefined;
  const [portions, setPortions] = useState(item?.portions ?? 1);
  const saveT = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(saveT.current), []);
  if (!plan || !item) return null;
  const view = dish ? withPortions(item, dish, portions) : item;
  const session = cookSessions(plan.items, plan.prefs.people).find((s) => s.batch === item.batch);
  const batch = plan.items.filter((i) => i.batch === item.batch && !i.skipped);
  const future = item.day > todayKey();

  const bump = (d: number) => {
    if (!dish) return;
    haptic.select();
    const p = Math.min(4, Math.max(0.25, portions + d));
    setPortions(p);
    clearTimeout(saveT.current);
    // Сохраняем, когда перестали нажимать
    saveT.current = setTimeout(() => {
      const fresh = plan.items.map((i) => (i.id === item.id ? withPortions(i, dish, p) : i));
      update.mutate({ items: fresh });
    }, 500);
  };

  const remove = async () => {
    if (item.cook && batch.length > 1 && !(await confirmDialog("Это день готовки — готовка переедет на следующий приём с этим блюдом. Убрать?"))) return;
    haptic.rigid();
    update.mutate({ items: removeItem(plan.items, item.id) });
    toast("Убрано из плана");
    layer.close();
  };

  const toggleLock = () => {
    haptic.select();
    update.mutate({ items: plan.items.map((i) => (i.id === item.id ? { ...i, locked: !i.locked } : i)) });
    toast(item.locked ? "Больше не закреплено" : "Закреплено — не изменится при пересборке");
  };

  const cover = dish?.img?.replace("-s.webp", ".webp");
  return (
    <>
      <SheetHeader title="" />
      <div className="sheet-body mp-dishsheet">
        <div className="mp-ds-cover">
          {cover ? <img src={cover} alt="" /> : <span className="mp-ds-emoji">{item.emoji}</span>}
          <div className="mp-ds-when">
            {fmt(item.day, "EEEE, d MMM")} · {MEALS[item.meal].name}
          </div>
        </div>
        <h2 className="mp-ds-title">{item.title}</h2>
        {dish?.basic && <div className="mp-ds-sub">Простое блюдо — собирается за {dish.time ?? 5} мин</div>}

        <div className="mp-ds-portion">
          {own && (
            <Tap className="icon-btn" onClick={() => bump(-0.25)} disabled={portions <= 0.25} aria-label="Меньше">
              <Minus size={18} />
            </Tap>
          )}
          <div className="mp-ds-portion-mid">
            <b className="num">{portionsText(portions)}</b>
            <span>
              {portions === 1 ? "порция" : "порции"} · {fmtNum(view.grams)} г
            </span>
          </div>
          {own && (
            <Tap className="icon-btn" onClick={() => bump(0.25)} disabled={portions >= 4} aria-label="Больше">
              <Plus size={18} />
            </Tap>
          )}
        </div>
        <div className="mp-ds-macros">
          <div>
            <b className="num">
              <NumberTicker value={view.kcal} duration={0.4} />
            </b>
            <small>ккал</small>
          </div>
          <div style={{ color: "var(--protein)" }}>
            <b className="num">{fmtNum(view.protein)}</b>
            <small>белки</small>
          </div>
          <div style={{ color: "var(--fat)" }}>
            <b className="num">{fmtNum(view.fat)}</b>
            <small>жиры</small>
          </div>
          <div style={{ color: "var(--carbs)" }}>
            <b className="num">{fmtNum(view.carbs)}</b>
            <small>углеводы</small>
          </div>
        </div>

        {session && session.eats.length > 1 && (
          <div className="mp-ds-batch">
            <span className="mp-ds-batch-ico">📦</span>
            <span>
              <b>
                Готовим {fmt(session.day, "EEEE")} на {portionsText(session.servings)} порц.
              </b>
              <small>Хватит на: {session.eats.map((e) => `${fmt(e.day, "EEEEEE")} ${MEALS[e.meal].name.toLowerCase()}`).join(" · ")}</small>
            </span>
          </div>
        )}

        <div className="card list" style={{ padding: 0, marginTop: 12 }}>
          <Tap className="list-item" onClick={() => openRecipe(nav, item, session?.servings)}>
            <BookOpen size={19} />
            <span style={{ flex: 1 }}>{dish?.basic ? "Как собрать" : "Открыть рецепт"}</span>
            <span className="faint">›</span>
          </Tap>
          {own && (
            <Tap className="list-item" onClick={() => nav.sheet(<PlanSwapSheet planId={planId} itemId={itemId} onDone={layer.close} />)}>
              <RefreshCw size={19} />
              <span style={{ flex: 1 }}>Заменить блюдо</span>
              <span className="mp-ai-pill">
                <Sparkles size={11} /> ИИ
              </span>
            </Tap>
          )}
          {own && (
            <Tap className="list-item" onClick={toggleLock}>
              {item.locked ? <Unlock size={19} /> : <Lock size={19} />}
              <span style={{ flex: 1 }}>
                {item.locked ? "Открепить" : "Закрепить"}
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {item.locked ? "Сейчас не меняется при пересборке" : "Не менять при пересборке плана"}
                </div>
              </span>
            </Tap>
          )}
          {own && (
            <Tap className="list-item" style={{ color: "var(--danger)" }} onClick={remove}>
              <Trash2 size={19} />
              <span style={{ flex: 1 }}>Убрать из плана</span>
            </Tap>
          )}
        </div>
      </div>
      {own && (
        <div className="sheet-foot">
          <Tap
            className={`btn btn-block ${item.eaten ? "" : "btn-accent"}`}
            disabled={future && !item.eaten}
            onClick={() => {
              const next = !item.eaten;
              next ? haptic.success() : haptic.tap();
              eat.mutate({ item: dish ? { ...withPortions(item, dish, portions) } : item, eat: next });
              toast(next ? `${MEALS[item.meal].name}: +${fmtNum(view.kcal)} ккал` : "Убрано из дневника");
              layer.close();
            }}
          >
            {item.eaten ? (
              "Отменить «съел»"
            ) : future ? (
              `Можно отметить ${fmt(item.day, "d MMMM")}`
            ) : (
              <>
                <Check size={18} strokeWidth={3} /> Съел — записать в дневник
              </>
            )}
          </Tap>
        </div>
      )}
    </>
  );
}

// ───────────── Замена блюда

type Opt = { dish: Dish; why: string | null };

export function PlanSwapSheet({ planId, itemId, onDone }: { planId: string; itemId: string; onDone?: () => void }) {
  const nav = useNav();
  const layer = useLayer();
  const toast = useToast();
  const plan = usePlan(planId).data;
  const { map } = useDishes();
  const update = useUpdatePlan(planId);
  const item = plan?.items.find((i) => i.id === itemId);
  const [opts, setOpts] = useState<Opt[] | null>(null);
  const [ai, setAi] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<Dish | null>(null);
  const [round, setRound] = useState(0);
  const batch = plan && item ? plan.items.filter((i) => i.batch === item.batch && !i.skipped && !i.eaten) : [];

  useEffect(() => {
    if (!plan || !item || !map) return;
    let alive = true;
    setOpts(null);
    setErr(null);
    swapOptions({ item, items: plan.items, prefs: plan.prefs, dishes: map })
      .then((r) => alive && (setOpts(r.options), setAi(r.ai)))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "failed"));
    return () => void (alive = false);
    // Новый круг вариантов — только по кнопке
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, !!map]);

  if (!plan || !item) return null;

  const apply = (dish: Dish, scope: "one" | "batch") => {
    haptic.success();
    update.mutate({ items: replaceItem(plan.items, item.id, dish, scope) });
    toast(`Заменено на «${dish.title}»`);
    layer.close();
    onDone?.();
  };
  const choose = (dish: Dish) => {
    haptic.select();
    if (batch.length > 1) setPick(dish);
    else apply(dish, "one");
  };

  return (
    <>
      <SheetHeader title="Чем заменить?" />
      <div className="sheet-body">
        <div className="mp-swap-cur">
          <span>{item.emoji}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <small>Сейчас · {fmt(item.day, "EEEEEE")} {MEALS[item.meal].name.toLowerCase()}</small>
            <b>{item.title}</b>
          </span>
          <span className="num faint">{fmtNum(item.kcal)} ккал</span>
        </div>
        <AnimatePresence mode="wait">
          {pick ? (
            <motion.div key="scope" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="mp-scope-q">
                «{item.title}» стоит в плане {batch.length} раза из одной заготовки. Заменить везде?
              </div>
              <Tap className="btn btn-accent btn-block" onClick={() => apply(pick, "batch")}>
                Во всех {batch.length} приёмах
              </Tap>
              <Tap className="btn btn-block" style={{ marginTop: 8 }} onClick={() => apply(pick, "one")}>
                Только {fmt(item.day, "EEEEEE")} {MEALS[item.meal].name.toLowerCase()}
              </Tap>
              <Tap className="btn btn-block" style={{ marginTop: 8, background: "transparent" }} onClick={() => setPick(null)}>
                Назад к вариантам
              </Tap>
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="mp-swap-label">
                <Sparkles size={13} /> {opts ? (ai ? "ИИ предлагает" : "Похожие по калориям и белку") : "ИИ подбирает замену…"}
              </div>
              {err === "limit" && <div className="mp-hint warn">Лимит замен с ИИ на сегодня исчерпан — выбери блюдо сам</div>}
              <div className="stack" style={{ gap: 8 }}>
                {!opts && !err && [0, 1, 2].map((i) => <div key={i} className="skeleton mp-swap-skel" style={{ animationDelay: `${i * 120}ms` }} />)}
                {opts?.map((o, i) => {
                  const k = Math.min(2.5, Math.max(0.5, item.kcal / Math.max(o.dish.serving.kcal, 1)));
                  return (
                    <motion.div key={o.dish.code + i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                      <Tap className="mp-swap-opt" scale={0.98} onClick={() => choose(o.dish)}>
                        <span className="mp-thumb big">{o.dish.img ? <img src={o.dish.img} alt="" /> : <span className="mp-thumb-emoji">{o.dish.emoji}</span>}</span>
                        <span className="mp-swap-text">
                          <b>{o.dish.title}</b>
                          <span className="num">
                            ≈ {fmtNum(Math.round(o.dish.serving.kcal * k))} ккал · Б {fmtNum(o.dish.serving.protein * k)} г{o.dish.time ? ` · ${o.dish.time} мин` : ""}
                          </span>
                          {o.why && <small>{o.why}</small>}
                        </span>
                      </Tap>
                    </motion.div>
                  );
                })}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <Tap className="btn btn-sm" style={{ flex: 1 }} disabled={!opts} onClick={() => (haptic.tap(), setRound((r) => r + 1))}>
                  <RefreshCw size={15} /> Ещё варианты
                </Tap>
                <Tap
                  className="btn btn-sm"
                  style={{ flex: 1 }}
                  onClick={() =>
                    nav.sheet(<PlanPickerSheet meal={item.meal} title="Выбрать блюдо" prefs={plan.prefs} onPick={(d) => setTimeout(() => choose(d), 350)} />, { full: true })
                  }
                >
                  <Search size={15} /> Выбрать сам
                </Tap>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

