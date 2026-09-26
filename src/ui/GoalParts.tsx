import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { GoalKind } from "@/lib/types";
import { RATES, fmtKg } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { Tap } from "./Tap";

export const KINDS: { v: GoalKind; emoji: string; title: string; desc: string }[] = [
  { v: "lose", emoji: "🔥", title: "Похудеть", desc: "Снизить вес и сохранить мышцы" },
  { v: "maintain", emoji: "⚖️", title: "Держать вес", desc: "Питаться сбалансированно" },
  { v: "gain", emoji: "💪", title: "Набрать массу", desc: "Расти с минимумом жира" },
];

export function OptionCard({
  on,
  onClick,
  emoji,
  title,
  desc,
  right,
}: {
  on: boolean;
  onClick: () => void;
  emoji?: string;
  title: string;
  desc?: string;
  right?: React.ReactNode;
}) {
  return (
    <Tap
      scale={0.98}
      onClick={() => {
        haptic.select();
        onClick();
      }}
      className="option-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        textAlign: "left",
        padding: "16px 16px",
        borderRadius: 20,
        background: on ? "var(--card-2)" : "var(--card)",
        border: `1.5px solid ${on ? "var(--kcal)" : "var(--line)"}`,
        transition: "background .2s, border-color .2s",
      }}
    >
      {emoji && <span style={{ fontSize: 26, width: 34, textAlign: "center" }}>{emoji}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 650 }}>{title}</div>
        {desc && <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>{desc}</div>}
      </span>
      {right}
      <motion.span
        animate={{ scale: on ? 1 : 0.6, opacity: on ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        style={{ width: 24, height: 24, borderRadius: 12, background: "var(--kcal)", display: "grid", placeItems: "center", flexShrink: 0 }}
      >
        <Check size={15} strokeWidth={3} color="#fff" />
      </motion.span>
    </Tap>
  );
}

export function KindPicker({ value, onChange }: { value: GoalKind; onChange: (k: GoalKind) => void }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {KINDS.map((k) => (
        <OptionCard key={k.v} on={value === k.v} onClick={() => onChange(k.v)} emoji={k.emoji} title={k.title} desc={k.desc} />
      ))}
    </div>
  );
}

/** Выбор темпа: показываем кг/нед для текущего веса */
export function RatePicker({
  kind,
  weight,
  pct,
  onChange,
}: {
  kind: Exclude<GoalKind, "maintain">;
  weight: number;
  pct: number;
  onChange: (pct: number) => void;
}) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {RATES[kind].map((r) => (
        <OptionCard
          key={r.key}
          on={Math.abs(pct - r.pct) < 0.001}
          onClick={() => onChange(r.pct)}
          title={r.title}
          desc={r.hint}
          right={
            <span className="num" style={{ fontWeight: 700, fontSize: 15, color: "var(--text-2)", whiteSpace: "nowrap" }}>
              {kind === "lose" ? "−" : "+"}
              {fmtKg((weight * r.pct) / 100)} кг/нед
            </span>
          }
        />
      ))}
    </div>
  );
}
