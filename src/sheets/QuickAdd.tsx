import { useState } from "react";
import { Check, Trash } from "lucide-react";
import { useDay } from "@/state/day";
import { useLayer } from "@/nav/Nav";
import { useAddEntry, useDeleteEntry, useUpdateEntry } from "@/data/api";
import { MEALS, fmtNum, kcalOfMacros } from "@/lib/nutrition";
import { parseNum } from "@/lib/hooks";
import { haptic } from "@/lib/telegram";
import type { Entry, Meal, RecentFood } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "./sheets.css";

const str = (n: number | undefined | null) => (n ? String(n) : "");

/** Быстрая запись: просто калории и БЖУ, без продукта */
export function QuickAddSheet({ meal: meal0, entry, preset }: { meal?: Meal; entry?: Entry; preset?: RecentFood }) {
  const { day } = useDay();
  const layer = useLayer();
  const toast = useToast();
  const add = useAddEntry();
  const update = useUpdateEntry();
  const del = useDeleteEntry();
  const src = entry ?? preset;
  const [name, setName] = useState(src?.name && src.name !== "Быстрая запись" ? src.name : "");
  const [kcal, setKcal] = useState(str(src?.kcal));
  const [p, setP] = useState(str(src?.protein));
  const [f, setF] = useState(str(src?.fat));
  const [c, setC] = useState(str(src?.carbs));
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? meal0 ?? 0);

  const fromMacros = kcalOfMacros(parseNum(p), parseNum(f), parseNum(c));
  const kcalValue = kcal ? parseNum(kcal) : fromMacros;

  const submit = async () => {
    if (kcalValue <= 0) return;
    haptic.success();
    const payload = {
      name: name.trim() || "Быстрая запись",
      brand: null,
      grams: null,
      food_id: null,
      kcal: Math.round(kcalValue),
      protein: parseNum(p),
      fat: parseNum(f),
      carbs: parseNum(c),
      meal,
    };
    try {
      if (entry) await update.mutateAsync({ id: entry.id, day: entry.day, patch: payload });
      else await add.mutateAsync({ ...payload, day });
      toast(entry ? "Сохранено" : `${MEALS[meal].name}: +${fmtNum(payload.kcal)} ккал`, <Check size={18} color="var(--good)" />);
      layer.close();
    } catch {
      /* уведомление об ошибке покажет общий обработчик; окно остаётся — можно повторить */
    }
  };

  const field = (label: string, value: string, set: (s: string) => void, color: string, placeholder = "0") => (
    <div className="field">
      <label>
        <span className="dot" style={{ background: color, width: 6, height: 6, marginRight: 6, verticalAlign: "middle" }} />
        {label}
      </label>
      <input
        className="input num"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value.replace(/[^\d.,]/g, ""))}
      />
    </div>
  );

  return (
    <>
      <SheetHeader title={entry ? "Запись" : "Быстрое добавление"} />
      <div className="sheet-body stack">
        <div className="field">
          <label>Название (необязательно)</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, обед в кафе" />
        </div>
        {field("Калории", kcal, setKcal, "var(--kcal)", fromMacros ? `${fromMacros} — по БЖУ` : "0")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {field("Белки, г", p, setP, "var(--protein)")}
          {field("Жиры, г", f, setF, "var(--fat)")}
          {field("Углев., г", c, setC, "var(--carbs)")}
        </div>
        <div className="chips-row" style={{ padding: "4px 0 0" }}>
          {MEALS.map((m) => (
            <Tap
              key={m.id}
              className={`chip ${meal === m.id ? "on" : ""}`}
              onClick={() => {
                haptic.select();
                setMeal(m.id as Meal);
              }}
            >
              {m.emoji} {m.name}
            </Tap>
          ))}
        </div>
      </div>
      <div className="sheet-foot row">
        {entry && (
          <Tap
            className="icon-btn btn-danger"
            style={{ width: 54, height: 54 }}
            onClick={() => {
              haptic.rigid();
              del.mutate({ id: entry.id, day: entry.day });
              toast("Удалено");
              layer.close();
            }}
          >
            <Trash size={20} />
          </Tap>
        )}
        <Tap className="btn btn-accent btn-block" disabled={kcalValue <= 0} onClick={submit}>
          {entry ? "Сохранить" : "Добавить"} {kcalValue > 0 ? `· ${fmtNum(kcalValue)} ккал` : ""}
        </Tap>
      </div>
    </>
  );
}
