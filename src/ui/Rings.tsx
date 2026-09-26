import { useId } from "react";
import { motion } from "motion/react";

export type RingSpec = { value: number; max: number; color: string; color2?: string };

const ease = [0.16, 1, 0.3, 1] as const;

/** Концентрические кольца прогресса в духе Apple Activity */
export function Rings({
  rings,
  size = 176,
  stroke = 13,
  gap = 4,
  delay = 0,
  children,
}: {
  rings: RingSpec[];
  size?: number;
  stroke?: number;
  gap?: number;
  delay?: number;
  children?: React.ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  const c = size / 2;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
        <defs>
          {rings.map((r, i) => (
            <linearGradient key={i} id={`g${uid}${i}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={r.color} />
              <stop offset="100%" stopColor={r.color2 ?? r.color} />
            </linearGradient>
          ))}
        </defs>
        {rings.map((r, i) => {
          const radius = c - stroke / 2 - i * (stroke + gap);
          if (radius <= stroke / 2) return null;
          const ratio = r.max > 0 ? r.value / r.max : 0;
          const main = Math.min(Math.max(ratio, 0), 1);
          const over = Math.min(Math.max(ratio - 1, 0), 1);
          return (
            <g key={i}>
              <circle cx={c} cy={c} r={radius} fill="none" stroke={r.color} strokeOpacity={0.16} strokeWidth={stroke} />
              <motion.circle
                cx={c}
                cy={c}
                r={radius}
                fill="none"
                stroke={`url(#g${uid}${i})`}
                strokeWidth={stroke}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: main < 0.004 ? 0 : main, opacity: main < 0.004 ? 0 : 1 }}
                transition={{ duration: 1.1, ease, delay: delay + i * 0.08, opacity: { duration: 0.2, delay: delay + i * 0.08 } }}
              />
              {over > 0 && (
                <motion.circle
                  cx={c}
                  cy={c}
                  r={radius}
                  fill="none"
                  stroke={r.color2 ?? r.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  style={{ filter: "drop-shadow(0 0 3px rgba(0,0,0,.7)) brightness(1.25)" }}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: over }}
                  transition={{ duration: 0.9, ease, delay: delay + 1 + i * 0.08 }}
                />
              )}
            </g>
          );
        })}
      </svg>
      {children && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{children}</div>
      )}
    </div>
  );
}

/** Горизонтальная полоска прогресса */
export function Bar({ value, max, color, height = 6, delay = 0 }: { value: number; max: number; color: string; height?: number; delay?: number }) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const over = max > 0 && value > max * 1.05;
  return (
    <div style={{ height, borderRadius: height, background: "var(--card-3)", overflow: "hidden" }}>
      <motion.div
        style={{
          height: "100%",
          borderRadius: height,
          background: color,
          transformOrigin: "left",
          boxShadow: over ? `0 0 0 1px var(--danger) inset` : undefined,
        }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: ratio }}
        transition={{ duration: 1, ease, delay }}
      />
    </div>
  );
}
