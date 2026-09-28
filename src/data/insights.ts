import { useMemo } from "react";
import { useDayFlags, useDayTargets, useGoal, useSettings, useTargets, useTotals, useWeights } from "./api";
import { ageFrom, daysBetween, rangeKeys, shiftKey, todayKey } from "@/lib/dates";
import { TREND_MIN_WEIGHINS, checkinPlan, estimateTdee, etaDays, scaleChange, targetFor, tdeeFrom, trendSeries, typicalKcal } from "@/lib/nutrition";

/** Всё, что считается из данных пользователя: тренд веса, расход, серии, прогресс цели, корректировка */
export function useInsights() {
  const settings = useSettings();
  const weights = useWeights();
  const totals = useTotals();
  const targets = useTargets();
  const goal = useGoal();
  const flags = useDayFlags();
  const dayTargets = useDayTargets();

  const value = useMemo(() => {
    const today = todayKey();
    const trend = trendSeries(weights.data, today);
    const lastScale = weights.data?.length ? weights.data[weights.data.length - 1] : undefined;
    // current — тренд (для расчётов); weight — последнее взвешивание (то, что показываем человеку)
    const current = trend.length ? trend[trend.length - 1].trend : (lastScale?.weight_kg ?? null);
    const weight = lastScale ? Number(lastScale.weight_kg) : null;
    const weighIns = weights.data?.length ?? 0;
    // Последний известный процент жира (не старше 90 дней)
    const bf = [...(weights.data ?? [])].reverse().find((w) => w.body_fat != null && daysBetween(w.day, today) <= 90)?.body_fat ?? null;

    const s = settings.data;
    const target = targetFor(targets.data, today);
    const formula =
      s?.sex && s.height_cm && s.activity && current
        ? tdeeFrom(s.sex, current, s.height_cm, ageFrom(s.birth_date), s.activity, bf)
        : (target?.tdee ?? 2200);

    // Оценки расхода на каждый из последних 36 дней с одними и теми же входными данными
    // (отметки дней, нормы дней с читмилами). Показываем скользящее среднее за 7 дней —
    // и главная цифра, и график считаются одинаково.
    const yesterday = shiftKey(today, -1);
    const targetOf = (d: string) => dayTargets.forDay(d).calories;
    const typical = typicalKcal((totals.data ?? []).filter((t) => t.day >= shiftKey(today, -60)));
    const series = Array.from({ length: 36 }, (_, i) =>
      estimateTdee(totals.data, trend, formula, shiftKey(yesterday, i - 35), 21, flags.data, targetOf, typical),
    );
    const smooth = series.map((_, i) => {
      const w = series.slice(Math.max(0, i - 6), i + 1);
      return Math.round(w.reduce((a, e) => a + e.value, 0) / w.length);
    });
    const raw = series[series.length - 1];
    const tdee = { value: smooth[smooth.length - 1], confidence: raw.confidence, observed: raw.observed };
    const tdeeSeries = smooth.slice(-14);
    const tdeeSeries30 = smooth.slice(-30).map((value, i) => ({ day: shiftKey(yesterday, i - 29), value }));

    const byDay = new Map((totals.data ?? []).map((t) => [t.day, t]));
    const weighed = new Set((weights.data ?? []).map((w) => w.day));
    const last30 = rangeKeys(shiftKey(today, -29), today);
    const logged30 = last30.map((d) => (byDay.get(d)?.entries ?? 0) > 0);
    const weighed30 = last30.map((d) => weighed.has(d));

    let streak = 0;
    for (let d = byDay.get(today)?.entries ? today : yesterday; byDay.get(d)?.entries; d = shiftKey(d, -1)) streak++;

    // Изменения — по взвешиваниям: человек может проверить их по истории
    const change = (days: number) => scaleChange(weights.data, days, today)?.change ?? null;

    const g = goal.data;
    const eta = g && current != null ? etaDays(current, g.target_weight, g.rate_kg_week) : null;
    // Цель пройдена по весам — «осталось» 0 (не «осталось 18,9 кг» при перевыполненной цели)
    const goalReached =
      !!g && g.kind !== "maintain" && g.target_weight != null && weight != null && (g.kind === "lose" ? weight <= g.target_weight : weight >= g.target_weight);
    const goalLeft = g && g.kind !== "maintain" && g.target_weight != null && weight != null ? (goalReached ? 0 : Math.abs(g.target_weight - weight)) : null;
    // Прогресс к цели — от последнего взвешивания (рядом показываем «сейчас» = это же число)
    const progress =
      g && weight != null && g.target_weight != null && g.start_weight !== g.target_weight
        ? Math.min(Math.max((g.start_weight - weight) / (g.start_weight - g.target_weight), 0), 1)
        : null;

    // Еженедельная корректировка: прошла неделя с последней настройки, и данных достаточно
    const lastTouch = [s?.last_checkin, target?.start_date].filter(Boolean).sort().pop() ?? null;
    const checkinDue = !!g && !!s?.sex && current != null && tdee.confidence >= 0.3 && (!lastTouch || daysBetween(lastTouch, today) >= 7);
    const checkin =
      checkinDue && g && s?.sex && current != null
        ? {
            ...checkinPlan({
              tdee: tdee.value,
              current,
              kind: g.kind,
              rateKgWeek: g.rate_kg_week,
              targetWeight: g.target_weight,
              sex: s.sex,
              heightCm: s.height_cm,
              bodyFat: bf,
              prevCalories: target?.calories ?? null,
            }),
            prevCalories: target?.calories ?? null,
            weekChange: change(7),
          }
        : null;

    return {
      trend,
      current,
      weight,
      weighIns,
      /** Тренд имеет смысл показывать рядом с весом, когда взвешиваний достаточно */
      trendShown: weighIns >= TREND_MIN_WEIGHINS,
      lastScale,
      bodyFat: bf,
      formula,
      tdee,
      tdeeSeries,
      tdeeSeries30,
      typical,
      logged30,
      weighed30,
      streak,
      loggedDays: (totals.data ?? []).filter((t) => t.entries > 0).length,
      change7: change(7),
      change30: change(30),
      goal: g,
      eta: goalReached ? null : eta,
      progress,
      goalReached,
      goalLeft,
      target,
      checkin,
    };
  }, [settings.data, weights.data, totals.data, targets.data, goal.data, flags.data, dayTargets]);

  return {
    ...value,
    loading: settings.isLoading || weights.isLoading || totals.isLoading || targets.isLoading || goal.isLoading,
    totals: totals.data,
    targets: targets.data,
    weights: weights.data,
    flags: flags.data,
  };
}
