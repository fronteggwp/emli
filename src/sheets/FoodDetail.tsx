import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check, Minus, Pencil, Plus, Trash } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLayer, useNav } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { getFood, useAddEntry, useDeleteEntry, useSaveFood, useUpdateEntry } from "@/data/api";
import { MEALS, fmtNum, scaleMacros } from "@/lib/nutrition";
import { dayTitle } from "@/lib/dates";
import { parseNum } from "@/lib/hooks";
import { haptic } from "@/lib/telegram";
import type { Entry, Food, FoodDraft, Macros, Meal } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { CreateFoodSheet } from "./CreateFood";
import { FavButton } from "@/ui/FavButton";
import "@/pages/engage.css";
import "./sheets.css";

type Props =
  | { food: Food | FoodDraft; meal: Meal; day: string; grams?: number; onDone?: () => void; entry?: undefined }
  | { entry: Entry; food?: undefined; meal?: undefined; day?: undefined; grams?: undefined; onDone?: () => void };

/** Выбор порции и добавление продукта (или редактирование записи в дневнике) */
export function FoodDetailSheet(props: Props) {
  const { entry } = props;
  const linked = useQuery({
    queryKey: ["food", entry?.food_id],
    enabled: !!entry?.food_id,
    queryFn: () => getFood(entry!.food_id!),
    retry: false,
  });

  // Запись в дневнике — это снимок: КБЖУ берём из неё самой (продукт могли изменить позже),
  // а из привязанного продукта — только порцию и возможность редактировать продукт
  const food: Food | FoodDraft | null = useMemo(() => {
    if (props.food) return props.food;
    if (!entry) return null;
    if (entry.food_id && linked.isLoading) return null;
    const k = entry.grams ? 100 / entry.grams : 1;
    const snapshot = {
      kcal: Math.round(entry.kcal * k * 10) / 10,
      protein: Math.round(entry.protein * k * 10) / 10,
      fat: Math.round(entry.fat * k * 10) / 10,
      carbs: Math.round(entry.carbs * k * 10) / 10,
    };
    if (linked.data) return { ...linked.data, ...snapshot, name: entry.name, brand: entry.brand };
    return {
      name: entry.name,
      brand: entry.brand,
      barcode: null,
      category: null,
      ...snapshot,
      serving_g: null,
      serving_name: null,
      source: "user",
    };
  }, [props.food, entry, linked.data, linked.isLoading]);

  if (!food) {
    return (
      <>
        <SheetHeader />
        <div className="sheet-body">
          <div className="skeleton" style={{ height: 28, width: "70%" }} />
          <div className="skeleton" style={{ height: 90, marginTop: 20 }} />
          <div className="skeleton" style={{ height: 64, marginTop: 20 }} />
        </div>
      </>
    );
  }
  return <Detail food={food} entry={entry} meal={props.meal} day={props.day} grams={props.grams} onDone={props.onDone} />;
}

type DetailProps = { food: Food | FoodDraft; entry?: Entry; meal?: Meal; day?: string; grams?: number; onDone?: () => void };

function Detail({ food, entry, meal: meal0, day: day0, grams: grams0, onDone }: DetailProps) {
  const nav = useNav();
  const layer = useLayer();
  const uid = useUid();
  const toast = useToast();
  const add = useAddEntry();
  const update = useUpdateEntry();
  const del = useDeleteEntry();
  const saveFood = useSaveFood();

  const serving = food.serving_g ?? null;
  const startGrams = entry?.grams ?? grams0 ?? serving ?? 100;
  const [unit, setUnit] = useState<"g" | "s">(serving && !entry && !grams0 ? "s" : "g");
  const [amount, setAmount] = useState(() => (unit === "s" && serving ? String(round2(startGrams / serving)) : String(startGrams)));
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? meal0 ?? 0);
  const day = entry?.day ?? day0!;

  const grams = unit === "g" ? parseNum(amount) : parseNum(amount) * (serving ?? 100);
  const m: Macros = scaleMacros(food, grams);
  const kcalP = food.protein * 4;
  const kcalF = food.fat * 9;
  const kcalC = food.carbs * 4;
  const kcalSum = kcalP + kcalF + kcalC || 1;

  useEffect(() => {
    haptic.soft();
  }, []);

  const step = unit === "s" ? 0.5 : grams >= 100 ? 10 : 5;
  const bump = (d: number) => {
    haptic.select();
    const v = Math.max(0, round2(parseNum(amount) + d * step));
    setAmount(String(v));
  };

  const switchUnit = (u: "g" | "s") => {
    if (u === unit || !serving) return;
    haptic.select();
    setAmount(String(u === "s" ? round2(grams / serving) : Math.round(grams)));
    setUnit(u);
  };

  const presets =
    unit === "s"
      ? [0.5, 1, 1.5, 2, 3]
      : Array.from(new Set([...(serving ? [serving] : []), 50, 100, 150, 200, 250])).slice(0, 6);

  const [saving, setSaving] = useState(false);
  // «Сохранено» — только после ответа сервера; при ошибке окно остаётся открытым
  const submit = async () => {
    if (grams <= 0 || saving) return;
    setSaving(true);
    const payload = { name: food.name, brand: food.brand, grams: Math.round(grams * 10) / 10, ...m, meal };
    try {
      if (entry) {
        await update.mutateAsync({ id: entry.id, day: entry.day, patch: payload });
        haptic.success();
        toast("Сохранено", <Check size={18} color="var(--good)" />);
        layer.close();
        return;
      }
      let foodId = "id" in food && food.id ? food.id : null;
      if (!foodId) {
        // Продукт из Open Food Facts или по снимку — сохраняем себе, чтобы потом находить быстрее
        try {
          foodId = (await saveFood.mutateAsync(food)).id;
        } catch {
          foodId = null;
        }
      }
      await add.mutateAsync({ ...payload, food_id: foodId, day });
      haptic.success();
      toast(`${MEALS[meal].name}: +${fmtNum(m.kcal)} ккал`, <Check size={18} color="var(--good)" />);
      layer.close();
      onDone?.();
    } catch {
      haptic.error();
      toast("Не сохранилось — проверь связь и нажми ещё раз");
      setSaving(false);
    }
  };

  const own = "owner_id" in food && food.owner_id === uid && "id" in food && !!food.id;

  return (
    <>
      <SheetHeader
        right={
          <div className="row" style={{ gap: 6 }}>
            <FavButton
              kind="food"
              refId={"id" in food ? food.id : null}
              ensure={async () => (await saveFood.mutateAsync(food)).id}
            />
            {own && (
              <Tap className="icon-btn" onClick={() => nav.sheet(<CreateFoodSheet food={food as Food} />)} aria-label="Изменить продукт">
                <Pencil size={17} />
              </Tap>
            )}
          </div>
        }
      />
      <div className="sheet-body">
        <div className="fd-title">{food.name}</div>
        <div className="fd-brand">
          {[food.brand, `на 100 г: ${fmtNum(food.kcal)} ккал · Б ${fmtNum(food.protein, 1)} · Ж ${fmtNum(food.fat, 1)} · У ${fmtNum(food.carbs, 1)}`]
            .filter(Boolean)
            .join(" · ")}
        </div>

        {"missing" in food && food.missing?.length ? (
          <button className="fd-missing" onClick={() => nav.sheet(<CreateFoodSheet food={food as Food} />)}>
            ⚠️ В базе нет данных: {food.missing.map((k) => ({ protein: "белки", fat: "жиры", carbs: "углеводы" })[k]).join(", ")} — посчитаны как 0.
            Проверь по упаковке и <b>поправь</b>
          </button>
        ) : null}

        <div className="fd-macros">
          <div className="fd-macro" style={{ background: "linear-gradient(135deg, rgba(124,140,255,.22), rgba(179,136,255,.12))" }}>
            <div className="v">
              <NumberTicker value={m.kcal} duration={0.45} />
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
                <NumberTicker value={m[k]} digits={m[k] < 10 && m[k] % 1 ? 1 : 0} duration={0.45} />
              </div>
              <div className="l">
                <span className="dot" style={{ background: c, width: 6, height: 6 }} />
                {l}
              </div>
            </div>
          ))}
        </div>

        <div className="split">
          <motion.div initial={{ flexGrow: 0 }} animate={{ flexGrow: kcalP / kcalSum }} style={{ background: "var(--protein)", flexBasis: 0 }} />
          <motion.div initial={{ flexGrow: 0 }} animate={{ flexGrow: kcalF / kcalSum }} style={{ background: "var(--fat)", flexBasis: 0 }} />
          <motion.div initial={{ flexGrow: 0 }} animate={{ flexGrow: kcalC / kcalSum }} style={{ background: "var(--carbs)", flexBasis: 0 }} />
        </div>
        <div className="row faint" style={{ fontSize: 12, marginTop: 6, justifyContent: "space-between" }}>
          <span>Белки {Math.round((kcalP / kcalSum) * 100)}%</span>
          <span>Жиры {Math.round((kcalF / kcalSum) * 100)}%</span>
          <span>Углеводы {Math.round((kcalC / kcalSum) * 100)}%</span>
        </div>

        {serving && (
          <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
            <Tap className={`chip ${unit === "g" ? "on" : ""}`} onClick={() => switchUnit("g")}>
              Граммы
            </Tap>
            <Tap className={`chip ${unit === "s" ? "on" : ""}`} onClick={() => switchUnit("s")}>
              {food.serving_name ?? "Порции"} · {fmtNum(serving)} г
            </Tap>
          </div>
        )}

        <div className="amount">
          <Tap className="icon-btn" onClick={() => bump(-1)} aria-label="Меньше">
            <Minus size={22} />
          </Tap>
          <label className="amount-input">
            <input
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              onFocus={(e) => e.target.select()}
            />
            <span>{unit === "g" ? "г" : (food.serving_name ?? "шт")}</span>
          </label>
          <Tap className="icon-btn" onClick={() => bump(1)} aria-label="Больше">
            <Plus size={22} />
          </Tap>
        </div>

        <div className="chips-row" style={{ padding: "12px 0 0", justifyContent: "center", flexWrap: "wrap" }}>
          {presets.map((p) => (
            <Tap
              key={p}
              className={`chip ${parseNum(amount) === p ? "on" : ""}`}
              onClick={() => {
                haptic.select();
                setAmount(String(p));
              }}
            >
              {unit === "g" ? `${fmtNum(p)} г` : `× ${String(p).replace(".", ",")}`}
            </Tap>
          ))}
        </div>

        <div className="group-label" style={{ marginTop: 22 }}>
          Приём пищи{day ? ` · ${dayTitle(day).toLowerCase()}` : ""}
        </div>
        <div className="chips-row" style={{ padding: "6px 0 0" }}>
          {MEALS.map((mm) => (
            <Tap
              key={mm.id}
              className={`chip ${meal === mm.id ? "on" : ""}`}
              onClick={() => {
                haptic.select();
                setMeal(mm.id as Meal);
              }}
            >
              {mm.emoji} {mm.name}
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
            aria-label="Удалить"
          >
            <Trash size={20} />
          </Tap>
        )}
        <Tap className="btn btn-accent btn-block" onClick={submit} disabled={grams <= 0 || saving}>
          {entry ? "Сохранить" : "Добавить"} · <NumberTicker value={m.kcal} duration={0.4} /> ккал
        </Tap>
      </div>
    </>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
