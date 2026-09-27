import { useMemo, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { Bookmark, CalendarDays, Plus, ScanBarcode, X } from "lucide-react";
import { useDay } from "@/state/day";
import { useNav } from "@/nav/Nav";
import { useDayTargets, useEntries, useProfile, useTotals, useDeleteEntry } from "@/data/api";
import { useInsights } from "@/data/insights";
import { dayTitle, fmt, fromKey, shiftKey, toKey, todayKey, weekStart, WEEKDAYS_SHORT } from "@/lib/dates";
import { MEALS, sumMacros, fmtNum } from "@/lib/nutrition";
import type { DayTarget } from "@/lib/cheat";
import type { Entry, Macros, Meal } from "@/lib/types";
import { haptic } from "@/lib/telegram";
import { Rings } from "@/ui/Rings";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { AddFoodSheet } from "@/sheets/AddFood";
import { FoodDetailSheet } from "@/sheets/FoodDetail";
import { CalendarSheet } from "@/sheets/Calendar";
import { ScannerSheet } from "@/sheets/Scanner";
import { QuickAddSheet } from "@/sheets/QuickAdd";
import { CheatMealSheet } from "@/sheets/CheatMeal";
import { useToast } from "@/ui/Toast";
import { HeaderAvatar } from "@/ui/HeaderAvatar";
import { SaveTemplateSheet } from "@/sheets/SaveTemplate";
import { RecipesScreen } from "./Recipes";
import { WorkoutDetailScreen } from "./WorkoutDetail";
import { useWorkouts } from "@/data/workouts";
import { useMealTemplates, useRecipes } from "@/data/engage";
import { useHomeScreen } from "@/lib/homescreen";
import { fmtDuration } from "@/state/workout";
import { CheckinCard, DayCompleteness } from "@/ui/Checkin";
import "./diary.css";
import { Icon3D, MEAL_ICON } from "@/ui/Icon3D";

/** Какую долю дневной нормы обычно занимает приём пищи — для полоски у каждого приёма */
const MEAL_SHARE = [0.25, 0.35, 0.3, 0.1];
const MEAL_STYLE = [
  "linear-gradient(135deg, #ffc27a, #ff7a5c)",
  "linear-gradient(135deg, #6fe7ac, #22b573)",
  "linear-gradient(135deg, #9aa6ff, #6b5cff)",
  "linear-gradient(135deg, #ff9fc0, #ff5e7e)",
];

function greeting(name?: string) {
  const h = new Date().getHours();
  const g = h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
  return name ? `${g}, ${name}` : g;
}

export function DiaryPage() {
  const { day, setDay } = useDay();
  const nav = useNav();
  const entries = useEntries(day);
  const targets = useDayTargets();
  const profile = useProfile();
  const ins = useInsights();
  const target = targets.forDay(day);
  const sum = useMemo(() => sumMacros(entries.data ?? []), [entries.data]);
  const isToday = day === todayKey();

  return (
    <div className="page diary">
      <div className="page-head" style={{ alignItems: "flex-end" }}>
        <div style={{ minWidth: 0 }}>
          <div className="muted diary-greet">{isToday ? greeting(profile.data?.first_name) : fmt(day, "EEEE")}</div>
          <div key={day} className="page-title diary-title">
            {dayTitle(day)}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {ins.streak > 1 && (
            <span className="streak-pill">
              <Icon3D name="streak" size={20} className="streak-flame" /> {ins.streak}
            </span>
          )}
          <Tap className="icon-btn" onClick={() => nav.sheet(<CalendarSheet />, { full: true })} aria-label="Календарь">
            <CalendarDays size={20} />
          </Tap>
          <HeaderAvatar />
        </div>
      </div>

      <WeekStrip forDay={targets.forDay} />

      {!isToday && (
        <button className="back-today tap" onClick={() => setDay(todayKey())}>
          ← вернуться к сегодня
        </button>
      )}

      <Hero sum={sum} target={target} loading={entries.isLoading || entries.isPlaceholderData || targets.loading} />

      <DayBanner target={target} day={day} />

      {isToday && <CheckinCard />}

      <DayWorkouts day={day} />

      {/* Пока грузится выбранный день, записи прошлого дня приглушены и не нажимаются */}
      <div className={`stack ${entries.isPlaceholderData ? "diary-stale" : ""}`} style={{ marginTop: 14 }} aria-busy={entries.isPlaceholderData}>
        {MEALS.map((m, i) => (
          <MealCard
            key={m.id}
            meal={m.id as Meal}
            entries={(entries.data ?? []).filter((e) => e.meal === m.id)}
            index={i}
            budget={target.calories * MEAL_SHARE[i]}
          />
        ))}
      </div>

      <DayCompleteness day={day} kcal={sum.kcal} entries={entries.data?.length ?? 0} target={target.calories} />

      <div className="row" style={{ marginTop: 16, gap: 10 }}>
        <Tap className="btn btn-block add-food" onClick={() => nav.sheet(<AddFoodSheet />, { full: true })}>
          <Plus size={20} /> Добавить еду
        </Tap>
        <Tap className="icon-btn" style={{ width: 54, height: 54 }} onClick={() => nav.sheet(<ScannerSheet />, { full: true })} aria-label="Сканировать">
          <ScanBarcode size={22} />
        </Tap>
      </div>

      <DiaryExtras />
    </div>
  );
}

// ───────────────────────── Тренировки дня: сожжённые калории (только для информации)

function DayWorkouts({ day }: { day: string }) {
  const nav = useNav();
  const workouts = useWorkouts();
  const list = (workouts.data ?? []).filter((w) => toKey(new Date(w.started_at)) === day);
  if (!list.length) return null;
  const kcal = list.reduce((a, w) => a + w.kcal, 0);
  return (
    <button
      className="day-workout press"
      onClick={() => (list.length === 1 ? nav.push(<WorkoutDetailScreen id={list[0].id} />) : nav.setTab("workouts"))}
    >
      <span className="day-workout-ico"><Icon3D name="workouts" size={34} /></span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <b>{list.length === 1 ? list[0].name : `${list.length} тренировки`}</b>
        <div className="day-banner-sub">
          {fmtDuration(list.reduce((a, w) => a + w.duration_s, 0))} · сожжено ≈ {fmtNum(kcal)} ккал · не прибавляется к норме
        </div>
      </span>
      <span className="day-workout-kcal num">
        🔥{fmtNum(kcal)}
      </span>
    </button>
  );
}

// ───────────────────────── Рецепты, мои приёмы, иконка на экран

function DiaryExtras() {
  const nav = useNav();
  const recipes = useRecipes();
  const templates = useMealTemplates();
  const home = useHomeScreen();
  const [hint, setHint] = useState(() => {
    try {
      const n = Number(localStorage.getItem("emli-opens") ?? 0) + 1;
      localStorage.setItem("emli-opens", String(n));
      return n >= 3 && !localStorage.getItem("emli-home-hint");
    } catch {
      return false;
    }
  });
  const hideHint = () => {
    setHint(false);
    try {
      localStorage.setItem("emli-home-hint", "1");
    } catch {
      /* ничего */
    }
  };
  const tpl = templates.data?.length ?? 0;
  return (
    <>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <Tap className="diary-tile" scale={0.97} onClick={() => nav.push(<RecipesScreen />)}>
          <span className="diary-tile-ico"><Icon3D name="recipes" size={40} /></span>
          <span>
            <b>Рецепты</b>
            <small>{recipes.data ? `${recipes.data.length} блюд с КБЖУ` : "Блюда с КБЖУ"}</small>
          </span>
        </Tap>
        <Tap className="diary-tile" scale={0.97} onClick={() => nav.sheet(<AddFoodSheet tab="mine" />, { full: true })}>
          <span className="diary-tile-ico"><Icon3D name="meal-plan" size={40} /></span>
          <span>
            <b>Мои приёмы</b>
            <small>{tpl ? `Сохранено: ${tpl}` : "Набор еды в 1 тап"}</small>
          </span>
        </Tap>
      </div>
      {hint && (home.status === "missed" || home.status === "unknown") && (
        <div className="home-hint">
          <span style={{ fontSize: 26 }}>📲</span>
          <button className="press" style={{ flex: 1, textAlign: "left" }} onClick={() => (home.add(), hideHint())}>
            <b>Emli на главный экран</b>
            <div className="day-banner-sub">Открывай в одно касание, как обычное приложение</div>
          </button>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={hideHint} aria-label="Скрыть">
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}

// ───────────────────────── Лента недели

function WeekStrip({ forDay }: { forDay: (d: string) => DayTarget }) {
  const { day, setDay } = useDay();
  const totals = useTotals();
  const start = weekStart(day);
  const [dir, setDir] = useState(0);
  const today = todayKey();

  const days = Array.from({ length: 7 }, (_, i) => shiftKey(start, i));
  const byDay = new Map((totals.data ?? []).map((t) => [t.day, t]));

  const shiftWeek = (n: number) => {
    setDir(n);
    haptic.select();
    setDay(shiftKey(day, n * 7));
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -400) shiftWeek(1);
    else if (info.offset.x > 50 || info.velocity.x > 400) shiftWeek(-1);
  };

  return (
    <div className="week-wrap">
      <AnimatePresence initial={false} custom={dir} mode="popLayout">
        <motion.div
          key={start}
          className="week"
          custom={dir}
          variants={{
            enter: (d: number) => ({ x: d > 0 ? "60%" : "-60%", opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit: (d: number) => ({ x: d > 0 ? "-60%" : "60%", opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.25}
          onDragEnd={onDragEnd}
        >
          {days.map((d, i) => {
            const t = byDay.get(d);
            const target = forDay(d);
            const ratio = t && target.calories ? Math.min(t.kcal / target.calories, 1) : 0;
            const over = !!t && t.kcal > target.calories * 1.1;
            const on = d === day;
            const cheat = target.adjust.some((a) => a.kind === "cheat");
            const saving = target.adjust.some((a) => a.kind === "save");
            return (
              <button
                key={d}
                className={`wday ${on ? "on" : ""} ${d > today ? "future" : ""} ${cheat ? "cheat" : ""} ${saving ? "saving" : ""}`}
                onClick={() => {
                  if (!on) haptic.select();
                  setDay(d);
                }}
              >
                <span className="wday-name">{cheat ? "🍕" : WEEKDAYS_SHORT[i]}</span>
                <span className="wday-circle">
                  <svg viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r="20" className="wday-track" />
                    <circle
                      cx="22"
                      cy="22"
                      r="20"
                      className="wday-progress"
                      style={{
                        strokeDasharray: `${ratio * 125.66} 125.66`,
                        opacity: ratio > 0.01 ? 1 : 0,
                        stroke: over ? "var(--fat)" : undefined,
                      }}
                    />
                  </svg>
                  <span className="wday-num num">{fromKey(d).getDate()}</span>
                </span>
                <span className={`wday-today ${d === today ? "show" : ""}`} />
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────── Главная карточка дня

function Hero({ sum, target, loading }: { sum: Macros; target: DayTarget; loading: boolean }) {
  const [mode, setMode] = useState<"left" | "eaten">("left");
  const left = target.calories - sum.kcal;
  const over = left < 0;
  const cheat = target.adjust.some((a) => a.kind === "cheat");

  const macros = [
    { key: "protein", label: "Белки", color: "var(--protein)", value: sum.protein, max: target.protein },
    { key: "fat", label: "Жиры", color: "var(--fat)", value: sum.fat, max: target.fat },
    { key: "carbs", label: "Углеводы", color: "var(--carbs)", value: sum.carbs, max: target.carbs },
  ] as const;

  return (
    <div className={`hero ${cheat ? "is-cheat" : ""}`}>
      <div className="hero-glow" />
      <button
        className="hero-ring tap"
        style={{ ["--tap-scale" as string]: 0.97 }}
        onClick={() => {
          haptic.tap();
          setMode((m) => (m === "left" ? "eaten" : "left"));
        }}
      >
        <Rings
          size={214}
          stroke={12}
          gap={5}
          rings={[
            {
              value: loading ? 0 : sum.kcal,
              max: target.calories,
              color: cheat ? "#ffc247" : "var(--kcal)",
              color2: cheat ? "#ff5e7e" : "var(--kcal-2)",
            },
            ...macros.map((m) => ({ value: loading ? 0 : m.value, max: m.max, color: m.color })),
          ]}
        >
          <div>
            <div className="hero-big">
              <NumberTicker value={Math.round(mode === "left" ? Math.abs(left) : sum.kcal)} />
            </div>
            <div key={mode + String(over)} className="hero-caption" style={{ color: mode === "left" && over ? "var(--danger)" : undefined }}>
              {mode === "eaten" ? "ккал съедено" : over ? "ккал сверх нормы" : "ккал осталось"}
            </div>
          </div>
        </Rings>
      </button>

      <div className="hero-sub">
        <span>
          <b className="num">{fmtNum(sum.kcal)}</b> съедено
        </span>
        <span className="hero-dot" />
        <span>
          <b className="num">{fmtNum(target.calories)}</b> цель
          {target.calories !== target.base.calories && (
            <em className="num">
              {" "}
              ({target.calories > target.base.calories ? "+" : "−"}
              {fmtNum(Math.abs(target.calories - target.base.calories))})
            </em>
          )}
        </span>
      </div>

      <div className="hero-macros">
        {macros.map((m) => {
          const ratio = m.max ? Math.min(m.value / m.max, 1) : 0;
          const leftG = Math.max(m.max - m.value, 0);
          return (
            <div key={m.key} className="macro-pill">
              <svg viewBox="0 0 36 36" className="macro-ring">
                <circle cx="18" cy="18" r="15" fill="none" stroke={m.color} strokeOpacity="0.18" strokeWidth="4" />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke={m.color}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${ratio * 94.25} 94.25`}
                  transform="rotate(-90 18 18)"
                  style={{ transition: "stroke-dasharray .9s cubic-bezier(.16,1,.3,1)", opacity: ratio > 0.01 ? 1 : 0 }}
                />
              </svg>
              <div style={{ minWidth: 0 }}>
                <div className="macro-label">{m.label}</div>
                <div className="macro-val num">
                  {mode === "left" ? fmtNum(leftG) : fmtNum(m.value)}
                  <span> {mode === "left" ? "г ост." : `/ ${m.max} г`}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── Баннер читмила

function DayBanner({ target, day }: { target: DayTarget; day: string }) {
  const nav = useNav();
  const cheat = target.adjust.find((a) => a.kind === "cheat");
  const save = target.adjust.find((a) => a.kind === "save");
  if (!cheat && !save) return null;
  const plan = (cheat ?? save)!.plan;
  const isToday = day === todayKey();
  return (
    <button className={`day-banner press ${cheat ? "cheat" : "save"}`} onClick={() => nav.sheet(<CheatMealSheet plan={plan} />, { full: true })}>
      <span className="day-banner-emoji">{cheat ? "🍕" : "💪"}</span>
      <span style={{ flex: 1, textAlign: "left" }}>
        {cheat ? (
          <>
            <b>{isToday ? "Сегодня читмил!" : "Читмил"}</b> {plan.title ? `· ${plan.title}` : ""}
            <div className="day-banner-sub">Можно на {fmtNum(cheat.delta)} ккал больше обычного — наслаждайся</div>
          </>
        ) : (
          <>
            <b>Копим на читмил</b> · {fmt(plan.day, "EEEEEE, d MMM")}
            <div className="day-banner-sub">
              {isToday ? "Сегодня" : "В этот день"} норма меньше на {fmtNum(-save!.delta)} ккал
            </div>
          </>
        )}
      </span>
    </button>
  );
}

// ───────────────────────── Приёмы пищи

function MealCard({ meal, entries, index, budget }: { meal: Meal; entries: Entry[]; index: number; budget: number }) {
  const nav = useNav();
  const info = MEALS[meal];
  const total = sumMacros(entries);
  const ratio = budget > 0 ? Math.min(total.kcal / budget, 1) : 0;
  return (
    <div className={`card meal ${entries.length ? "" : "empty-meal"}`} style={{ animationDelay: `${index * 50}ms` }}>
      <div className="meal-head">
        <span className="meal-icon meal-icon-3d">
          <Icon3D name={MEAL_ICON[meal]} size={40} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
            <span className="meal-name">{info.name}</span>
            {entries.length > 0 && <span className="meal-kcal num"><NumberTicker value={Math.round(total.kcal)} duration={0.5} /> ккал</span>}
          </div>
          {entries.length ? (
            <div className="meal-bar">
              <i style={{ width: `${ratio * 100}%`, background: MEAL_STYLE[meal] }} />
            </div>
          ) : (
            <div className="meal-sub">≈ {fmtNum(Math.round(budget / 10) * 10)} ккал по плану</div>
          )}
        </div>
        {entries.length > 0 && (
          <Tap
            className="meal-save"
            scale={0.85}
            onClick={() => {
              haptic.tap();
              nav.sheet(<SaveTemplateSheet entries={entries.filter((e) => !e.id.startsWith("temp-"))} meal={meal} />);
            }}
            aria-label="Сохранить как мой приём"
          >
            <Bookmark size={17} />
          </Tap>
        )}
        <Tap
          className="meal-add"
          scale={0.85}
          onClick={() => {
            haptic.tap();
            nav.sheet(<AddFoodSheet meal={meal} />, { full: true });
          }}
          aria-label={`Добавить в ${info.name}`}
        >
          <Plus size={20} strokeWidth={2.4} />
        </Tap>
      </div>
      <AnimatePresence initial={false}>
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const nav = useNav();
  const del = useDeleteEntry();
  const toast = useToast();
  const pending = entry.id.startsWith("temp-");

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -110 || info.velocity.x < -700) {
      haptic.rigid();
      del.mutate({ id: entry.id, day: entry.day });
      toast("Удалено");
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.22 } }}
      className="entry-wrap"
    >
      <div className="entry-delete">Удалить</div>
      <motion.button
        className="entry press"
        drag={pending ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0.05 }}
        dragDirectionLock
        onDragEnd={onDragEnd}
        onClick={() => {
          if (pending) return;
          nav.sheet(entry.grams ? <FoodDetailSheet entry={entry} /> : <QuickAddSheet entry={entry} />);
        }}
        style={{ opacity: pending ? 0.6 : 1 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="entry-name">{entry.name}</div>
          <div className="entry-sub">
            {entry.grams ? <span className="entry-g">{fmtNum(entry.grams)} г</span> : null}
            <span style={{ color: "var(--protein)" }}>Б {fmtNum(entry.protein)}</span>
            <span style={{ color: "var(--fat)" }}>Ж {fmtNum(entry.fat)}</span>
            <span style={{ color: "var(--carbs)" }}>У {fmtNum(entry.carbs)}</span>
          </div>
        </div>
        <div className="entry-kcal num">
          {fmtNum(entry.kcal)}
          <small>ккал</small>
        </div>
      </motion.button>
    </motion.div>
  );
}
