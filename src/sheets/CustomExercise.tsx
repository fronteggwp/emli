import { useState } from "react";
import { useLayer } from "@/nav/Nav";
import { useCreateCustomExercise } from "@/data/workouts";
import { CATEGORY_RU, EQUIPMENT_RU, MUSCLE_RU, type Equipment, type Muscle } from "@/lib/exercise";
import { haptic } from "@/lib/telegram";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";

/** Своё упражнение — если чего-то нет в базе */
export function CustomExerciseSheet() {
  const layer = useLayer();
  const toast = useToast();
  const create = useCreateCustomExercise();
  const [name, setName] = useState("");
  const [equip, setEquip] = useState<Equipment | null>("barbell");
  const [cat, setCat] = useState<"strength" | "cardio" | "stretching">("strength");
  const [muscles, setMuscles] = useState<Muscle[]>([]);

  return (
    <>
      <SheetHeader title="Своё упражнение" />
      <div className="sheet-body stack">
        <div className="field">
          <label>Название</label>
          <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Например, жим в хаммере" />
        </div>
        <div className="group-label" style={{ margin: "4px 2px 0" }}>
          Тип
        </div>
        <div className="chips-row" style={{ padding: 0 }}>
          {(["strength", "cardio", "stretching"] as const).map((c) => (
            <Tap key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>
              {CATEGORY_RU[c]}
            </Tap>
          ))}
        </div>
        <div className="group-label" style={{ margin: "4px 2px 0" }}>
          Оборудование
        </div>
        <div className="chips-row" style={{ padding: 0, flexWrap: "wrap" }}>
          {(Object.keys(EQUIPMENT_RU) as Equipment[]).map((e) => (
            <Tap key={e} className={`chip ${equip === e ? "on" : ""}`} onClick={() => setEquip(e)}>
              {EQUIPMENT_RU[e]}
            </Tap>
          ))}
        </div>
        <div className="group-label" style={{ margin: "4px 2px 0" }}>
          Какие мышцы работают
        </div>
        <div className="chips-row" style={{ padding: 0, flexWrap: "wrap" }}>
          {(Object.keys(MUSCLE_RU) as Muscle[]).map((m) => (
            <Tap
              key={m}
              className={`chip ${muscles.includes(m) ? "on" : ""}`}
              onClick={() => {
                haptic.select();
                setMuscles((l) => (l.includes(m) ? l.filter((x) => x !== m) : [...l, m]));
              }}
            >
              {MUSCLE_RU[m]}
            </Tap>
          ))}
        </div>
      </div>
      <div className="sheet-foot">
        <Tap
          className="btn btn-accent btn-block"
          disabled={!name.trim() || create.isPending}
          onClick={async () => {
            await create.mutateAsync({ name: name.trim(), category: cat, equipment: equip, muscles });
            haptic.success();
            toast("Упражнение создано");
            layer.close();
          }}
        >
          Создать
        </Tap>
      </div>
    </>
  );
}
