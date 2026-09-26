import { memo } from "react";
import { BACK, FRONT, type BodyPart } from "@/lib/bodyPolygons";
import type { Muscle } from "@/lib/exercise";

// Мышцы из базы упражнений → области на схеме тела
const AREAS: Record<Muscle, string[]> = {
  chest: ["chest"],
  shoulders: ["front-deltoids", "back-deltoids"],
  triceps: ["triceps"],
  biceps: ["biceps"],
  forearms: ["forearm"],
  lats: ["upper-back"],
  "middle back": ["upper-back"],
  "lower back": ["lower-back"],
  traps: ["trapezius"],
  abdominals: ["abs", "obliques"],
  glutes: ["gluteal"],
  quadriceps: ["quadriceps"],
  hamstrings: ["hamstring"],
  calves: ["calves", "left-soleus", "right-soleus"],
  adductors: ["adductor"],
  abductors: ["abductors"],
  neck: ["neck"],
};

const NEUTRAL = new Set(["head", "knees"]);

/** Интенсивность 0..1 для каждой области схемы */
function toAreas(load: Partial<Record<Muscle, number>>) {
  const out: Record<string, number> = {};
  for (const [m, v] of Object.entries(load) as [Muscle, number][]) {
    for (const a of AREAS[m] ?? []) out[a] = Math.max(out[a] ?? 0, v);
  }
  return out;
}

function Figure({ parts, areas, color }: { parts: BodyPart[]; areas: Record<string, number>; color: string }) {
  return (
    <svg viewBox="0 0 100 200" className="muscle-fig">
      {parts.map((part, i) => {
        const v = areas[part.m] ?? 0;
        const fill = NEUTRAL.has(part.m) ? "var(--card-3)" : v > 0 ? color : "var(--card-3)";
        const opacity = NEUTRAL.has(part.m) ? 0.55 : v > 0 ? 0.35 + v * 0.65 : 1;
        return part.p.map((pts, j) => (
          <polygon key={`${i}-${j}`} points={pts} fill={fill} fillOpacity={opacity} stroke="var(--bg-2)" strokeWidth={0.6} strokeLinejoin="round" />
        ));
      })}
    </svg>
  );
}

/**
 * Схема мышц спереди и сзади. load — нагрузка 0..1 по мышцам.
 * Для страницы упражнения: основные = 1, вспомогательные = 0.4.
 */
export const MuscleMap = memo(function MuscleMap({
  load,
  color = "var(--protein)",
  height = 200,
  labels = true,
}: {
  load: Partial<Record<Muscle, number>>;
  color?: string;
  height?: number;
  labels?: boolean;
}) {
  const areas = toAreas(load);
  return (
    <div className="muscle-map" style={{ height }}>
      <div className="muscle-side">
        <Figure parts={FRONT} areas={areas} color={color} />
        {labels && <span>спереди</span>}
      </div>
      <div className="muscle-side">
        <Figure parts={BACK} areas={areas} color={color} />
        {labels && <span>сзади</span>}
      </div>
    </div>
  );
});

export function exerciseLoad(pm: Muscle[], sm: Muscle[]) {
  const load: Partial<Record<Muscle, number>> = {};
  for (const m of sm) load[m] = 0.4;
  for (const m of pm) load[m] = 1;
  return load;
}
