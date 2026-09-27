import { MUSCLE_GROUPS, type Exercise, type Muscle } from "@/lib/exercise";
import type { Program } from "./programs";

export const GROUP_COLORS: Record<string, string> = {
  chest: "#ff7a5c",
  back: "#7c8cff",
  shoulders: "#ffc247",
  arms: "#b388ff",
  legs: "#4fd18b",
  glutes: "#ff8fb1",
  core: "#5cc8ff",
};

export type ProgramStats = {
  load: Partial<Record<Muscle, number>>;
  groups: { key: string; title: string; emoji: string; pct: number; color: string }[];
  weeklySets: number;
  exercises: number;
  key: string[];
};

/**
 * Что внутри программы: нагрузка по мышцам (основная мышца = подход, вспомогательная = ½),
 * доли групп мышц, подходы в неделю и главные упражнения.
 */
export function programStats(p: Program, byId: Map<string, Exercise>): ProgramStats {
  const muscles: Partial<Record<Muscle, number>> = {};
  const uniq = new Map<string, { n: string; sets: number; compound: boolean }>();
  let daySets = 0;
  for (const d of p.days) {
    for (const x of d.exercises) {
      daySets += x.sets;
      const ex = byId.get(x.ex);
      if (!ex) continue;
      for (const m of ex.pm) muscles[m] = (muscles[m] ?? 0) + x.sets;
      for (const m of ex.sm) muscles[m] = (muscles[m] ?? 0) + x.sets * 0.5;
      const u = uniq.get(x.ex) ?? { n: ex.n, sets: 0, compound: ex.m === "compound" };
      u.sets += x.sets;
      uniq.set(x.ex, u);
    }
  }
  const max = Math.max(1, ...Object.values(muscles).map(Number));
  // Подсвечиваем только заметную нагрузку — так виден акцент программы
  const load = Object.fromEntries(
    Object.entries(muscles)
      .map(([m, v]) => [m, Number(v) / max] as const)
      .filter(([, v]) => v >= 0.2),
  ) as Partial<Record<Muscle, number>>;
  const groupSum = MUSCLE_GROUPS.map((g) => ({ g, v: g.muscles.reduce((s, m) => s + (muscles[m] ?? 0), 0) }));
  const total = groupSum.reduce((s, x) => s + x.v, 0) || 1;
  const groups = groupSum
    .map(({ g, v }) => ({ key: g.key, title: g.title, emoji: g.emoji, pct: Math.round((v / total) * 100), color: GROUP_COLORS[g.key] }))
    .filter((g) => g.pct > 0)
    .sort((a, b) => b.pct - a.pct);
  const key = [...uniq.values()]
    .sort((a, b) => Number(b.compound) - Number(a.compound) || b.sets - a.sets)
    .slice(0, 4)
    .map((u) => u.n);
  return {
    load,
    groups,
    weeklySets: Math.round((daySets / p.days.length) * Math.min(p.perWeek, 7)),
    exercises: uniq.size,
    key,
  };
}
