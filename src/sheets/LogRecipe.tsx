import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { useLayer } from "@/nav/Nav";
import { useDay } from "@/state/day";
import { useLogItems, type TemplateItem } from "@/data/engage";
import { MEALS, fmtNum, mealByTime } from "@/lib/nutrition";
import { dayTitle } from "@/lib/dates";
import { haptic } from "@/lib/telegram";
import type { Macros, Meal } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "./sheets.css";
import "@/pages/recipes.css";

/** Сколько порций блюда съедено и в какой приём */
export function LogRecipeSheet({
  title,
  emoji,
  serving,
  toItem,
  meal: meal0,
  onDone,
}: {
  title: string;
  emoji: string;
  serving: Macros & { grams: number };
  toItem: (portions: number) => TemplateItem;
  meal?: Meal;
  onDone?: () => void;
}) {
  const layer = useLayer();
  const { day } = useDay();
  const toast = useToast();
  const log = useLogItems();
  const [meal, setMeal] = useState<Meal>(meal0 ?? (mealByTime() as Meal));
  const [p, setP] = useState(1);
  const bump = (d: number) => {
    haptic.select();
    setP((x) => Math.min(10, Math.max(0.5, Math.round((x + d) * 2) / 2)));
  };
  const submit = () => {
    haptic.success();
    const item = toItem(p);
    log.mutate({ items: [item], day, meal });
    toast(`${MEALS[meal].name}: +${fmtNum(item.kcal)} ккал`, <Check size={18} color="var(--good)" />);
    layer.close();
    onDone?.();
  };

  return (
    <>
      <SheetHeader title="В дневник" />
      <div className="sheet-body">
        <div className="row" style={{ gap: 12 }}>
          <span style={{ fontSize: 40 }}>{emoji}</span>
          <div style={{ minWidth: 0 }}>
            <div className="fd-title" style={{ fontSize: 20 }}>{title}</div>
            <div className="fd-brand">{dayTitle(day)}</div>
          </div>
        </div>

        <div className="chips-row" style={{ margin: "16px -16px 0", padding: "0 16px" }}>
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

        <div className="lr-amount">
          <Tap className="icon-btn" style={{ width: 52, height: 52 }} onClick={() => bump(-0.5)} aria-label="Меньше">
            <Minus size={22} />
          </Tap>
          <div style={{ textAlign: "center" }}>
            <div className="num" style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>
              {p.toLocaleString("ru-RU")}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {p === 1 ? "порция" : p < 5 && p % 1 === 0 ? "порции" : "порций"}
              {serving.grams ? ` · ≈ ${fmtNum(serving.grams * p)} г` : ""}
            </div>
          </div>
          <Tap className="icon-btn" style={{ width: 52, height: 52 }} onClick={() => bump(0.5)} aria-label="Больше">
            <Plus size={22} />
          </Tap>
        </div>

        <div className="fd-macros">
          <div className="fd-macro" style={{ background: "linear-gradient(135deg, rgba(124,140,255,.22), rgba(179,136,255,.12))" }}>
            <div className="v">
              <NumberTicker value={Math.round(serving.kcal * p)} duration={0.35} />
            </div>
            <div className="l">ккал</div>
          </div>
          {(
            [
              ["protein", "Белки", "var(--protein)"],
              ["fat", "Жиры", "var(--fat)"],
              ["carbs", "Углев.", "var(--carbs)"],
            ] as const
          ).map(([k, l, c]) => (
            <div className="fd-macro" key={k}>
              <div className="v">
                <NumberTicker value={Math.round(serving[k] * p)} duration={0.35} />
              </div>
              <div className="l">
                <span className="dot" style={{ background: c, width: 6, height: 6 }} />
                {l}
              </div>
            </div>
          ))}
        </div>

        <Tap className="btn btn-block btn-accent" style={{ marginTop: 20 }} onClick={submit}>
          Добавить · {fmtNum(serving.kcal * p)} ккал
        </Tap>
      </div>
    </>
  );
}
