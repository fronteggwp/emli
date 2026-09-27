import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useLayer } from "@/nav/Nav";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { haptic } from "@/lib/telegram";
import { fmtNum } from "@/lib/nutrition";
import { allowed, fitsMeal, type Dish, type PlanPrefs } from "@/lib/mealplan";
import type { Meal } from "@/lib/types";
import { useDishes } from "@/data/mealplan";
import "./mealplan.css";

type Cat = "fit" | "basic" | "breakfast" | "main" | "soup" | "salad" | "side" | "snack" | "dessert" | "mine";
const CATS: { id: Cat; label: string }[] = [
  { id: "fit", label: "Подходит" },
  { id: "basic", label: "⚡ Простые" },
  { id: "mine", label: "👤 Мои" },
  { id: "breakfast", label: "Завтраки" },
  { id: "main", label: "Горячее" },
  { id: "soup", label: "Супы" },
  { id: "salad", label: "Салаты" },
  { id: "side", label: "Гарниры" },
  { id: "snack", label: "Перекусы" },
  { id: "dessert", label: "Десерты" },
];
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** Выбор блюда для плана: поиск, категории, по умолчанию — подходящие к приёму и ограничениям */
export function PlanPickerSheet({ meal, title, prefs, onPick }: { meal: Meal; title: string; prefs: PlanPrefs; onPick: (d: Dish) => void }) {
  const layer = useLayer();
  const { map } = useDishes();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Cat>("fit");
  const list = useMemo(() => {
    if (!map) return [];
    const t = norm(q.trim());
    return [...map.values()]
      .filter((d) => d.category !== "drink")
      .filter((d) => {
        if (t) return norm(d.title).includes(t) || d.ingredients.some((i) => norm(i.name).includes(t));
        if (cat === "fit") return fitsMeal(d, meal) && allowed(d, prefs.exclude);
        if (cat === "basic") return !!d.basic;
        if (cat === "mine") return d.kind === "mine";
        return !d.basic && d.kind === "recipe" && d.category === cat;
      })
      .sort((a, b) => Number(!!b.basic && cat === "fit") - Number(!!a.basic && cat === "fit") || a.title.localeCompare(b.title, "ru"))
      .slice(0, 120);
  }, [map, q, cat, meal, prefs.exclude]);

  return (
    <>
      <SheetHeader title={title} />
      <div className="sheet-body">
        <div className="search-box" style={{ margin: "0 0 10px" }}>
          <Search size={19} className="faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Блюдо или продукт" enterKeyHint="search" autoComplete="off" />
          {q && (
            <button className="icon-btn" onClick={() => setQ("")} aria-label="Очистить">
              <X size={16} />
            </button>
          )}
        </div>
        {!q && (
          <div className="chips-row" style={{ margin: "0 -16px 10px", padding: "0 16px" }}>
            {CATS.map((c) => (
              <Tap key={c.id} className={`chip ${cat === c.id ? "on" : ""}`} onClick={() => (haptic.select(), setCat(c.id))}>
                {c.label}
              </Tap>
            ))}
          </div>
        )}
        {!map && <div className="skeleton" style={{ height: 240, borderRadius: 20 }} />}
        {map && !list.length && <div className="empty">{cat === "mine" && !q ? "Своих рецептов пока нет — их можно создать в «Рецептах»" : "Ничего не нашлось"}</div>}
        <div className="stack" style={{ gap: 6 }}>
          {list.map((d) => (
            <Tap
              key={d.kind + d.ref}
              className="mp-pick"
              scale={0.98}
              onClick={() => {
                haptic.select();
                onPick(d);
                layer.close();
              }}
            >
              <span className="mp-thumb">{d.img ? <img src={d.img} alt="" loading="lazy" /> : <span className="mp-thumb-emoji">{d.emoji}</span>}</span>
              <span className="mp-pick-text">
                <b>{d.title}</b>
                <span className="num">
                  {fmtNum(d.serving.kcal)} ккал · Б {fmtNum(d.serving.protein)} г на порцию{d.time ? ` · ${d.time} мин` : ""}
                </span>
              </span>
              {!allowed(d, prefs.exclude) && <span className="mp-badge warn">не по фильтрам</span>}
            </Tap>
          ))}
        </div>
      </div>
    </>
  );
}
