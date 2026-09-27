import { useMemo } from "react";
import { motion } from "motion/react";
import { useSaveGoal, useSaveSettings, useSaveTargets, useSetDayFlag, useTotals } from "@/data/api";
import { useInsights } from "@/data/insights";
import { todayKey } from "@/lib/dates";
import { fmtKg, fmtNum, isCompleteDay } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { Tap } from "./Tap";
import { useToast } from "./Toast";

/** Раз в неделю: пересчёт нормы по реальному расходу — применить одним нажатием */
export function CheckinCard() {
  const ins = useInsights();
  const saveTargets = useSaveTargets();
  const saveSettings = useSaveSettings();
  const saveGoal = useSaveGoal();
  const toast = useToast();
  const c = ins.checkin;
  if (!c || ins.current == null) return null;
  const prev = c.prevCalories ?? c.calories;
  const diff = c.calories - prev;
  const same = Math.abs(diff) < 30 && !c.reached;
  const today = todayKey();

  const done = () => saveSettings.mutate({ last_checkin: today });
  const apply = () => {
    haptic.success();
    saveTargets.mutate({ start_date: today, calories: c.calories, protein: c.protein, fat: c.fat, carbs: c.carbs, tdee: ins.tdee.value });
    if (c.reached)
      saveGoal.mutate({ kind: "maintain", start_date: today, start_weight: ins.current!, target_weight: null, rate_kg_week: 0 });
    done();
    toast(c.reached ? "Переходим на поддержание 🎉" : "Норма обновлена");
  };

  return (
    <motion.div className="checkin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="checkin-head">
        <span className="checkin-ico">{c.reached ? "🎉" : "📅"}</span>
        <span style={{ flex: 1 }}>
          <b>{c.reached ? "Цель достигнута!" : "Еженедельная корректировка"}</b>
          <div className="checkin-sub">
            Расход ≈ {fmtNum(ins.tdee.value)} ккал/день
            {c.weekChange != null && ` · вес за неделю ${c.weekChange > 0 ? "+" : c.weekChange < 0 ? "−" : ""}${fmtKg(Math.abs(c.weekChange))} кг`}
          </div>
        </span>
      </div>
      {same ? (
        <div className="checkin-body">
          Норма в порядке — <b className="num">{fmtNum(prev)}</b> ккал. Всё идёт по плану, продолжай!
        </div>
      ) : (
        <div className="checkin-body">
          {c.reached ? "Новая норма для поддержания веса: " : "Новая норма: "}
          <span className="num">
            {fmtNum(prev)} → <b>{fmtNum(c.calories)}</b> ккал
          </span>
          <div className="checkin-macros">
            Б {c.protein} · Ж {c.fat} · У {c.carbs} г
          </div>
        </div>
      )}
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        {same ? (
          <Tap className="btn btn-sm btn-block" onClick={() => (haptic.success(), done())}>
            Отлично 👍
          </Tap>
        ) : (
          <>
            <Tap className="btn btn-sm btn-accent" style={{ flex: 1 }} onClick={apply}>
              Применить
            </Tap>
            <Tap className="btn btn-sm" style={{ flex: 1 }} onClick={() => (haptic.tap(), done())}>
              Оставить как есть
            </Tap>
          </>
        )}
      </div>
    </motion.div>
  );
}

/** Отметка «записал не всё»: такие дни не портят расчёт реального расхода */
export function DayCompleteness({ day, kcal, hasEntries }: { day: string; kcal: number; hasEntries: boolean }) {
  const ins = useInsights();
  const totals = useTotals();
  const set = useSetDayFlag();
  const flag = ins.flags?.get(day);
  const typical = useMemo(() => {
    const k = (totals.data ?? []).filter((t) => t.entries > 0).map((t) => Number(t.kcal)).sort((a, b) => a - b);
    return k.length ? k[Math.floor(k.length / 2)] : 0;
  }, [totals.data]);
  if (!hasEntries) return null;
  const past = day < todayKey();
  const autoIncomplete = !flag && past && !isCompleteDay(kcal, typical);

  if (flag === "incomplete")
    return (
      <div className="day-flag warn">
        📝 День отмечен как неполный — не учитывается в расчёте расхода
        <button onClick={() => (haptic.tap(), set.mutate({ day, status: null }))}>Отменить</button>
      </div>
    );
  if (autoIncomplete)
    return (
      <div className="day-flag warn">
        ⚠️ Похоже, записано не всё — день не учитывается в расчёте расхода
        <button onClick={() => (haptic.success(), set.mutate({ day, status: "complete" }))}>Нет, всё записано</button>
      </div>
    );
  return (
    <button className="day-flag-link" onClick={() => (haptic.tap(), set.mutate({ day, status: "incomplete" }))}>
      Записал не всё за {past ? "этот день" : "сегодня"}?
    </button>
  );
}
