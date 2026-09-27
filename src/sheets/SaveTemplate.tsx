import { useState } from "react";
import { Check } from "lucide-react";
import { useLayer } from "@/nav/Nav";
import { templateTotal, useSaveTemplate, type TemplateItem } from "@/data/engage";
import { MEALS, fmtNum } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { Entry, Meal } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "./sheets.css";

const EMOJIS = ["🍽️", "🥣", "🍳", "🥪", "🍱", "🥗", "🍝", "🍗", "🥤", "🍎"];
const NAMES = ["Мой завтрак", "Мой обед", "Мой ужин", "Мой перекус"];

/** Сохранить продукты приёма пищи как «Мой приём» — потом добавляется в один тап */
export function SaveTemplateSheet({ entries, meal }: { entries: Entry[]; meal: Meal }) {
  const layer = useLayer();
  const toast = useToast();
  const save = useSaveTemplate();
  const [name, setName] = useState(NAMES[meal]);
  const [emoji, setEmoji] = useState(["🍳", "🍲", "🍝", "🍎"][meal] ?? "🍽️");
  const [picked, setPicked] = useState<Set<string>>(new Set(entries.map((e) => e.id)));

  const items: TemplateItem[] = entries
    .filter((e) => picked.has(e.id))
    .map((e) => ({ food_id: e.food_id, name: e.name, brand: e.brand, grams: e.grams, kcal: e.kcal, protein: e.protein, fat: e.fat, carbs: e.carbs }));
  const t = templateTotal(items);

  const submit = async () => {
    if (!items.length || !name.trim()) return;
    haptic.success();
    await save.mutateAsync({ name: name.trim(), emoji, items });
    toast("Сохранено в «Мои приёмы» ⭐");
    layer.close();
  };

  return (
    <>
      <SheetHeader title="Мой приём пищи" />
      <div className="sheet-body">
        <div className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
          Сохрани этот набор — в следующий раз он добавится одним нажатием.
        </div>
        <div className="chips-row" style={{ margin: "0 -16px", padding: "0 16px" }}>
          {EMOJIS.map((e) => (
            <Tap key={e} className={`chip ${emoji === e ? "on" : ""}`} style={{ width: 44, padding: 0, justifyContent: "center", fontSize: 20 }} onClick={() => (haptic.select(), setEmoji(e))}>
              {e}
            </Tap>
          ))}
        </div>
        <input className="input" style={{ marginTop: 10 }} value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder={`Например: ${MEALS[meal].name} как обычно`} />

        <div className="group-label">Что входит</div>
        <div className="list">
          {entries.map((e) => {
            const on = picked.has(e.id);
            return (
              <button
                key={e.id}
                className="food-row press"
                style={{ padding: "12px 14px" }}
                onClick={() => {
                  haptic.select();
                  setPicked((s) => {
                    const n = new Set(s);
                    if (n.has(e.id)) n.delete(e.id);
                    else n.add(e.id);
                    return n;
                  });
                }}
              >
                <span className={`pick-check ${on ? "on" : ""}`} style={{ marginRight: 12 }}>
                  {on && <Check size={15} strokeWidth={3} color="#fff" />}
                </span>
                <div style={{ flex: 1, minWidth: 0, opacity: on ? 1 : 0.5 }}>
                  <div className="food-row-name">{e.name}</div>
                  <div className="food-row-sub">{e.grams ? `${fmtNum(e.grams)} г` : "быстрая запись"}</div>
                </div>
                <div className="food-row-kcal num" style={{ opacity: on ? 1 : 0.5 }}>
                  {fmtNum(e.kcal)}
                </div>
              </button>
            );
          })}
        </div>

        <Tap className="btn btn-block btn-accent" style={{ marginTop: 18 }} disabled={!items.length || !name.trim() || save.isPending} onClick={submit}>
          Сохранить · {fmtNum(t.kcal)} ккал
        </Tap>
      </div>
    </>
  );
}
