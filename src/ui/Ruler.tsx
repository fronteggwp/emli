import { useEffect, useLayoutEffect, useRef } from "react";
import { haptic } from "@/lib/telegram";

const TICK = 10; // px на одно деление

/**
 * Горизонтальная «линейка» для выбора числа пальцем — с вибро-щелчками на каждом делении.
 */
export function Ruler({
  min,
  max,
  step,
  value,
  onChange,
  majorEvery = 10,
  labelDigits = 0,
  color = "var(--kcal)",
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  majorEvery?: number;
  labelDigits?: number;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(value);
  const internal = useRef(false);
  const settle = useRef<number | undefined>(undefined);
  const count = Math.round((max - min) / step);
  const toX = (v: number) => Math.round((v - min) / step) * TICK;
  const fromX = (x: number) => {
    const i = Math.min(Math.max(Math.round(x / TICK), 0), count);
    return Math.round((min + i * step) * 1000) / 1000;
  };

  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollLeft = toX(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Внешнее изменение значения (кнопки +/−) — докручиваем линейку
  useEffect(() => {
    if (internal.current) {
      internal.current = false;
      return;
    }
    const el = ref.current;
    if (el && Math.abs(el.scrollLeft - toX(value)) > 1) el.scrollTo({ left: toX(value), behavior: "smooth" });
    last.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const onScroll = () => {
    const el = ref.current!;
    const v = fromX(el.scrollLeft);
    if (v !== last.current) {
      last.current = v;
      internal.current = true;
      haptic.select();
      onChange(v);
    }
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const target = toX(fromX(el.scrollLeft));
      if (Math.abs(el.scrollLeft - target) > 0.5) el.scrollTo({ left: target, behavior: "smooth" });
    }, 110);
  };

  // Крупные деления — на «круглых» значениях (15, 20, 25…), а не от минимума
  const majorStep = majorEvery * step;
  const offset = Math.round((Math.ceil(min / majorStep - 1e-9) * majorStep - min) / step) % majorEvery;
  const labels = [];
  for (let i = offset; i <= count; i += majorEvery) {
    labels.push(
      <span
        key={i}
        className="num"
        style={{
          position: "absolute",
          left: i * TICK,
          top: 46,
          transform: "translateX(-50%)",
          fontSize: 13,
          color: "var(--text-3)",
        }}
      >
        {(min + i * step).toFixed(labelDigits)}
      </span>,
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="no-scrollbar"
        style={{
          overflowX: "scroll",
          overflowY: "hidden",
          height: 72,
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent)",
          maskImage: "linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent)",
          touchAction: "pan-x",
        }}
      >
        <div style={{ display: "flex", height: "100%" }}>
          <div style={{ flex: "0 0 50%" }} />
          <div
            style={{
              position: "relative",
              flex: `0 0 ${count * TICK + 2}px`,
              height: "100%",
              backgroundImage: `repeating-linear-gradient(90deg, var(--text-2) 0 2px, transparent 2px ${TICK * majorEvery}px),
                 repeating-linear-gradient(90deg, var(--text-3) 0 1px, transparent 1px ${TICK}px)`,
              backgroundSize: `100% 34px, 100% 18px`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: `${offset * TICK - 1}px 4px, 0 12px`,
            }}
          >
            {labels}
          </div>
          <div style={{ flex: "0 0 50%" }} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: 4,
          height: 44,
          marginLeft: -2,
          borderRadius: 2,
          background: color,
          boxShadow: `0 0 16px ${color}`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
