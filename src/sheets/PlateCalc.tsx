import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { parseNum } from "@/lib/hooks";
import { haptic } from "@/lib/telegram";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import "./sheets.css";
import "@/pages/workouts.css";

// Цвета блинов по стандарту IWF
const PLATES: { kg: number; color: string; h: number; w: number; text: string }[] = [
  { kg: 25, color: "#e53935", h: 100, w: 15, text: "#fff" },
  { kg: 20, color: "#1e6fd9", h: 100, w: 13, text: "#fff" },
  { kg: 15, color: "#f2c230", h: 92, w: 12, text: "#222" },
  { kg: 10, color: "#2e9e57", h: 82, w: 11, text: "#fff" },
  { kg: 5, color: "#f1f1f1", h: 64, w: 9, text: "#222" },
  { kg: 2.5, color: "#3b3b44", h: 52, w: 8, text: "#fff" },
  { kg: 1.25, color: "#b9bcc6", h: 44, w: 7, text: "#222" },
];
const BARS = [20, 15, 10, 0];
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export function platesFor(total: number, bar: number, enabled: number[]) {
  let side = Math.max(0, (total - bar) / 2);
  const out: number[] = [];
  for (const p of [...enabled].sort((a, b) => b - a)) {
    while (side >= p - 1e-9) {
      out.push(p);
      side -= p;
    }
  }
  return { plates: out, rest: Math.round(side * 2 * 100) / 100 };
}

/** Какие блины повесить на штангу, чтобы получить нужный вес */
export function PlateCalcSheet({ weight: w0 }: { weight?: number }) {
  const [w, setW] = useState(String(w0 && w0 > 0 ? w0 : 60));
  const [bar, setBar] = useState(20);
  const [enabled, setEnabled] = useState<number[]>(PLATES.map((p) => p.kg));
  const total = parseNum(w);
  const res = useMemo(() => platesFor(total, bar, enabled), [total, bar, enabled]);
  const loaded = total - res.rest;

  const bump = (d: number) => {
    haptic.select();
    setW((x) => String(Math.max(0, Math.round((parseNum(x) + d) * 100) / 100)));
  };

  return (
    <>
      <SheetHeader title="Калькулятор блинов" />
      <div className="sheet-body">
        <div className="amount">
          <Tap className="icon-btn" style={{ width: 52, height: 52 }} onClick={() => bump(-2.5)} aria-label="Меньше">
            <Minus size={22} />
          </Tap>
          <label className="amount-input">
            <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value.replace(/[^\d.,]/g, ""))} />
            <span>кг</span>
          </label>
          <Tap className="icon-btn" style={{ width: 52, height: 52 }} onClick={() => bump(2.5)} aria-label="Больше">
            <Plus size={22} />
          </Tap>
        </div>

        <div className="group-label">Гриф</div>
        <div className="row" style={{ gap: 6 }}>
          {BARS.map((b) => (
            <Tap key={b} className={`chip ${bar === b ? "on" : ""}`} style={{ flex: 1, justifyContent: "center" }} onClick={() => (haptic.select(), setBar(b))}>
              {b ? `${b} кг` : "Без грифа"}
            </Tap>
          ))}
        </div>

        <div className="barbell">
          <div className="barbell-bar" />
          <div className="barbell-sleeve" />
          <div className="barbell-plates">
            <AnimatePresence initial={false}>
              {res.plates.map((p, i) => {
                const s = PLATES.find((x) => x.kg === p)!;
                return (
                  <motion.div
                    key={`${i}-${p}`}
                    className="plate"
                    style={{ height: s.h, width: s.w * 2, background: s.color, color: s.text }}
                    initial={{ x: 60, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 60, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 34 }}
                  >
                    <span>{fmt(p)}</span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        <div className="plate-summary">
          {res.plates.length ? (
            <>
              <div className="muted" style={{ fontSize: 13 }}>
                На каждую сторону
              </div>
              <div className="plate-list">{res.plates.map((p) => fmt(p)).join(" + ")} кг</div>
            </>
          ) : (
            <div className="muted">{total <= bar ? "Хватит одного грифа" : "Выбери блины ниже"}</div>
          )}
          {res.rest > 0 && total > bar && (
            <div style={{ color: "var(--fat)", fontSize: 13, marginTop: 6 }}>
              Точно не собрать — ближайший вес {fmt(loaded)} кг
            </div>
          )}
        </div>

        <div className="group-label">Есть в зале</div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {PLATES.map((p) => {
            const on = enabled.includes(p.kg);
            return (
              <Tap
                key={p.kg}
                className="plate-toggle"
                style={{ background: on ? p.color : "var(--card-2)", color: on ? p.text : "var(--text-3)" }}
                onClick={() => {
                  haptic.select();
                  setEnabled((l) => (on ? l.filter((x) => x !== p.kg) : [...l, p.kg]));
                }}
              >
                {fmt(p.kg)}
              </Tap>
            );
          })}
        </div>
      </div>
    </>
  );
}
