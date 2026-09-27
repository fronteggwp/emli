import { useState } from "react";
import { motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetDayFlag } from "@/data/api";
import { supabase } from "@/lib/supabase";
import { useInsights } from "@/data/insights";
import { todayKey } from "@/lib/dates";
import { fmtKg, fmtNum, isCompleteDay } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { Tap } from "./Tap";
import { useToast } from "./Toast";

/** Раз в неделю: пересчёт нормы по реальному расходу — применить одним нажатием */
export function CheckinCard() {
  const ins = useInsights();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const c = ins.checkin;
  if (!c || ins.current == null) return null;
  const prev = c.prevCalories ?? c.calories;
  const diff = c.calories - prev;
  const same = Math.abs(diff) < 30 && !c.reached;
  const today = todayKey();

  // Норма, переход на поддержание и отметка «корректировка сделана» — одной операцией на сервере
  const run = async (apply: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc("apply_checkin", {
      d: today,
      kcal: c.calories,
      p: c.protein,
      f: c.fat,
      c: c.carbs,
      t: ins.tdee.value,
      apply,
      maintain: apply && c.reached,
      weight: ins.current,
    });
    setBusy(false);
    if (error) {
      haptic.error();
      toast("Не сохранилось — проверь связь и попробуй ещё раз");
      return;
    }
    for (const k of [["targets"], ["goal"], ["settings"]]) qc.invalidateQueries({ queryKey: k });
    if (apply) {
      haptic.success();
      toast(c.reached ? "Переходим на поддержание 🎉" : "Норма обновлена");
    } else haptic.tap();
  };
  const done = () => run(false);
  const apply = () => run(true);

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
          {c.reached ? "Норма поддержания — равна твоему расходу: " : "Новая норма: "}
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
          <Tap className="btn btn-sm btn-block" disabled={busy} onClick={done}>
            Отлично 👍
          </Tap>
        ) : (
          <>
            <Tap className="btn btn-sm btn-accent" style={{ flex: 1 }} disabled={busy} onClick={apply}>
              Применить
            </Tap>
            <Tap className="btn btn-sm" style={{ flex: 1 }} disabled={busy} onClick={done}>
              Оставить как есть
            </Tap>
          </>
        )}
      </div>
    </motion.div>
  );
}

/** Отметка «записал не всё»: такие дни не портят расчёт реального расхода */
export function DayCompleteness({ day, kcal, entries, target }: { day: string; kcal: number; entries: number; target: number }) {
  const ins = useInsights();
  const set = useSetDayFlag();
  const flag = ins.flags?.get(day);
  if (!entries) return null;
  const past = day < todayKey();
  const autoIncomplete = !flag && past && !isCompleteDay(kcal, ins.typical, undefined, target, entries);

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
