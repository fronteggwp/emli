import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChefHat,
  Clock,
  Home,
  Lock,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Share2,
  ShoppingBasket,
  Snowflake,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useNav } from "@/nav/Nav";
import { Screen } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { Icon3D, MEAL_ICON } from "@/ui/Icon3D";
import { Segmented } from "@/ui/Segmented";
import { Avatar } from "@/ui/Avatar";
import { NumberTicker } from "@/ui/NumberTicker";
import { useToast } from "@/ui/Toast";
import { useUid } from "@/lib/auth";
import { haptic, tg } from "@/lib/telegram";
import { fmt, shiftKey, todayKey } from "@/lib/dates";
import { MEALS, fmtNum } from "@/lib/nutrition";
import {
  DEPTS,
  cookSessions,
  mealsShare,
  portionsText,
  qtyText,
  shoppingList,
  sumItems,
  type CookSession,
  type PlanItem,
  type ShopLine,
} from "@/lib/mealplan";
import type { Meal } from "@/lib/types";
import { usePeople } from "@/data/social";
import {
  dishOfItem,
  planDays,
  planEnd,
  useActivePlan,
  useDeleteMark,
  useDishes,
  useEatItem,
  useMyPlans,
  usePlan,
  usePlanMembers,
  useRespondPlan,
  useResetMarks,
  useSetMark,
  useSharedPlans,
  useShopMarks,
  useCreatePlan,
  type MealPlan,
} from "@/data/mealplan";
import { PlanSetupSheet, useGoal } from "@/sheets/PlanSetup";
import { PlanDishSheet } from "@/sheets/PlanDish";
import { PlanMenuSheet, PlanRegenSheet } from "@/sheets/PlanMenu";
import { PlanShareSheet } from "@/sheets/PlanShare";
import { PlanPickerSheet } from "@/sheets/PlanPicker";
import { RecipeScreen, UserRecipeScreen } from "./Recipe";
import { addItem } from "@/lib/mealplan";
import { useUpdatePlan } from "@/data/mealplan";
import "@/sheets/mealplan.css";

type Tab = "menu" | "shop" | "cook";

/** Экран плана питания: текущий план или приглашение составить новый */
export function MealPlanScreen({ id, tab }: { id?: string; tab?: Tab }) {
  const active = useActivePlan();
  const planId = id ?? active.plan?.id;
  if (!planId) {
    return <Screen title="План питания">{active.loading ? <div className="skeleton" style={{ height: 320, borderRadius: 28 }} /> : <PlanLanding />}</Screen>;
  }
  return <PlanScreen key={planId} id={planId} tab={tab} />;
}

function PlanScreen({ id, tab: tab0 }: { id: string; tab?: Tab }) {
  const nav = useNav();
  const uid = useUid();
  const q = usePlan(id);
  const plan = q.data;
  const [tab, setTab] = useState<Tab>(tab0 ?? "menu");
  if (!plan) {
    return (
      <Screen title="План питания">
        {q.isLoading ? <div className="skeleton" style={{ height: 320, borderRadius: 28 }} /> : <div className="empty">План не найден или доступ закрыт</div>}
      </Screen>
    );
  }
  const own = plan.owner_id === uid;
  return (
    <Screen
      title="План питания"
      right={
        <Tap className="icon-btn" onClick={() => nav.sheet(<PlanMenuSheet plan={plan} own={own} />)} aria-label="Ещё">
          <MoreHorizontal size={20} />
        </Tap>
      }
    >
      {!own && <InviteBanner plan={plan} />}
      <PlanHero plan={plan} own={own} />
      <div className="mp-tabs">
        <Segmented
          options={[
            { value: "menu", label: "Меню" },
            { value: "shop", label: "Покупки" },
            { value: "cook", label: "Готовка" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === "menu" && <MenuTab plan={plan} own={own} />}
          {tab === "shop" && <ShopTab plan={plan} />}
          {tab === "cook" && <CookTab plan={plan} />}
        </motion.div>
      </AnimatePresence>
    </Screen>
  );
}

/** Позвали в план — принять или отказаться (отмечать покупки можно после «Принять») */
function InviteBanner({ plan }: { plan: MealPlan }) {
  const uid = useUid();
  const nav = useNav();
  const members = usePlanMembers(plan.id);
  const respond = useRespondPlan();
  const people = usePeople([plan.owner_id]);
  const me = members.data?.find((m) => m.user_id === uid);
  if (me?.status !== "invited") return null;
  return (
    <motion.div className="mp-invite" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <span>
        <b>{people.get(plan.owner_id)?.first_name ?? "Друг"}</b> зовёт в общий план: меню и список покупок
      </span>
      <Tap className="chip on" onClick={() => (haptic.success(), respond.mutate({ id: plan.id, accept: true }))}>
        Принять
      </Tap>
      <Tap className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => (respond.mutate({ id: plan.id, accept: false }), nav.pop())} aria-label="Отказаться">
        <X size={15} />
      </Tap>
    </motion.div>
  );
}

// ───────────── Обложка плана

function PlanHero({ plan, own }: { plan: MealPlan; own: boolean }) {
  const nav = useNav();
  const members = usePlanMembers(plan.id);
  const ids = [plan.owner_id, ...(members.data ?? []).filter((m) => m.status === "joined").map((m) => m.user_id)];
  const people = usePeople(ids);
  const owner = people.get(plan.owner_id);
  const dishes = new Set(plan.items.map((i) => `${i.kind}:${i.ref}`)).size;
  const cooks = new Set(cookSessions(plan.items, plan.prefs.people).map((s) => s.day)).size;
  return (
    <motion.div className="mp-hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mp-hero-top">
        <div style={{ minWidth: 0 }}>
          <div className="mp-hero-kicker">
            <Sparkles size={12} /> {own ? "Твоё меню" : `Меню от ${owner?.first_name ?? "друга"}`}
          </div>
          <div className="mp-hero-title">
            {fmt(plan.start_day, "d MMM")} — {fmt(planEnd(plan), "d MMM")}
          </div>
          <div className="mp-hero-stats">
            <span>
              <b className="num">{plan.days}</b> {plan.days === 7 || plan.days === 5 ? "дней" : "дня"}
            </span>
            <span>
              <b className="num">{dishes}</b> блюд
            </span>
            <span>
              <b className="num">{cooks}</b> {cooks === 1 ? "день" : cooks > 1 && cooks < 5 ? "дня" : "дней"} у плиты
            </span>
          </div>
        </div>
        <motion.span className="mp-hero-art" animate={{ y: [0, -5, 0], rotate: [0, 3, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
          <Icon3D name="meal-plan" size={84} />
        </motion.span>
      </div>
      {plan.note && (
        <div className="mp-note">
          <Sparkles size={14} className="mp-note-ico" />
          <span>{plan.note}</span>
        </div>
      )}
      <Tap className="mp-family" scale={0.98} onClick={() => nav.sheet(<PlanShareSheet plan={plan} own={own} />)}>
        <span className="mp-avatars">
          {ids.slice(0, 4).map((u) => {
            const p = people.get(u);
            return <Avatar key={u} url={p?.avatar_url} name={p?.first_name ?? "?"} size={26} />;
          })}
        </span>
        <span className="mp-family-text">
          {ids.length > 1 ? `Общий список · ${ids.length} чел.` : own ? "Позвать семью в общий список" : "Общий план"}
        </span>
        <Users size={16} />
      </Tap>
    </motion.div>
  );
}

// ───────────── Меню по дням

function MenuTab({ plan, own }: { plan: MealPlan; own: boolean }) {
  const nav = useNav();
  const days = planDays(plan);
  const today = todayKey();
  const [day, setDay] = useState(() => (days.includes(today) ? today : days[0]));
  const goal = useGoal();
  const { map } = useDishes();
  const items = plan.items.filter((i) => i.day === day && !i.skipped);
  const share = mealsShare(plan.prefs.meals);
  const g = goal(day);
  const sum = sumItems(items);
  const eaten = items.filter((i) => i.eaten).length;
  const cooking = items.filter((i) => i.cook && !i.basic && !i.quick);
  const sessions = useMemo(() => cookSessions(plan.items, plan.prefs.people), [plan.items, plan.prefs.people]);
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector(".on")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  return (
    <>
      <div className="mp-daystrip no-scrollbar" ref={stripRef}>
        {days.map((d) => {
          const list = plan.items.filter((i) => i.day === d && !i.skipped);
          const done = list.filter((i) => i.eaten).length;
          return (
            <Tap key={d} className={`mp-day ${d === day ? "on" : ""} ${d === today ? "today" : ""} ${d < today ? "past" : ""}`} onClick={() => (haptic.select(), setDay(d))}>
              <span className="mp-day-w">{d === today ? "сегодня" : fmt(d, "EEEEEE")}</span>
              <b className="num">{fmt(d, "d")}</b>
              <span className="mp-day-dots">
                {list.slice(0, 5).map((i, k) => (
                  <i key={k} className={i.eaten ? "on" : ""} />
                ))}
                {!list.length && <i />}
                {done === list.length && list.length > 0 && <em>✓</em>}
              </span>
            </Tap>
          );
        })}
      </div>

      <motion.div key={day} className="mp-daysum" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="mp-daysum-title">{fmt(day, "EEEE, d MMMM")}</div>
          {items.length > 0 && (
            <div className="mp-daysum-eaten">
              съедено {eaten} из {items.length}
            </div>
          )}
        </div>
        <div className="mp-daysum-kcal">
          <b className="num">
            <NumberTicker value={Math.round(sum.kcal)} duration={0.5} />
          </b>
          <span> / {fmtNum(Math.round((g.kcal * share) / 10) * 10)} ккал</span>
        </div>
        <div className="mp-macros">
          {(
            [
              ["Белки", sum.protein, g.protein * share, "var(--protein)"],
              ["Жиры", sum.fat, null, "var(--fat)"],
              ["Углеводы", sum.carbs, null, "var(--carbs)"],
            ] as const
          ).map(([name, v, t, c]) => (
            <div key={name} className="mp-macro">
              <div className="mp-macro-top">
                <span>{name}</span>
                <b className="num">
                  {fmtNum(v)}
                  {t ? <small> / {fmtNum(t)}</small> : null} г
                </b>
              </div>
              <div className="mp-macro-bar">
                <motion.i initial={{ width: 0 }} animate={{ width: `${Math.min(100, t ? (v / t) * 100 : 100)}%` }} style={{ background: c }} />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {cooking.length > 0 && (
        <div className="mp-cooktoday">
          <div className="mp-cooktoday-head">
            <ChefHat size={16} /> {day === today ? "Сегодня готовим" : "В этот день готовим"}
          </div>
          {cooking.map((c) => {
            const s = sessions.find((x) => x.batch === c.batch);
            return (
              <Tap key={c.id} className="mp-cooktoday-row" scale={0.98} onClick={() => openRecipe(nav, c, s?.servings)}>
                <span>{c.emoji}</span>
                <b>{c.title}</b>
                <small className="num">
                  {s ? `${portionsText(s.servings)} порц.` : ""}
                  {s && s.eats.length > 1 ? ` · на ${s.eats.length} приёма` : ""}
                </small>
              </Tap>
            );
          })}
        </div>
      )}

      <div className="stack" style={{ gap: 10, marginTop: 10 }}>
        {plan.prefs.meals.map((m) => {
          const list = items.filter((i) => i.meal === m);
          const k = sumItems(list).kcal;
          return (
            <div key={m} className="mp-mealcard">
              <div className="mp-mealcard-head">
                <Icon3D name={MEAL_ICON[m]} size={34} />
                <b>{MEALS[m].name}</b>
                <span className="num">{list.length ? `${fmtNum(k)} ккал` : ""}</span>
              </div>
              <AnimatePresence initial={false}>
                {list.map((it) => (
                  <DishRow key={it.id} plan={plan} item={it} own={own} img={dishOfItem(map, it)?.img ?? null} />
                ))}
              </AnimatePresence>
              {!list.length && (
                <div className="mp-empty-meal">
                  {plan.prefs.skips?.includes(`${day}|${m}`) ? "🍽 Ешь не дома — по твоему пожеланию" : "Пусто — добавь блюдо или пропусти этот приём"}
                </div>
              )}
              {own && (
                <Tap
                  className="mp-add"
                  onClick={() =>
                    nav.sheet(<AddToPlan plan={plan} day={day} meal={m} kcal={Math.max(150, g.kcal * share * 0.3 - k * 0.3)} />, { full: true })
                  }
                >
                  <Plus size={15} /> Добавить блюдо
                </Tap>
              )}
            </div>
          );
        })}
      </div>

      {own && day >= today && (
        <Tap className="btn btn-block mp-regen-day" onClick={() => nav.sheet(<PlanRegenSheet plan={plan} only={[day]} />, { full: true })}>
          <Sparkles size={17} /> Пересобрать {day === today ? "сегодня" : fmt(day, "EEEE")}
        </Tap>
      )}
    </>
  );
}

function AddToPlan({ plan, day, meal, kcal }: { plan: MealPlan; day: string; meal: Meal; kcal: number }) {
  const update = useUpdatePlan(plan.id);
  const toast = useToast();
  return (
    <PlanPickerSheet
      meal={meal}
      title={`${MEALS[meal].name} · ${fmt(day, "EEEEEE d MMM")}`}
      prefs={plan.prefs}
      onPick={(dish) => {
        update.mutate({ items: addItem(plan.items, dish, day, meal, kcal) });
        haptic.success();
        toast(`Добавлено: ${dish.title}`);
      }}
    />
  );
}

export function openRecipe(nav: ReturnType<typeof useNav>, it: Pick<PlanItem, "kind" | "ref">, servings?: number) {
  haptic.tap();
  if (it.kind === "mine") nav.push(<UserRecipeScreen id={it.ref} servings={servings} />);
  else nav.push(<RecipeScreen id={it.ref} servings={servings} />);
}

function DishRow({ plan, item, own, img }: { plan: MealPlan; item: PlanItem; own: boolean; img: string | null }) {
  const nav = useNav();
  const eat = useEatItem(plan.id);
  const toast = useToast();
  const cookDay = !item.cook ? plan.items.find((i) => i.batch === item.batch && i.cook) : null;
  const batchSize = plan.items.filter((i) => i.batch === item.batch && !i.skipped).length;
  const today = todayKey();
  const toggle = () => {
    if (item.day > today) {
      haptic.warning();
      toast("Этот день ещё не наступил");
      return;
    }
    const next = !item.eaten;
    next ? haptic.success() : haptic.tap();
    eat.mutate({ item, eat: next });
    toast(next ? `Записано в дневник: +${fmtNum(item.kcal)} ккал` : "Убрано из дневника");
  };
  return (
    <motion.div layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mp-dish-wrap">
      <div className={`mp-dish ${item.eaten ? "eaten" : ""}`}>
        <Tap className="mp-dish-main" scale={0.98} onClick={() => nav.sheet(<PlanDishSheet planId={plan.id} itemId={item.id} own={own} />)}>
          <span className="mp-thumb">{img ? <img src={img} alt="" loading="lazy" /> : <span className="mp-thumb-emoji">{item.emoji}</span>}</span>
          <span className="mp-dish-text">
            <b>{item.title}</b>
            <span className="mp-dish-sub">
              <span className="num">
                {portionsText(item.portions)} порц. · {fmtNum(item.grams)} г
              </span>
              {item.locked && <Lock size={11} />}
            </span>
            <span className="mp-badges">
              {item.basic || item.quick ? (
                <span className="mp-badge quick">⚡ собрать</span>
              ) : item.cook ? (
                <span className="mp-badge cook">🔥 готовим{batchSize > 1 ? ` на ${batchSize}` : ""}</span>
              ) : (
                <span className="mp-badge left">📦 заготовка{cookDay ? ` с ${fmt(cookDay.day, "EEEEEE")}` : ""}</span>
              )}
              <span className="mp-badge p num">Б {fmtNum(item.protein)}</span>
            </span>
          </span>
          <span className="mp-dish-kcal num">
            {fmtNum(item.kcal)}
            <small>ккал</small>
          </span>
        </Tap>
        {own && (
          <Tap className={`mp-eat ${item.eaten ? "on" : ""}`} scale={0.85} onClick={toggle} aria-label={item.eaten ? "Отменить «съел»" : "Съел"}>
            <AnimatePresence initial={false}>
              {item.eaten ? (
                <motion.span key="on" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
                  <Check size={17} strokeWidth={3} />
                </motion.span>
              ) : (
                <motion.span key="off" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Plus size={17} strokeWidth={2.6} />
                </motion.span>
              )}
            </AnimatePresence>
          </Tap>
        )}
      </div>
    </motion.div>
  );
}

// ───────────── Список покупок

function ShopTab({ plan }: { plan: MealPlan }) {
  const { map, dict } = useDishes();
  const marks = useShopMarks(plan.id);
  const setMark = useSetMark(plan.id);
  const delMark = useDeleteMark(plan.id);
  const reset = useResetMarks(plan.id);
  const toast = useToast();
  const uid = useUid();
  const [text, setText] = useState("");
  const [showPantry, setShowPantry] = useState(false);
  const [showDone, setShowDone] = useState(true);

  const lines = useMemo(
    () => (map && dict ? shoppingList(plan.items, (it) => dishOfItem(map, it), dict, plan.prefs.people) : []),
    [map, dict, plan.items, plan.prefs.people],
  );
  const byKey = useMemo(() => new Map((marks.data ?? []).map((m) => [m.key, m])), [marks.data]);
  const custom = (marks.data ?? []).filter((m) => m.custom);
  const buyable = lines.filter((l) => l.dept !== "pantry");
  const pantry = lines.filter((l) => l.dept === "pantry");
  const isDone = (k: string) => !!byKey.get(k)?.checked;
  const isHave = (k: string) => !!byKey.get(k)?.have;
  const todo = buyable.filter((l) => !isDone(l.key) && !isHave(l.key));
  const doneList = buyable.filter((l) => isDone(l.key) && !isHave(l.key));
  const haveList = buyable.filter((l) => isHave(l.key));
  const total = buyable.length + custom.length;
  const got = doneList.length + haveList.length + custom.filter((m) => m.checked).length;
  const byUsers = usePeople([...new Set((marks.data ?? []).map((m) => m.by_user).filter((x): x is string => !!x && x !== uid))]);

  const toggle = (key: string) => {
    const on = !isDone(key);
    on ? haptic.success() : haptic.tap();
    setMark.mutate({ key, checked: on });
  };
  const have = (key: string) => {
    haptic.select();
    const on = !isHave(key);
    setMark.mutate({ key, have: on, checked: false });
    if (on) toast("Отмечено: есть дома");
  };
  const addCustom = () => {
    const name = text.trim();
    if (!name) return;
    haptic.success();
    setMark.mutate({ key: `x:${Date.now().toString(36)}`, custom: { name: name.slice(0, 80) } });
    setText("");
  };

  const shareText = () => {
    const out = [`🛒 Список покупок · ${fmt(plan.start_day, "d MMM")} — ${fmt(planEnd(plan), "d MMM")}`, ""];
    for (const d of DEPTS.filter((x) => x.id !== "pantry")) {
      const ls = todo.filter((l) => l.dept === d.id);
      if (!ls.length) continue;
      out.push(`${d.emoji} ${d.name}`);
      for (const l of ls) {
        const q = qtyText(l);
        out.push(`▫️ ${l.name} — ${q.main}${q.sub ? ` (${q.sub})` : ""}`);
      }
      out.push("");
    }
    const c = custom.filter((m) => !m.checked);
    if (c.length) out.push("✍️ Своё", ...c.map((m) => `▫️ ${m.custom!.name}`), "");
    out.push("Составлено в Emli");
    return out.join("\n");
  };
  const share = async () => {
    haptic.tap();
    const t = shareText();
    try {
      if (navigator.share) {
        await navigator.share({ text: t });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(t);
      toast("Список скопирован — вставь в любой чат");
    } catch {
      if (tg) tg.openTelegramLink?.(`https://t.me/share/url?url=${encodeURIComponent("https://t.me/myemli_bot")}&text=${encodeURIComponent(t)}`);
    }
  };

  if (!map || !dict) return <div className="skeleton" style={{ height: 300, borderRadius: 24, marginTop: 12 }} />;

  return (
    <>
      <div className="mp-shophead">
        <div className="mp-shophead-top">
          <Icon3D name="favorite-foods" size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b className="num">
              {got === total && total > 0 ? "Всё куплено! 🎉" : `Куплено ${got} из ${total}`}
            </b>
            <small>
              {byUsers.size ? `Отмечаете вместе с ${[...byUsers.values()].map((p) => p.first_name).join(", ")}` : `На ${plan.days} ${plan.days === 7 || plan.days === 5 ? "дней" : "дня"}${plan.prefs.people > 1 ? ` · на ${plan.prefs.people} чел.` : ""}`}
            </small>
          </div>
          <Tap className="icon-btn" onClick={share} aria-label="Поделиться списком">
            <Share2 size={18} />
          </Tap>
        </div>
        <div className="mp-progress">
          <motion.i animate={{ width: `${total ? (got / total) * 100 : 0}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
        </div>
      </div>

      <form
        className="mp-addrow"
        onSubmit={(e) => {
          e.preventDefault();
          addCustom();
        }}
      >
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Добавить своё: хлеб, кофе, губки…" enterKeyHint="done" />
        <Tap type="submit" className="icon-btn" disabled={!text.trim()} aria-label="Добавить">
          <Plus size={20} />
        </Tap>
      </form>

      {custom.length > 0 && (
        <ShopGroup emoji="✍️" name="Своё" count={custom.filter((m) => !m.checked).length}>
          {custom.map((m) => (
            <ShopRow
              key={m.key}
              name={m.custom!.name}
              done={m.checked}
              onToggle={() => toggle(m.key)}
              onRemove={() => (haptic.rigid(), delMark.mutate(m.key))}
              by={m.checked && m.by_user && m.by_user !== uid ? byUsers.get(m.by_user)?.first_name : undefined}
            />
          ))}
        </ShopGroup>
      )}

      {DEPTS.filter((d) => d.id !== "pantry").map((d) => {
        const ls = todo.filter((l) => l.dept === d.id);
        if (!ls.length) return null;
        return (
          <ShopGroup key={d.id} emoji={d.emoji} name={d.name} count={ls.length}>
            <AnimatePresence initial={false}>
              {ls.map((l) => (
                <ShopRow key={l.key} line={l} done={false} onToggle={() => toggle(l.key)} onHave={() => have(l.key)} />
              ))}
            </AnimatePresence>
          </ShopGroup>
        );
      })}

      {!todo.length && total > 0 && (
        <motion.div className="mp-allset" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <span>🎉</span>
          <b>Всё для меню куплено</b>
          <small>Можно готовить по плану</small>
        </motion.div>
      )}

      {pantry.length > 0 && (
        <div className="mp-pantry">
          <Tap className="mp-pantry-head" onClick={() => (haptic.select(), setShowPantry((v) => !v))}>
            <span>🧂</span>
            <span style={{ flex: 1 }}>
              <b>Проверь, есть ли дома</b>
              <small>Соль, специи, масло — {pantry.length} поз.</small>
            </span>
            <span className="mp-chevron" style={{ transform: showPantry ? "rotate(90deg)" : undefined }}>
              ›
            </span>
          </Tap>
          <AnimatePresence initial={false}>
            {showPantry && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
                {pantry.map((l) => (
                  <ShopRow key={l.key} line={l} done={isDone(l.key)} onToggle={() => toggle(l.key)} compact />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {(doneList.length > 0 || haveList.length > 0) && (
        <div className="mp-donebox">
          <Tap className="mp-done-head" onClick={() => (haptic.select(), setShowDone((v) => !v))}>
            <Check size={15} /> Куплено и есть дома · {doneList.length + haveList.length}
            <span className="mp-chevron" style={{ marginLeft: "auto", transform: showDone ? "rotate(90deg)" : undefined }}>
              ›
            </span>
          </Tap>
          <AnimatePresence initial={false}>
            {showDone && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
                {doneList.map((l) => (
                  <ShopRow
                    key={l.key}
                    line={l}
                    done
                    onToggle={() => toggle(l.key)}
                    by={(() => {
                      const b = byKey.get(l.key)?.by_user;
                      return b && b !== uid ? byUsers.get(b)?.first_name : undefined;
                    })()}
                  />
                ))}
                {haveList.map((l) => (
                  <ShopRow key={l.key} line={l} done home onToggle={() => have(l.key)} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {doneList.length > 0 && (
            <Tap className="mp-reset" onClick={() => (haptic.tap(), reset.mutate())}>
              <RotateCcw size={14} /> Снять отметки — новый поход в магазин
            </Tap>
          )}
        </div>
      )}
    </>
  );
}

function ShopGroup({ emoji, name, count, children }: { emoji: string; name: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mp-group">
      <div className="mp-group-head">
        <span>{emoji}</span> {name}
        <span className="mp-group-count num">{count}</span>
      </div>
      <div className="mp-group-body">{children}</div>
    </div>
  );
}

function ShopRow({
  line,
  name,
  done,
  home,
  compact,
  by,
  onToggle,
  onHave,
  onRemove,
}: {
  line?: ShopLine;
  name?: string;
  done: boolean;
  home?: boolean;
  compact?: boolean;
  by?: string;
  onToggle: () => void;
  onHave?: () => void;
  onRemove?: () => void;
}) {
  const q = line && !compact ? qtyText(line) : null;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
      className={`mp-shop ${done ? "done" : ""}`}
    >
      <button className="mp-shop-main press" onClick={onToggle}>
        <span className={`mp-box ${done ? "on" : ""}`}>
          {done && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
              {home ? <Home size={12} strokeWidth={3} /> : <Check size={13} strokeWidth={3.2} />}
            </motion.span>
          )}
        </span>
        <span className="mp-shop-text">
          <b>{line?.name ?? name}</b>
          {line && !compact && line.uses.length > 0 && <small>{home ? "есть дома" : by ? `отметил(а) ${by}` : line.uses.slice(0, 2).join(" · ") + (line.uses.length > 2 ? ` +${line.uses.length - 2}` : "")}</small>}
          {!line && by && <small>отметил(а) {by}</small>}
        </span>
        {q && (
          <span className="mp-qty num">
            <b>{q.main}</b>
            {q.sub && <small>{q.sub}</small>}
          </span>
        )}
      </button>
      {onHave && !done && (
        <Tap className="mp-shop-side" scale={0.85} onClick={onHave} aria-label="Есть дома">
          <Home size={15} />
        </Tap>
      )}
      {onRemove && (
        <Tap className="mp-shop-side" scale={0.85} onClick={onRemove} aria-label="Удалить">
          <X size={15} />
        </Tap>
      )}
    </motion.div>
  );
}

// ───────────── Готовка

function CookTab({ plan }: { plan: MealPlan }) {
  const nav = useNav();
  const { map } = useDishes();
  const sessions = useMemo(() => cookSessions(plan.items, plan.prefs.people), [plan.items, plan.prefs.people]);
  const today = todayKey();
  const minutes = sessions.reduce((a, s) => a + (dishOfItem(map, s.item)?.time ?? 0), 0);
  const quick = plan.items.filter((i) => (i.basic || i.quick) && !i.skipped).length;
  if (!sessions.length) {
    return (
      <div className="mp-cook-empty">
        <Icon3D name="snacks" size={64} />
        <b>Готовить не нужно</b>
        <small>Все блюда плана собираются из продуктов за пару минут</small>
      </div>
    );
  }
  const days = [...new Set(sessions.map((s) => s.day))];
  return (
    <>
      <div className="mp-cooksum">
        <div>
          <b className="num">{sessions.length}</b>
          <small>{sessions.length === 1 ? "блюдо готовим" : "блюд готовим"}</small>
        </div>
        <div>
          <b className="num">≈ {minutes >= 60 ? `${fmtNum(minutes / 60, 1)} ч` : `${minutes} мин`}</b>
          <small>у плиты за план</small>
        </div>
        <div>
          <b className="num">{quick}</b>
          <small>быстрых сборок</small>
        </div>
      </div>
      {days.map((d) => (
        <div key={d} className={`mp-cookday ${d < today ? "past" : ""}`}>
          <div className="mp-cookday-head">
            {d === today ? <span className="mp-today-pill">Сегодня</span> : null}
            {fmt(d, "EEEE, d MMMM")}
          </div>
          {sessions
            .filter((s) => s.day === d)
            .map((s) => (
              <CookCard key={s.batch} s={s} img={dishOfItem(map, s.item)?.img ?? null} time={dishOfItem(map, s.item)?.time ?? null} people={plan.prefs.people} onOpen={() => openRecipe(nav, s.item, s.servings)} />
            ))}
          {d >= today &&
            sessions.some((s) => s.day === d && (dishOfItem(map, s.item)?.flags ?? []).some((f) => ["meat", "poultry", "beef", "pork", "fish", "seafood"].includes(f))) && (
              <div className="mp-cook-tip">
                <Snowflake size={12} /> Мясо или рыба замороженные — переложи в холодильник {d === today ? "прямо сейчас" : "накануне вечером"}
              </div>
            )}
        </div>
      ))}
    </>
  );
}

function CookCard({ s, img, time, people, onOpen }: { s: CookSession; img: string | null; time: number | null; people: number; onOpen: () => void }) {
  const eatsText = s.eats.map((e) => `${fmt(e.day, "EEEEEE")} ${MEALS[e.meal].name.toLowerCase()}`);
  return (
    <Tap className="mp-cookcard" scale={0.98} onClick={onOpen}>
      <span className="mp-cook-img">{img ? <img src={img} alt="" loading="lazy" /> : <span className="mp-thumb-emoji">{s.item.emoji}</span>}</span>
      <span className="mp-cook-body">
        <b>{s.item.title}</b>
        <span className="mp-cook-meta num">
          <span>
            <ShoppingBasket size={12} /> {portionsText(s.servings)} порц.{people > 1 ? " на всех" : ""}
          </span>
          {time ? (
            <span>
              <Clock size={12} /> {time} мин
            </span>
          ) : null}
        </span>
        {s.eats.length > 1 && <span className="mp-cook-eats">Хватит на: {eatsText.join(" · ")}</span>}
      </span>
    </Tap>
  );
}

// ───────────── Нет плана: приглашение, общие планы, прошлые планы

function PlanLanding() {
  const nav = useNav();
  const shared = useSharedPlans();
  const mine = useMyPlans();
  const create = useCreatePlan();
  const toast = useToast();
  const joined = (shared.data ?? []).filter((s) => s.status === "joined" && planEnd(s.plan) >= todayKey());
  const invited = (shared.data ?? []).filter((s) => s.status === "invited");
  const past = (mine.data ?? []).slice(0, 5);
  const start = () => nav.sheet(<PlanSetupSheet onDone={(p) => nav.push(<MealPlanScreen id={p.id} />)} />, { full: true });
  const repeat = async (p: MealPlan) => {
    haptic.medium();
    const shift = (d: string) => shiftKey(todayKey(), planDays(p).indexOf(d));
    const plan = await create.mutateAsync({
      start_day: todayKey(),
      days: p.days,
      prefs: { ...p.prefs, start: todayKey() },
      items: p.items.map((i) => ({ ...i, day: shift(i.day), eaten: false, entry: undefined })),
      note: p.note,
    });
    toast("План повторён с сегодняшнего дня");
    nav.push(<MealPlanScreen id={plan.id} />);
  };
  return (
    <>
      <motion.div className="mp-landing" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <motion.div className="mp-landing-art" animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
          <Icon3D name="meal-plan" size={120} />
          <span className="mp-landing-badge">
            <Sparkles size={12} /> ИИ
          </span>
        </motion.div>
        <h2>Меню на неделю — за минуту</h2>
        <p>Скажи, что любишь и сколько времени готов готовить. ИИ подберёт блюда, я посчитаю порции под твою норму и соберу список покупок.</p>
        <div className="mp-benefits">
          {[
            ["🍽", "Блюда из базы Emli", "173 рецепта и простые блюда из продуктов"],
            ["📦", "Готовишь реже", "Заготовки на 2–3 дня вместо плиты каждый день"],
            ["🛒", "Общий список покупок", "По отделам, в штуках и пачках — отмечайте вдвоём"],
            ["✅", "В дневник в одно касание", "Съел по плану — нажал галочку"],
          ].map(([e, t, s], i) => (
            <motion.div key={t} className="mp-benefit" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.07 }}>
              <span>{e}</span>
              <span>
                <b>{t}</b>
                <small>{s}</small>
              </span>
            </motion.div>
          ))}
        </div>
        <Tap className="btn btn-accent btn-block mp-go" onClick={() => (haptic.medium(), start())}>
          <Sparkles size={18} /> Составить план
        </Tap>
      </motion.div>

      {(invited.length > 0 || joined.length > 0) && (
        <>
          <div className="section-title">Со мной поделились</div>
          <div className="stack" style={{ gap: 8 }}>
            {[...invited, ...joined].map((s) => (
              <SharedCard key={s.plan.id} plan={s.plan} invited={s.status === "invited"} />
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <div className="section-title">Прошлые планы</div>
          <div className="card list" style={{ padding: 0 }}>
            {past.map((p) => (
              <div key={p.id} className="list-item">
                <Icon3D name="calendar" size={34} />
                <Tap className="press" style={{ flex: 1, minWidth: 0, textAlign: "left" }} onClick={() => nav.push(<MealPlanScreen id={p.id} />)}>
                  <b>
                    {fmt(p.start_day, "d MMM")} — {fmt(planEnd(p), "d MMM")}
                  </b>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {p.days} дн. · {new Set(p.items.map((i) => i.ref)).size} блюд
                  </div>
                </Tap>
                <Tap className="chip" disabled={create.isPending} onClick={() => repeat(p)}>
                  Повторить
                </Tap>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function SharedCard({ plan, invited }: { plan: MealPlan; invited: boolean }) {
  const nav = useNav();
  const people = usePeople([plan.owner_id]);
  const owner = people.get(plan.owner_id);
  return (
    <Tap className="mp-shared" scale={0.98} onClick={() => nav.push(<MealPlanScreen id={plan.id} tab="shop" />)}>
      <Avatar url={owner?.avatar_url} name={owner?.first_name ?? "?"} size={44} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>{owner?.first_name ?? "Друг"}: меню и покупки</b>
        <small>
          {fmt(plan.start_day, "d MMM")} — {fmt(planEnd(plan), "d MMM")}
          {invited ? " · приглашение" : ""}
        </small>
      </span>
      <ShoppingBasket size={18} />
    </Tap>
  );
}

