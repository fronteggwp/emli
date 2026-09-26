import { useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useLayer } from "@/nav/Nav";
import { useInsights } from "@/data/insights";
import { useSaveTargets, useSettings } from "@/data/api";
import { todayKey } from "@/lib/dates";
import { caloriesFor, kcalOfMacros, macrosFor } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { SheetHeader } from "@/ui/Screen";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "./sheets.css";

/** Ручная настройка БЖУ: калории считаются из макросов автоматически */
export function EditProgramSheet() {
  const layer = useLayer();
  const toast = useToast();
  const ins = useInsights();
  const settings = useSettings();
  const save = useSaveTargets();
  const t = ins.target;
  const [p, setP] = useState(t?.protein ?? 120);
  const [f, setF] = useState(t?.fat ?? 60);
  const [c, setC] = useState(t?.carbs ?? 200);
  const kcal = kcalOfMacros(p, f, c);

  const reset = () => {
    haptic.tap();
    const g = ins.goal;
    const calories = caloriesFor(ins.tdee.value, g?.rate_kg_week ?? 0, settings.data?.sex ?? "male");
    const m = macrosFor(calories, ins.current ?? 75, g?.kind ?? "maintain");
    setP(m.protein);
    setF(m.fat);
    setC(m.carbs);
  };

  const row = (label: string, color: string, value: number, set: (n: number) => void, step: number) => (
    <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
      <span className="dot" style={{ background: color, width: 10, height: 10 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div className="faint" style={{ fontSize: 12 }}>
          {Math.round((value * (label === "Жиры" ? 9 : 4) * 100) / Math.max(kcal, 1))}% калорий
        </div>
      </div>
      <Tap
        className="icon-btn"
        style={{ width: 40, height: 40 }}
        onClick={() => {
          haptic.select();
          set(Math.max(0, value - step));
        }}
      >
        <Minus size={18} />
      </Tap>
      <input
        className="num"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")) || 0)}
        style={{ width: 56, textAlign: "center", fontSize: 22, fontWeight: 800, background: "none", border: 0, outline: "none" }}
      />
      <Tap
        className="icon-btn"
        style={{ width: 40, height: 40 }}
        onClick={() => {
          haptic.select();
          set(value + step);
        }}
      >
        <Plus size={18} />
      </Tap>
    </div>
  );

  return (
    <>
      <SheetHeader
        title="Программа"
        right={
          <Tap className="icon-btn" onClick={reset} aria-label="Рассчитать заново">
            <RotateCcw size={17} />
          </Tap>
        }
      />
      <div className="sheet-body stack">
        <div style={{ textAlign: "center", padding: "4px 0 8px" }}>
          <div className="num" style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em" }}>
            <NumberTicker value={kcal} duration={0.3} />
          </div>
          <div className="muted" style={{ fontSize: 14 }}>
            ккал в день
          </div>
        </div>
        {row("Белки", "var(--protein)", p, setP, 5)}
        {row("Жиры", "var(--fat)", f, setF, 5)}
        {row("Углеводы", "var(--carbs)", c, setC, 10)}
        <p className="faint" style={{ fontSize: 13, margin: "4px 4px 0" }}>
          Кнопка ↻ вверху рассчитает БЖУ заново по твоей цели и расходу.
        </p>
      </div>
      <div className="sheet-foot">
        <Tap
          className="btn btn-accent btn-block"
          disabled={kcal < 800}
          onClick={async () => {
            haptic.success();
            await save.mutateAsync({ start_date: todayKey(), calories: kcal, protein: p, fat: f, carbs: c, tdee: ins.tdee.value });
            toast("Программа сохранена");
            layer.close();
          }}
        >
          Сохранить
        </Tap>
      </div>
    </>
  );
}
