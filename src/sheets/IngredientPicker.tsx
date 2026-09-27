import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Globe, Search, X } from "lucide-react";
import { useLayer } from "@/nav/Nav";
import { useFoodSearch, useRecents } from "@/data/api";
import { offSearch } from "@/data/off";
import type { TemplateItem } from "@/data/engage";
import { useDebounced, parseNum } from "@/lib/hooks";
import { fmtNum, scaleMacros } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { Food, FoodDraft, Macros } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import "./sheets.css";

type Picked = { food: (Food | FoodDraft) & Macros; grams: number };

/** Выбор продукта и граммовки для своего рецепта или приёма пищи */
export function IngredientPickerSheet({ onPick, title = "Ингредиент" }: { onPick: (item: TemplateItem) => void; title?: string }) {
  const layer = useLayer();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const term = useDebounced(q.trim(), 220);
  const offTerm = useDebounced(q.trim(), 450);
  const search = useFoodSearch(term);
  const recents = useRecents();
  const off = useQuery({
    queryKey: ["off", offTerm.toLowerCase()],
    enabled: offTerm.length >= 2,
    queryFn: ({ signal }) => offSearch(offTerm, signal),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus({ preventScroll: true }), 520);
    return () => clearTimeout(t);
  }, []);

  if (picked) return <Amount picked={picked} onBack={() => setPicked(null)} onAdd={(item) => (onPick(item), layer.close())} />;

  const pick = (food: Food | FoodDraft, grams?: number) => {
    haptic.tap();
    setPicked({ food, grams: grams ?? food.serving_g ?? 100 });
  };

  const searching = term.length >= 2;
  return (
    <>
      <SheetHeader title={title} />
      <div className="search-box" data-sheet-drag-ignore>
        <Search size={19} className="faint" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Курица, рис, масло…" enterKeyHint="search" autoComplete="off" />
        {q && (
          <button className="icon-btn" onClick={() => setQ("")}>
            <X size={16} />
          </button>
        )}
      </div>
      <div className="sheet-body">
        {!searching ? (
          <>
            <div className="group-label">Недавние</div>
            {(recents.data ?? [])
              .filter((r) => r.grams)
              .slice(0, 25)
              .map((r) => {
                const k = 100 / (r.grams as number);
                const food: FoodDraft = {
                  name: r.name,
                  brand: r.brand,
                  barcode: null,
                  category: null,
                  kcal: r.kcal * k,
                  protein: r.protein * k,
                  fat: r.fat * k,
                  carbs: r.carbs * k,
                  serving_g: null,
                  serving_name: null,
                  source: "user",
                  id: r.food_id ?? undefined,
                };
                return <Row key={r.name + r.last_used} name={r.name} sub={`${fmtNum(r.grams!)} г · ${fmtNum(r.kcal)} ккал`} onClick={() => pick(food, r.grams!)} />;
              })}
          </>
        ) : (
          <>
            {(search.data ?? []).map((f) => (
              <Row key={f.id} name={f.name} sub={[f.brand, `${fmtNum(f.kcal)} ккал на 100 г`].filter(Boolean).join(" · ")} onClick={() => pick(f)} />
            ))}
            <div className="group-label row" style={{ gap: 6 }}>
              <Globe size={13} /> Open Food Facts
            </div>
            {off.isFetching && !off.data ? (
              <div className="skeleton" style={{ height: 48, marginTop: 6 }} />
            ) : (
              (off.data ?? []).map((f, i) => (
                <Row key={(f.barcode ?? "") + i} name={f.name} sub={[f.brand, `${fmtNum(f.kcal)} ккал на 100 г`].filter(Boolean).join(" · ")} onClick={() => pick(f)} />
              ))
            )}
          </>
        )}
      </div>
    </>
  );
}

function Row({ name, sub, onClick }: { name: string; sub: string; onClick: () => void }) {
  return (
    <button className="food-row press" onClick={onClick}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="food-row-name">{name}</div>
        <div className="food-row-sub">{sub}</div>
      </div>
    </button>
  );
}

function Amount({ picked, onBack, onAdd }: { picked: Picked; onBack: () => void; onAdd: (i: TemplateItem) => void }) {
  const [g, setG] = useState(String(Math.round(picked.grams)));
  const grams = parseNum(g);
  const m = scaleMacros(picked.food, grams);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.select(), 200);
    return () => clearTimeout(t);
  }, []);
  const add = () => {
    if (grams <= 0) return;
    haptic.success();
    onAdd({
      food_id: "id" in picked.food && picked.food.id ? picked.food.id : null,
      name: picked.food.name,
      brand: picked.food.brand,
      grams,
      ...m,
    });
  };
  return (
    <>
      <SheetHeader
        left={
          <button className="icon-btn" onClick={onBack} aria-label="Назад">
            <ChevronLeft size={20} />
          </button>
        }
        title="Сколько грамм"
      />
      <div className="sheet-body">
        <div className="fd-title" style={{ fontSize: 20 }}>{picked.food.name}</div>
        <div className="fd-brand">{fmtNum(picked.food.kcal)} ккал на 100 г</div>
        <div className="amount" style={{ marginTop: 18 }}>
          <label className="amount-input">
            <input
              ref={ref}
              inputMode="decimal"
              value={g}
              onChange={(e) => setG(e.target.value.replace(/[^\d.,]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <span>г</span>
          </label>
        </div>
        <div className="chips-row" style={{ justifyContent: "center", marginTop: 10 }}>
          {[50, 100, 150, 200, 300, 500].map((v) => (
            <Tap key={v} className={`chip ${grams === v ? "on" : ""}`} onClick={() => setG(String(v))}>
              {v}
            </Tap>
          ))}
        </div>
        <div className="muted" style={{ textAlign: "center", marginTop: 14 }}>
          <b className="num" style={{ color: "var(--text)" }}>{fmtNum(m.kcal)}</b> ккал · Б {fmtNum(m.protein)} · Ж {fmtNum(m.fat)} · У {fmtNum(m.carbs)}
        </div>
        <Tap className="btn btn-block btn-accent" style={{ marginTop: 20 }} onClick={add} disabled={grams <= 0}>
          Добавить
        </Tap>
      </div>
    </>
  );
}
