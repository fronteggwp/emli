import { useMemo } from "react";
import { useDayFlags, useGoal, useSettings, useTargets, useTotals, useWeights } from "./api";
import { ageFrom, daysBetween, rangeKeys, shiftKey, todayKey } from "@/lib/dates";
import { checkinPlan, estimateTdee, etaDays, targetFor, tdeeFrom, trendSeries } from "@/lib/nutrition";

/** Всё, что считается из данных пользователя: тренд веса, расход, серии, прогресс цели, корректировка */
export function useInsights() {
  const settings = useSettings();
  const weights = useWeights();
  const totals = useTotals();
  const targets = useTargets();
  const goal = useGoal();
  const flags = useDayFlags();

  const value = useMemo(() => {
    const today = todayKey();
    const trend = trendSeries(weights.data, today);
    const lastScale = weights.data?.length ? weights.data[weights.data.length - 1] : undefined;
    const current = trend.length ? trend[trend.length - 1].trend : (lastScale?.weight_kg ?? null);
    // Последний известный процент жира (не старше 90 дней)
    const bf = [...(weights.data ?? [])].reverse().find((w) => w.body_fat != null && daysBetween(w.day, today) <= 90)?.body_fat ?? null;

    const s = settings.data;
    const target = targetFor(targets.data, today);
    const formula =
      s?.sex && s.height_cm && s.activity && current
        ? tdeeFrom(s.sex, current, s.height_cm, ageFrom(s.birth_date), s.activity, bf)
        : (target?.tdee ?? 2200);

    // Оценки расхода на каждый из последних 14 дней; показываем среднее за неделю — без скачков
    const yesterday = shiftKey(today, -1);
    const series = Array.from({ length: 14 }, (_, i) => estimateTdee(totals.data, trend, formula, shiftKey(yesterday, i - 13), 21, flags.data));
    const last7 = series.slice(-7);
    const raw = series[series.length - 1];
    const tdee = {
      value: Math.round(last7.reduce((a, e) => a + e.value, 0) / last7.length),
      confidence: raw.confidence,
      observed: raw.observed,
    };
    const tdeeSeries = series.map((e) => e.value);

    const byDay = new Map((totals.data ?? []).map((t) => [t.day, t]));
    const weighed = new Set((weights.data ?? []).map((w) => w.day));
    const last30 = rangeKeys(shiftKey(today, -29), today);
    const logged30 = last30.map((d) => (byDay.get(d)?.entries ?? 0) > 0);
    const weighed30 = last30.map((d) => weighed.has(d));

    let streak = 0;
    for (let d = byDay.get(today)?.entries ? today : yesterday; byDay.get(d)?.entries; d = shiftKey(d, -1)) streak++;

    const change = (days: number) => {
      if (trend.length < 2) return null;
      const from = trend.find((p) => p.day >= shiftKey(today, -days)) ?? trend[0];
      return current != null ? current - from.trend : null;
    };

    const g = goal.data;
    const eta = g && current != null ? etaDays(current, g.target_weight, g.rate_kg_week) : null;
    const progress =
      g && current != null && g.target_weight != null && g.start_weight !== g.target_weight
        ? Math.min(Math.max((g.start_weight - current) / (g.start_weight - g.target_weight), 0), 1)
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
      lastScale,
      bodyFat: bf,
      formula,
      tdee,
      tdeeSeries,
      logged30,
      weighed30,
      streak,
      loggedDays: (totals.data ?? []).filter((t) => t.entries > 0).length,
      change7: change(7),
      change30: change(30),
      goal: g,
      eta,
      progress,
      target,
      checkin,
    };
  }, [settings.data, weights.data, totals.data, targets.data, goal.data, flags.data]);

  return {
    ...value,
    loading: settings.isLoading || weights.isLoading || totals.isLoading || targets.isLoading || goal.isLoading,
    totals: totals.data,
    targets: targets.data,
    weights: weights.data,
    flags: flags.data,
  };
}
