import { useMemo, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { CalendarDays, Plus, ScanBarcode } from "lucide-react";
import { useDay } from "@/state/day";
import { useNav } from "@/nav/Nav";
import { useEntries, useTargets, useTotals, useDeleteEntry } from "@/data/api";
import { dayTitle, fmt, fromKey, shiftKey, todayKey, weekStart, WEEKDAYS_SHORT } from "@/lib/dates";
import { MEALS, sumMacros, targetFor, fmtNum } from "@/lib/nutrition";
import type { Entry, Meal, Targets } from "@/lib/types";
import { haptic } from "@/lib/telegram";
import { Rings, Bar } from "@/ui/Rings";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { AddFoodSheet } from "@/sheets/AddFood";
import { FoodDetailSheet } from "@/sheets/FoodDetail";
import { CalendarSheet } from "@/sheets/Calendar";
import { ScannerSheet } from "@/sheets/Scanner";
import { QuickAddSheet } from "@/sheets/QuickAdd";
import { useToast } from "@/ui/Toast";
import "./diary.css";

export function DiaryPage() {
  const { day, setDay } = useDay();
  const nav = useNav();
  const entries = useEntries(day);
  const targets = useTargets();
  const target = targetFor(targets.data, day);
  const sum = useMemo(() => sumMacros(entries.data ?? []), [entries.data]);
  const isToday = day === todayKey();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <motion.div
            key={day}
            className="page-title"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {dayTitle(day)}
          </motion.div>
          <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            {isToday ? fmt(day, "EEEE, d MMMM") : fmt(day, "d MMMM yyyy")}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {!isToday && (
            <Tap className="chip" onClick={() => setDay(todayKey())}>
              Сегодня
            </Tap>
          )}
          <Tap className="icon-btn" onClick={() => nav.sheet(<CalendarSheet />)} aria-label="Календарь">
            <CalendarDays size={20} />
          </Tap>
        </div>
      </div>

      <WeekStrip targets={targets.data} />

      <SummaryCard sum={sum} target={target} loading={entries.isLoading} />

      <div className="stack" style={{ marginTop: 14 }}>
        {MEALS.map((m, i) => (
          <MealCard key={m.id} meal={m.id as Meal} entries={(entries.data ?? []).filter((e) => e.meal === m.id)} index={i} />
        ))}
      </div>

      <div className="row" style={{ marginTop: 16, gap: 10 }}>
        <Tap className="btn btn-block" onClick={() => nav.sheet(<AddFoodSheet />, { full: true })}>
          <Plus size={20} /> Добавить еду
        </Tap>
        <Tap className="icon-btn" style={{ width: 54, height: 54 }} onClick={() => nav.sheet(<ScannerSheet />, { full: true })} aria-label="Сканировать">
          <ScanBarcode size={22} />
        </Tap>
      </div>
    </div>
  );
}

// ───────────────────────── Лента недели

function WeekStrip({ targets }: { targets?: Targets[] }) {
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
            const target = targetFor(targets, d)?.calories ?? 0;
            const ratio = t && target ? Math.min(t.kcal / target, 1) : 0;
            const on = d === day;
            const future = d > today;
            return (
              <button
                key={d}
                className={`wday ${on ? "on" : ""} ${future ? "future" : ""}`}
                onClick={() => {
                  if (!on) haptic.select();
                  setDay(d);
                }}
              >
                <span className="wday-name">{WEEKDAYS_SHORT[i]}</span>
                <span className="wday-circle">
                  <svg viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r="20" className="wday-track" />
                    <motion.circle
                      cx="22"
                      cy="22"
                      r="20"
                      className="wday-progress"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: ratio }}
                      transition={{ duration: 0.8, delay: 0.1 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                      style={{ opacity: ratio > 0.01 ? 1 : 0 }}
                    />
                  </svg>
                  {on && <motion.span layoutId="wday-fill" className="wday-fill" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
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

// ───────────────────────── Итоги дня

function SummaryCard({ sum, target, loading }: { sum: ReturnType<typeof sumMacros>; target?: Targets; loading: boolean }) {
  const [mode, setMode] = useState<"left" | "eaten">("left");
  const goal = target ?? { calories: 2000, protein: 120, fat: 70, carbs: 220 };
  const left = goal.calories - sum.kcal;
  const over = left < 0;

  const macros = [
    { key: "protein", label: "Белки", color: "var(--protein)", value: sum.protein, max: goal.protein },
    { key: "fat", label: "Жиры", color: "var(--fat)", value: sum.fat, max: goal.fat },
    { key: "carbs", label: "Углеводы", color: "var(--carbs)", value: sum.carbs, max: goal.carbs },
  ];

  return (
    <Tap
      className="card summary"
      scale={0.985}
      onClick={() => {
        haptic.tap();
        setMode((m) => (m === "left" ? "eaten" : "left"));
      }}
    >
      <div className="summary-top">
        <div className="summary-side">
          <div className="num summary-side-v">{fmtNum(sum.kcal)}</div>
          <div className="summary-side-l">съедено</div>
        </div>
        <Rings
          size={188}
          stroke={11}
          gap={4}
          rings={[
            { value: loading ? 0 : sum.kcal, max: goal.calories, color: "var(--kcal)", color2: "var(--kcal-2)" },
            ...macros.map((m) => ({ value: loading ? 0 : m.value, max: m.max, color: m.color })),
          ]}
        >
          <div>
            <div className="summary-big">
              <NumberTicker value={Math.round(mode === "left" ? Math.abs(left) : sum.kcal)} />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={mode + String(over)}
                className="summary-caption"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                style={{ color: mode === "left" && over ? "var(--danger)" : undefined }}
              >
                {mode === "eaten" ? "съедено" : over ? "сверх нормы" : "осталось"}
              </motion.div>
            </AnimatePresence>
          </div>
        </Rings>
        <div className="summary-side">
          <div className="num summary-side-v">{fmtNum(goal.calories)}</div>
          <div className="summary-side-l">цель</div>
        </div>
      </div>

      <div className="summary-macros">
        {macros.map((m, i) => (
          <div key={m.key} className="summary-macro">
            <div className="legend-head">
              <span className="dot" style={{ background: m.color, width: 7, height: 7 }} />
              <span>{m.label}</span>
            </div>
            <div className="legend-val num">
              {mode === "left" ? fmtNum(Math.max(m.max - m.value, 0)) : fmtNum(m.value)}
              <span className="faint"> {mode === "left" ? "г ост." : `/ ${m.max}`}</span>
            </div>
            <Bar value={m.value} max={m.max} color={m.color} height={5} delay={0.2 + i * 0.08} />
          </div>
        ))}
      </div>
    </Tap>
  );
}

// ───────────────────────── Приёмы пищи

function MealCard({ meal, entries, index }: { meal: Meal; entries: Entry[]; index: number }) {
  const nav = useNav();
  const info = MEALS[meal];
  const total = sumMacros(entries);
  return (
    <motion.div
      className="card meal"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="meal-head">
        <span className="meal-emoji">{info.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="meal-name">{info.name}</div>
          <div className="meal-sub">
            {entries.length ? (
              <>
                <span className="num">{fmtNum(total.kcal)}</span> ккал · Б {fmtNum(total.protein)} · Ж {fmtNum(total.fat)} · У{" "}
                {fmtNum(total.carbs)}
              </>
            ) : (
              "Пока пусто"
            )}
          </div>
        </div>
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
    </motion.div>
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
        className="entry"
        drag={pending ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0.05 }}
        dragDirectionLock
        onDragEnd={onDragEnd}
        whileTap={{ backgroundColor: "rgba(255,255,255,0.04)" }}
        onClick={() => {
          if (pending) return;
          nav.sheet(entry.grams ? <FoodDetailSheet entry={entry} /> : <QuickAddSheet entry={entry} />);
        }}
        style={{ opacity: pending ? 0.6 : 1 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="entry-name">{entry.name}</div>
          <div className="entry-sub">
            {entry.grams ? `${fmtNum(entry.grams)} г · ` : ""}Б {fmtNum(entry.protein)} · Ж {fmtNum(entry.fat)} · У {fmtNum(entry.carbs)}
          </div>
        </div>
        <div className="entry-kcal num">{fmtNum(entry.kcal)}</div>
      </motion.button>
    </motion.div>
  );
}
