import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLayer } from "@/nav/Nav";
import { useInsights } from "@/data/insights";
import { useSaveGoal, useSaveTargets, useSettings } from "@/data/api";
import { todayKey, ageFrom } from "@/lib/dates";
import { RATES, caloriesFor, fmtKg, fmtNum, macrosFor } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { GoalKind } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { KindPicker, RatePicker } from "@/ui/GoalParts";
import { Ruler } from "@/ui/Ruler";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "./sheets.css";

export function EditGoalSheet() {
  const layer = useLayer();
  const toast = useToast();
  const ins = useInsights();
  const settings = useSettings();
  const saveGoal = useSaveGoal();
  const saveTargets = useSaveTargets();
  const g = ins.goal;
  const weight = ins.current ?? g?.start_weight ?? 75;

  const [kind, setKind] = useState<GoalKind>(g?.kind ?? "lose");
  const [target, setTarget] = useState(g?.target_weight ?? Math.round(weight * 0.9));
  const [pct, setPct] = useState(() => {
    if (!g || g.kind === "maintain") return 0.5;
    return Math.round((Math.abs(g.rate_kg_week) / weight) * 100 * 100) / 100;
  });

  // До 18 лет — только поддержание (формулы дефицита/профицита рассчитаны на взрослых)
  const minor = !!settings.data?.birth_date && ageFrom(settings.data.birth_date) < 18;
  const effKind: GoalKind = minor ? "maintain" : kind;
  const rates = effKind === "maintain" ? [] : RATES[effKind];
  const pctValid = rates.some((r) => Math.abs(r.pct - pct) < 0.001) ? pct : (rates[1]?.pct ?? 0);
  const rate = effKind === "maintain" ? 0 : ((effKind === "lose" ? -1 : 1) * weight * pctValid) / 100;
  const calories = caloriesFor(ins.tdee.value, rate, settings.data?.sex ?? "male");
  const macros = macrosFor(calories, weight, effKind, settings.data?.height_cm, ins.bodyFat);

  const targetOk = effKind === "maintain" || (effKind === "lose" ? target < weight : target > weight);

  const submit = async () => {
    haptic.success();
    await saveGoal.mutateAsync({
      kind: effKind,
      start_date: todayKey(),
      start_weight: Math.round(weight * 100) / 100,
      target_weight: effKind === "maintain" ? null : target,
      rate_kg_week: Math.round(rate * 100) / 100,
    });
    await saveTargets.mutateAsync({ start_date: todayKey(), calories, ...macros, tdee: ins.tdee.value });
    toast("Новая цель сохранена");
    layer.close();
  };

  return (
    <>
      <SheetHeader title="Цель" />
      <div className="sheet-body">
        {minor ? (
          <div className="muted" style={{ fontSize: 14, padding: "4px 2px" }}>
            До 18 лет Emli помогает только держать вес стабильным. Менять вес — вместе с врачом.
          </div>
        ) : (
          <KindPicker value={kind} onChange={setKind} />
        )}
        <AnimatePresence initial={false}>
          {effKind !== "maintain" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
              <div className="group-label">Желаемый вес</div>
              <div className="big-value" style={{ fontSize: 44 }}>
                <NumberTicker value={target} digits={1} duration={0.25} />
                <small>кг</small>
              </div>
              <div style={{ margin: "8px -16px 0" }}>
                <Ruler min={35} max={200} step={0.5} value={target} onChange={setTarget} majorEvery={10} labelDigits={0} color="var(--good)" />
              </div>
              {!targetOk && (
                <div style={{ color: "var(--danger)", fontSize: 13, textAlign: "center", marginTop: 6 }}>
                  {kind === "lose" ? "Цель должна быть меньше текущего веса" : "Цель должна быть больше текущего веса"} ({fmtKg(weight)} кг)
                </div>
              )}
              <div className="group-label">Темп</div>
              <RatePicker kind={effKind as "lose" | "gain"} weight={weight} pct={pctValid} onChange={setPct} />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Новая норма
          </div>
          <div className="num" style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>
            <NumberTicker value={calories} /> <span style={{ fontSize: 16, color: "var(--text-2)" }}>ккал</span>
          </div>
          <div className="muted num" style={{ fontSize: 14, marginTop: 4 }}>
            Б {macros.protein} · Ж {macros.fat} · У {macros.carbs} · расход {fmtNum(ins.tdee.value)}
          </div>
        </div>
      </div>
      <div className="sheet-foot">
        <Tap className="btn btn-accent btn-block" disabled={!targetOk || saveGoal.isPending} onClick={submit}>
          Сохранить цель
        </Tap>
      </div>
    </>
  );
}
