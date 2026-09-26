import { useMemo } from "react";
import { useGoal, useSettings, useTargets, useTotals, useWeights } from "./api";
import { ageFrom, rangeKeys, shiftKey, todayKey } from "@/lib/dates";
import { estimateTdee, etaDays, targetFor, tdeeFrom, trendSeries } from "@/lib/nutrition";

/** Всё, что считается из данных пользователя: тренд веса, расход, серии, прогресс цели */
export function useInsights() {
  const settings = useSettings();
  const weights = useWeights();
  const totals = useTotals();
  const targets = useTargets();
  const goal = useGoal();

  const value = useMemo(() => {
    const today = todayKey();
    const trend = trendSeries(weights.data, today);
    const lastScale = weights.data?.length ? weights.data[weights.data.length - 1] : undefined;
    const current = trend.length ? trend[trend.length - 1].trend : (lastScale?.weight_kg ?? null);

    const s = settings.data;
    const target = targetFor(targets.data, today);
    const formula =
      s?.sex && s.height_cm && s.activity && current
        ? tdeeFrom(s.sex, current, s.height_cm, ageFrom(s.birth_date), s.activity)
        : (target?.tdee ?? 2200);

    const tdee = estimateTdee(totals.data, trend, formula);
    const yesterday = shiftKey(today, -1);
    const tdeeSeries = Array.from({ length: 14 }, (_, i) => estimateTdee(totals.data, trend, formula, shiftKey(yesterday, i - 13)).value);

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

    return {
      trend,
      current,
      lastScale,
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
    };
  }, [settings.data, weights.data, totals.data, targets.data, goal.data]);

  return {
    ...value,
    loading: settings.isLoading || weights.isLoading || totals.isLoading || targets.isLoading || goal.isLoading,
    totals: totals.data,
    targets: targets.data,
    weights: weights.data,
  };
}
