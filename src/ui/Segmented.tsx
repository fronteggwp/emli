import { useId } from "react";
import { motion } from "motion/react";
import { haptic } from "@/lib/telegram";

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const id = useId();
  const h = size === "sm" ? 34 : 42;
  return (
    <div
      style={{
        display: "flex",
        background: "var(--card-2)",
        borderRadius: 999,
        padding: 3,
        gap: 2,
        height: h,
        position: "relative",
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            onClick={() => {
              if (!on) {
                haptic.select();
                onChange(o.value);
              }
            }}
            style={{
              flex: 1,
              position: "relative",
              borderRadius: 999,
              fontSize: size === "sm" ? 13 : 15,
              fontWeight: 600,
              color: on ? "var(--text-inv)" : "var(--text-2)",
              transition: "color .25s",
              padding: "0 10px",
              whiteSpace: "nowrap",
            }}
          >
            {on && (
              <motion.span
                layoutId={id}
                style={{ position: "absolute", inset: 0, background: "var(--text)", borderRadius: 999 }}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span style={{ position: "relative" }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
