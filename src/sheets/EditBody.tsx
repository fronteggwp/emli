import { useState } from "react";
import { useLayer } from "@/nav/Nav";
import { useSaveSettings, useSettings } from "@/data/api";
import { ageFrom, shiftKey, todayKey } from "@/lib/dates";
import { ACTIVITY } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { Sex } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { OptionCard } from "@/ui/GoalParts";
import { Segmented } from "@/ui/Segmented";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "./sheets.css";

export function EditBodySheet() {
  const layer = useLayer();
  const toast = useToast();
  const s = useSettings().data;
  const save = useSaveSettings();
  const [sex, setSex] = useState<Sex>(s?.sex ?? "male");
  const [age, setAge] = useState(String(ageFrom(s?.birth_date ?? null)));
  const [height, setHeight] = useState(String(s?.height_cm ?? 175));
  const [activity, setActivity] = useState(s?.activity ?? 1.375);

  const submit = async () => {
    haptic.success();
    const a = Math.min(Math.max(Number(age) || 30, 12), 100);
    await save.mutateAsync({
      sex,
      birth_date: shiftKey(todayKey(), -Math.round(a * 365.25)),
      height_cm: Math.min(Math.max(Number(height) || 170, 120), 230),
      activity,
    });
    toast("Параметры сохранены");
    layer.close();
  };

  return (
    <>
      <SheetHeader title="Параметры тела" />
      <div className="sheet-body stack">
        <Segmented
          value={sex}
          onChange={setSex}
          options={[
            { value: "male", label: "Мужчина" },
            { value: "female", label: "Женщина" },
          ]}
        />
        <div className="grid-2">
          <div className="field">
            <label>Возраст</label>
            <input className="input num" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="field">
            <label>Рост, см</label>
            <input className="input num" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        <div className="group-label" style={{ margin: "6px 2px 0" }}>
          Активность
        </div>
        {ACTIVITY.map((a) => (
          <OptionCard key={a.v} on={activity === a.v} onClick={() => setActivity(a.v)} title={a.title} desc={a.desc} />
        ))}
      </div>
      <div className="sheet-foot">
        <Tap className="btn btn-accent btn-block" onClick={submit} disabled={save.isPending}>
          Сохранить
        </Tap>
      </div>
    </>
  );
}
