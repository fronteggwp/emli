import { useState } from "react";
import { Check, Trash } from "lucide-react";
import { useDay } from "@/state/day";
import { useLayer, useNav } from "@/nav/Nav";
import { useDeleteFood, useSaveFood } from "@/data/api";
import { kcalOfMacros } from "@/lib/nutrition";
import { parseNum } from "@/lib/hooks";
import { confirmDialog, haptic } from "@/lib/telegram";
import type { Food, FoodDraft, Meal } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { FoodDetailSheet } from "./FoodDetail";
import "./sheets.css";

const str = (n: number | null | undefined) => (n || n === 0 ? String(n) : "");

/** Создание или редактирование своего продукта (значения с этикетки на 100 г) */
export function CreateFoodSheet({
  food,
  name: name0,
  barcode,
  meal,
  onDone,
}: {
  food?: Food | FoodDraft;
  name?: string;
  barcode?: string;
  meal?: Meal;
  onDone?: () => void;
}) {
  const { day } = useDay();
  const nav = useNav();
  const layer = useLayer();
  const toast = useToast();
  const save = useSaveFood();
  const remove = useDeleteFood();
  const editing = !!(food && "id" in food && food.id);

  const [name, setName] = useState(food?.name ?? name0 ?? "");
  const [brand, setBrand] = useState(food?.brand ?? "");
  const [kcal, setKcal] = useState(str(food?.kcal));
  const [p, setP] = useState(str(food?.protein));
  const [f, setF] = useState(str(food?.fat));
  const [c, setC] = useState(str(food?.carbs));
  const [servingG, setServingG] = useState(str(food?.serving_g));
  const [servingName, setServingName] = useState(food?.serving_name ?? "");

  const fromMacros = kcalOfMacros(parseNum(p), parseNum(f), parseNum(c));
  const kcalValue = kcal ? parseNum(kcal) : fromMacros;
  const valid = name.trim().length > 0 && kcalValue > 0;

  const submit = async () => {
    if (!valid) return;
    const draft: FoodDraft = {
      ...(editing ? { id: (food as Food).id } : {}),
      name: name.trim(),
      brand: brand.trim() || null,
      barcode: food?.barcode ?? barcode ?? null,
      category: null,
      kcal: Math.round(kcalValue),
      protein: parseNum(p),
      fat: parseNum(f),
      carbs: parseNum(c),
      serving_g: parseNum(servingG) || null,
      serving_name: parseNum(servingG) ? servingName.trim() || "порция" : null,
      source: food?.source === "off" ? "off" : "user",
    };
    try {
      const saved = await save.mutateAsync(draft);
      haptic.success();
      toast(editing ? "Продукт обновлён" : "Продукт создан", <Check size={18} color="var(--good)" />);
      layer.close();
      if (!editing && meal !== undefined) nav.sheet(<FoodDetailSheet food={saved} meal={meal} day={day} onDone={onDone} />);
    } catch (e) {
      haptic.error();
      toast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const num = (label: string, value: string, set: (s: string) => void, color?: string, placeholder = "0") => (
    <div className="field">
      <label>
        {color && <span className="dot" style={{ background: color, width: 6, height: 6, marginRight: 6, verticalAlign: "middle" }} />}
        {label}
      </label>
      <input className="input num" inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => set(e.target.value.replace(/[^\d.,]/g, ""))} />
    </div>
  );

  return (
    <>
      <SheetHeader title={editing ? "Продукт" : "Новый продукт"} />
      <div className="sheet-body stack">
        <div className="field">
          <label>Название</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, сырники мамины" />
        </div>
        <div className="field">
          <label>Бренд (необязательно)</label>
          <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Производитель" />
        </div>
        <div className="group-label" style={{ margin: "8px 2px 0" }}>
          На 100 грамм
        </div>
        {num("Калории", kcal, setKcal, "var(--kcal)", fromMacros ? `${fromMacros} — по БЖУ` : "0")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {num("Белки", p, setP, "var(--protein)")}
          {num("Жиры", f, setF, "var(--fat)")}
          {num("Углеводы", c, setC, "var(--carbs)")}
        </div>
        <div className="group-label" style={{ margin: "8px 2px 0" }}>
          Порция (необязательно)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
          {num("Вес порции, г", servingG, setServingG)}
          <div className="field">
            <label>Название порции</label>
            <input className="input" value={servingName} onChange={(e) => setServingName(e.target.value)} placeholder="шт, кусок, пачка" />
          </div>
        </div>
        {(food?.barcode ?? barcode) && <div className="faint" style={{ fontSize: 13 }}>Штрихкод: {food?.barcode ?? barcode}</div>}
      </div>
      <div className="sheet-foot row">
        {editing && (
          <Tap
            className="icon-btn btn-danger"
            style={{ width: 54, height: 54 }}
            onClick={async () => {
              if (!(await confirmDialog("Удалить продукт? Записи в дневнике останутся."))) return;
              haptic.rigid();
              remove.mutate((food as Food).id);
              toast("Продукт удалён");
              layer.close();
            }}
          >
            <Trash size={20} />
          </Tap>
        )}
        <Tap className="btn btn-accent btn-block" disabled={!valid || save.isPending} onClick={submit}>
          {editing ? "Сохранить" : meal !== undefined ? "Создать и добавить" : "Создать"}
        </Tap>
      </div>
    </>
  );
}
