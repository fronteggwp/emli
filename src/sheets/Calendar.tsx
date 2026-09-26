import { useState, type PointerEvent as ReactPointerEvent, useRef } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { useDay } from "@/state/day";
import { useLayer, useNav } from "@/nav/Nav";
import { useDayTargets, useTotals } from "@/data/api";
import { dayTitle, fmt, fromKey, shiftKey, toKey, todayKey, weekStart, WEEKDAYS_SHORT } from "@/lib/dates";
import { fmtNum } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { CheatMealSheet } from "./CheatMeal";
import "./calendar.css";

/** Цвет кольца дня: попал в норму / недобрал / перебрал */
function tone(ratio: number) {
  if (ratio >= 0.9 && ratio <= 1.1) return "var(--good)";
  if (ratio > 1.1) return "var(--fat)";
  return "var(--kcal)";
}

export function CalendarSheet() {
  const { day, setDay } = useDay();
  const nav = useNav();
  const layer = useLayer();
  const totals = useTotals();
  const targets = useDayTargets();
  const today = todayKey();
  const [month, setMonth] = useState(toKey(startOfMonth(fromKey(day))));
  const [picked, setPicked] = useState(day);
  const [dir, setDir] = useState(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const byDay = new Map((totals.data ?? []).map((t) => [t.day, t]));
  const planByDay = new Map(targets.plans.map((p) => [p.day, p]));

  const first = weekStart(month);
  const last = toKey(endOfMonth(fromKey(month)));
  const cells: string[] = [];
  for (let d = first; d <= last || cells.length % 7; d = shiftKey(d, 1)) cells.push(d);

  const go = (n: number) => {
    haptic.select();
    setDir(n);
    setMonth(toKey(addMonths(fromKey(month), n)));
  };

  // Свайп по сетке — листаем месяцы
  const onDown = (e: ReactPointerEvent) => (swipe.current = { x: e.clientX, y: e.clientY });
  const onUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
  };

  const title = format(fromKey(month), "LLLL yyyy", { locale: ru });
  const sel = byDay.get(picked);
  const selTarget = targets.forDay(picked);
  const selPlan = planByDay.get(picked);
  const selSave = selTarget.adjust.find((a) => a.kind === "save");

  return (
    <>
      <SheetHeader title="Календарь" />
      <div className="sheet-body">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <Tap className="icon-btn" style={{ width: 38, height: 38 }} onClick={() => go(-1)} aria-label="Назад">
            <ChevronLeft size={20} />
          </Tap>
          <div key={month} className="cal-title">
            {title.charAt(0).toUpperCase() + title.slice(1)}
          </div>
          <Tap className="icon-btn" style={{ width: 38, height: 38 }} onClick={() => go(1)} aria-label="Вперёд">
            <ChevronRight size={20} />
          </Tap>
        </div>
        <div className="cal-grid">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="cal-wd">
              {w}
            </div>
          ))}
        </div>
        <div key={month} className={`cal-grid cal-month ${dir > 0 ? "from-right" : dir < 0 ? "from-left" : ""}`} onPointerDown={onDown} onPointerUp={onUp}>
          {cells.map((d) => {
            const inMonth = d.slice(0, 7) === month.slice(0, 7);
            const t = byDay.get(d);
            const target = targets.forDay(d);
            const ratio = t && target.calories ? t.kcal / target.calories : 0;
            const plan = planByDay.get(d);
            const saving = target.adjust.some((a) => a.kind === "save");
            const r = 17;
            const c = 2 * Math.PI * r;
            return (
              <button
                key={d}
                className={`cal-cell ${inMonth ? "" : "out"} ${d === today ? "today" : ""} ${d === picked ? "on" : ""} ${saving ? "saving" : ""}`}
                onClick={() => {
                  haptic.select();
                  setPicked(d);
                }}
              >
                <svg viewBox="0 0 40 40">
                  {ratio > 0 && (
                    <circle
                      cx="20"
                      cy="20"
                      r={r}
                      fill="none"
                      stroke={tone(ratio)}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.min(ratio, 1) * c} ${c}`}
                      transform="rotate(-90 20 20)"
                    />
                  )}
                </svg>
                <span className="num">{fromKey(d).getDate()}</span>
                {plan && <i className="cal-pizza">🍕</i>}
              </button>
            );
          })}
        </div>
        <div className="cal-legend">
          <span>
            <i style={{ background: "var(--good)" }} /> в норме
          </span>
          <span>
            <i style={{ background: "var(--kcal)" }} /> недобор
          </span>
          <span>
            <i style={{ background: "var(--fat)" }} /> перебор
          </span>
          <span>🍕 читмил</span>
        </div>

        <div key={picked} className="cal-panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="cal-panel-title">{dayTitle(picked)}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {fmt(picked, "EEEE, d MMMM")}
              </div>
            </div>
            {sel ? (
              <div style={{ textAlign: "right" }}>
                <div className="num" style={{ fontSize: 20, fontWeight: 800 }}>
                  {fmtNum(sel.kcal)}
                </div>
                <div className="faint" style={{ fontSize: 12 }}>
                  из {fmtNum(selTarget.calories)} ккал
                </div>
              </div>
            ) : (
              <div className="faint" style={{ fontSize: 13, textAlign: "right" }}>
                норма {fmtNum(selTarget.calories)}
                <br />
                ккал
              </div>
            )}
          </div>

          {selPlan && (
            <button
              className="cal-cheat press"
              onClick={() => {
                layer.close();
                nav.sheet(<CheatMealSheet plan={selPlan} />, { full: true });
              }}
            >
              <span style={{ fontSize: 26 }}>🍕</span>
              <span style={{ flex: 1, textAlign: "left" }}>
                <b>{selPlan.title || "Читмил"}</b>
                <div className="muted" style={{ fontSize: 13 }}>
                  +{fmtNum(selPlan.extra_kcal)} ккал · {selPlan.mode === "before" ? "копим" : "отбиваем"} {selPlan.spread_days}{" "}
                  {selPlan.spread_days === 1 ? "день" : selPlan.spread_days < 5 ? "дня" : "дней"}
                </div>
              </span>
              <Pencil size={16} className="muted" />
            </button>
          )}
          {!selPlan && selSave && (
            <div className="cal-save">
              Копим на читмил {fmt(selSave.plan.day, "d MMMM")}: {fmtNum(selSave.delta)} ккал
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <Tap
              className="btn btn-block btn-sm"
              onClick={() => {
                setDay(picked);
                layer.close();
              }}
            >
              <BookOpen size={16} /> Открыть день
            </Tap>
            {picked >= today && !selPlan && (
              <Tap
                className="btn btn-block btn-sm cheat-btn"
                onClick={() => {
                  haptic.medium();
                  layer.close();
                  nav.sheet(<CheatMealSheet day={picked} />, { full: true });
                }}
              >
                🍕 Читмил
              </Tap>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
