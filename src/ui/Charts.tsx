import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { haptic } from "@/lib/telegram";
import { fmt } from "@/lib/dates";

const ease = [0.16, 1, 0.3, 1] as const;

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    setW(ref.current.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Плавная кривая через точки (Catmull-Rom → Безье) */
function smoothPath(pts: [number, number][]) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    d += ` C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export type LinePoint = { day: string; value: number; dot?: number | null };

/**
 * Линейный график с точками и «скраббингом»: ведёшь пальцем — видишь значение за день.
 */
export function LineChart({
  points,
  height = 200,
  color = "var(--weight)",
  unit = "кг",
  digits = 1,
  goal,
  renderTip,
}: {
  points: LinePoint[];
  height?: number;
  color?: string;
  unit?: string;
  digits?: number;
  goal?: number | null;
  renderTip?: (p: LinePoint) => ReactNode;
}) {
  const gid = useId().replace(/:/g, "");
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padTop = 16;
  const padBottom = 22;
  const padRight = 38;

  const geo = useMemo(() => {
    const vals = points.flatMap((p) => [p.value, ...(p.dot != null ? [p.dot] : [])]);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (!Number.isFinite(min)) return null;
    // Цель рисуем, только если она недалеко — иначе график сплющится
    const showGoal = goal != null && goal >= min - Math.max(max - min, 1) * 0.8 && goal <= max + Math.max(max - min, 1) * 0.8;
    if (showGoal) {
      min = Math.min(min, goal!);
      max = Math.max(max, goal!);
    }
    const span = Math.max(max - min, 1);
    min -= span * 0.12;
    max += span * 0.12;
    const iw = Math.max(w - padRight, 10);
    const ih = height - padTop - padBottom;
    const x = (i: number) => (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const y = (v: number) => padTop + (1 - (v - min) / (max - min)) * ih;
    const line = smoothPath(points.map((p, i) => [x(i), y(p.value)]));
    const area = points.length > 1 ? `${line} L${x(points.length - 1)},${height - padBottom} L0,${height - padBottom} Z` : "";
    const ticks = [0, 0.5, 1].map((t) => min + (max - min) * (0.1 + 0.8 * t));
    return { x, y, line, area, ticks, iw, showGoal };
  }, [points, w, height, goal]);

  const onMove = (e: React.PointerEvent) => {
    if (!geo || points.length < 2) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rel = Math.min(Math.max(e.clientX - rect.left, 0), geo.iw);
    const i = Math.round((rel / geo.iw) * (points.length - 1));
    if (i !== hover) {
      haptic.select();
      setHover(i);
    }
  };

  const hp = hover != null ? points[hover] : null;

  return (
    <div ref={ref} style={{ position: "relative", height, touchAction: "pan-y" }} onPointerDown={onMove} onPointerMove={(e) => (e.buttons || e.pointerType === "touch" ? onMove(e) : undefined)} onPointerUp={() => setHover(null)} onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)}>
      {geo && w > 0 && (
        <svg width={w} height={height} style={{ overflow: "visible", display: "block" }}>
          <defs>
            <linearGradient id={`a${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {geo.ticks.map((t, i) => (
            <g key={i}>
              <line x1={0} x2={geo.iw} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--line)" strokeDasharray="2 4" />
              <text x={geo.iw + 6} y={geo.y(t) + 4} fontSize={11} fill="var(--text-3)" className="num">
                {t.toFixed(digits === 0 ? 0 : 1)}
              </text>
            </g>
          ))}
          {geo.showGoal && goal != null && (
            <g>
              <line x1={0} x2={geo.iw} y1={geo.y(goal)} y2={geo.y(goal)} stroke="var(--good)" strokeOpacity={0.7} strokeDasharray="5 5" />
              <text x={4} y={geo.y(goal) - 6} fontSize={11} fill="var(--good)">
                цель
              </text>
            </g>
          )}
          <motion.path
            d={geo.area}
            fill={`url(#a${gid})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          />
          {points.map((p, i) =>
            p.dot != null ? (
              <motion.circle
                key={p.day}
                cx={geo.x(i)}
                cy={geo.y(p.dot)}
                r={points.length > 60 ? 2 : 3.2}
                fill="var(--bg)"
                stroke={color}
                strokeOpacity={0.55}
                strokeWidth={1.5}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + (i / points.length) * 0.8, duration: 0.3 }}
              />
            ) : null,
          )}
          <motion.path
            d={geo.line}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease }}
          />
          {points.length > 0 && (
            <text x={0} y={height - 4} fontSize={11} fill="var(--text-3)">
              {fmt(points[0].day, "d MMM")}
            </text>
          )}
          {points.length > 1 && (
            <text x={geo.iw} y={height - 4} fontSize={11} fill="var(--text-3)" textAnchor="end">
              {fmt(points[points.length - 1].day, "d MMM")}
            </text>
          )}
          {hp && hover != null && (
            <g>
              <line x1={geo.x(hover)} x2={geo.x(hover)} y1={padTop - 8} y2={height - padBottom} stroke="var(--text-3)" />
              <circle cx={geo.x(hover)} cy={geo.y(hp.value)} r={6} fill={color} stroke="var(--bg)" strokeWidth={3} />
            </g>
          )}
        </svg>
      )}
      <AnimatePresence>
        {hp && hover != null && geo && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "absolute",
              top: -8,
              left: Math.min(Math.max(geo.x(hover) - 70, 0), Math.max(w - 140, 0)),
              width: 140,
              padding: "8px 10px",
              borderRadius: 14,
              background: "var(--card-3)",
              border: "1px solid var(--line-2)",
              fontSize: 13,
              pointerEvents: "none",
              boxShadow: "var(--shadow)",
            }}
          >
            {renderTip ? (
              renderTip(hp)
            ) : (
              <>
                <div className="muted" style={{ fontSize: 12 }}>
                  {fmt(hp.day, "d MMMM")}
                </div>
                <div className="num" style={{ fontWeight: 700, fontSize: 16 }}>
                  {hp.value.toFixed(digits)} {unit}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export type BarItem = { key: string; label: string; value: number; target?: number; color?: string; active?: boolean; dim?: boolean };

/** Столбики по дням с отметкой цели */
export function Bars({
  items,
  height = 150,
  color = "var(--kcal)",
  onSelect,
}: {
  items: BarItem[];
  height?: number;
  color?: string;
  onSelect?: (key: string) => void;
}) {
  const top = Math.max(1, ...items.map((i) => Math.max(i.value, i.target ?? 0))) * 1.08;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
      {items.map((it, i) => {
        const h = Math.min(it.value / top, 1);
        const over = it.target != null && it.value > it.target * 1.05;
        return (
          <button
            key={it.key}
            onClick={() => onSelect?.(it.key)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 34,
                height,
                borderRadius: 10,
                background: it.active ? "var(--card-3)" : "var(--card-2)",
                overflow: "hidden",
                outline: it.active ? "1.5px solid var(--text-2)" : "none",
                outlineOffset: 3,
              }}
            >
              <motion.div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: `${h * 100}%`,
                  borderRadius: 10,
                  background: it.color ?? color,
                  opacity: it.dim ? 0.45 : 1,
                  transformOrigin: "bottom",
                }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.8, ease, delay: i * 0.05 }}
              />
              {it.target != null && it.target > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 4,
                    right: 4,
                    bottom: `calc(${(it.target / top) * 100}% - 1px)`,
                    height: 2,
                    borderRadius: 2,
                    background: over ? "var(--danger)" : "var(--text)",
                    opacity: 0.85,
                  }}
                />
              )}
            </div>
            <span style={{ fontSize: 12, fontWeight: it.active ? 700 : 500, color: it.active ? "var(--text)" : "var(--text-3)" }}>
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Маленький график без осей для карточек */
export function Sparkline({ values, color, height = 44 }: { values: number[]; color: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const d = useMemo(() => {
    if (values.length < 2 || !w) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return smoothPath(values.map((v, i) => [(i / (values.length - 1)) * (w - 8) + 4, 4 + (1 - (v - min) / span) * (height - 8)]));
  }, [values, w, height]);
  return (
    <div ref={ref} style={{ height }}>
      {d && (
        <svg width={w} height={height} style={{ overflow: "visible" }}>
          <motion.path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease }}
          />
        </svg>
      )}
    </div>
  );
}

/** Сетка «привычек»: каждый квадрат — день */
export function Heatmap({ days, color, cols = 10 }: { days: boolean[]; color: string; cols?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
      {days.map((on, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.012, duration: 0.25 }}
          style={{ aspectRatio: "1", borderRadius: 4, background: on ? color : "var(--card-3)" }}
        />
      ))}
    </div>
  );
}

/** Отложенный рендер, чтобы анимации графиков запускались после открытия экрана */
export function useMounted(delay = 0) {
  const [m, setM] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return;
    const t = setTimeout(() => setM(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return m;
}
