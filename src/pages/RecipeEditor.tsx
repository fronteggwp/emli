import { useEffect, useState } from "react";
import { useDraft } from "@/lib/draft";
import { Minus, Plus, Trash, X } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { templateTotal, useDeleteUserRecipe, useSaveUserRecipe, type TemplateItem, type UserRecipe } from "@/data/engage";
import { fmtNum } from "@/lib/nutrition";
import { parseNum } from "@/lib/hooks";
import { confirmDialog, haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { IngredientPickerSheet } from "@/sheets/IngredientPicker";
import "./engage.css";
import "./recipes.css";

const EMOJIS = ["🍲", "🍝", "🥘", "🍛", "🥗", "🍳", "🥞", "🍗", "🥩", "🐟", "🍤", "🌯", "🥙", "🍕", "🍰", "🥤"];

/** Создание и редактирование своего рецепта */
export function RecipeEditorScreen({ recipe }: { recipe?: UserRecipe }) {
  const nav = useNav();
  const layer = useLayer();
  const toast = useToast();
  const save = useSaveUserRecipe();
  const del = useDeleteUserRecipe();
  // Новый рецепт — черновик на устройстве: закрыл экран случайно, ничего не потерял
  const [d, setD, clearDraft] = useDraft(recipe ? null : "recipe-new", {
    title: "",
    emoji: "🍲",
    servings: 2,
    time: "",
    items: [] as TemplateItem[],
    steps: "",
    cooked: "",
  });
  const [title, setTitle] = useState(recipe?.title ?? d.title);
  const [emoji, setEmoji] = useState(recipe?.emoji ?? d.emoji);
  const [servings, setServings] = useState(recipe?.servings ?? d.servings);
  const [time, setTime] = useState(recipe ? (recipe.time ? String(recipe.time) : "") : d.time);
  const [items, setItems] = useState<TemplateItem[]>(recipe?.ingredients ?? d.items);
  const [steps, setSteps] = useState(recipe?.steps ?? d.steps);
  const [cooked, setCooked] = useState(recipe ? (recipe.cooked_g ? String(recipe.cooked_g) : "") : d.cooked);
  useEffect(() => {
    if (!recipe) setD({ title, emoji, servings, time, items, steps, cooked });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, emoji, servings, time, items, steps, cooked]);

  const total = templateTotal(items);
  const weight = items.reduce((a, i) => a + (i.grams ?? 0), 0);
  const ok = title.trim().length > 0 && items.length > 0;

  const setGrams = (idx: number, grams: number) =>
    setItems((l) =>
      l.map((it, i) => {
        if (i !== idx || !it.grams) return it;
        const k = grams / it.grams;
        return { ...it, grams, kcal: it.kcal * k, protein: it.protein * k, fat: it.fat * k, carbs: it.carbs * k };
      }),
    );

  const submit = async () => {
    if (!ok) return;
    haptic.success();
    await save.mutateAsync({
      id: recipe?.id,
      title: title.trim(),
      emoji,
      servings,
      time: parseNum(time) > 0 ? Math.round(parseNum(time)) : null,
      ingredients: items,
      steps: steps.trim() || null,
      cooked_g: parseNum(cooked) > 0 ? parseNum(cooked) : null,
    });
    if (!recipe) clearDraft();
    toast(recipe ? "Рецепт сохранён" : "Рецепт добавлен 👩‍🍳");
    layer.close();
  };

  const remove = async () => {
    if (!recipe || !(await confirmDialog(`Удалить рецепт «${recipe.title}»?`))) return;
    del.mutate(recipe.id);
    toast("Рецепт удалён");
    layer.close();
  };

  return (
    <Screen
      title={recipe ? "Рецепт" : "Новый рецепт"}
      right={
        recipe ? (
          <Tap className="icon-btn" onClick={remove} aria-label="Удалить">
            <Trash size={18} color="var(--danger)" />
          </Tap>
        ) : undefined
      }
    >
      <div className="re-emoji-row no-scrollbar">
        {EMOJIS.map((e) => (
          <Tap
            key={e}
            className={`re-emoji ${emoji === e ? "on" : ""}`}
            scale={0.85}
            onClick={() => {
              haptic.select();
              setEmoji(e);
            }}
          >
            {e}
          </Tap>
        ))}
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="Название блюда" />
      </div>
      <div className="grid-2" style={{ marginTop: 10 }}>
        <div className="re-servings">
          <span className="muted" style={{ fontSize: 13 }}>Порций</span>
          <div className="row" style={{ gap: 8 }}>
            <Tap className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => setServings((s) => Math.max(1, s - 1))}>
              <Minus size={15} />
            </Tap>
            <b className="num" style={{ fontSize: 20, minWidth: 22, textAlign: "center" }}>
              {servings}
            </b>
            <Tap className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => setServings((s) => Math.min(50, s + 1))}>
              <Plus size={15} />
            </Tap>
          </div>
        </div>
        <label className="re-servings">
          <span className="muted" style={{ fontSize: 13 }}>Время, мин</span>
          <input className="re-time num" inputMode="numeric" value={time} onChange={(e) => setTime(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="—" />
        </label>
      </div>

      <div className="section-title">
        Ингредиенты
        {items.length > 0 && (
          <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
            {fmtNum(weight)} г всего
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="list">
          {items.map((it, i) => (
            <div key={`${i}:${it.name}:${it.grams}`} className="re-ing">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="food-row-name">{it.name}</div>
                <div className="food-row-sub">{fmtNum(it.kcal)} ккал · Б {fmtNum(it.protein)} · Ж {fmtNum(it.fat)} · У {fmtNum(it.carbs)}</div>
              </div>
              <label className="re-grams">
                <input
                  inputMode="decimal"
                  defaultValue={it.grams ?? ""}
                  onBlur={(e) => {
                    const g = parseNum(e.target.value);
                    if (g > 0) setGrams(i, g);
                    else e.target.value = String(it.grams ?? "");
                  }}
                />
                г
              </label>
              <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label="Убрать">
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Tap
        className="btn btn-block"
        style={{ marginTop: 10 }}
        onClick={() => nav.sheet(<IngredientPickerSheet onPick={(it) => setItems((l) => [...l, it])} />, { full: true })}
      >
        <Plus size={18} /> Добавить продукт
      </Tap>

      {items.length > 0 && (
        <div className="re-total">
          <div>
            <b className="num">{fmtNum(total.kcal / servings)}</b>
            <span>ккал в порции</span>
          </div>
          <div>
            <b className="num" style={{ color: "var(--protein)" }}>{fmtNum(total.protein / servings)}</b>
            <span>белки</span>
          </div>
          <div>
            <b className="num" style={{ color: "var(--fat)" }}>{fmtNum(total.fat / servings)}</b>
            <span>жиры</span>
          </div>
          <div>
            <b className="num" style={{ color: "var(--carbs)" }}>{fmtNum(total.carbs / servings)}</b>
            <span>углеводы</span>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <label className="re-servings" style={{ marginTop: 10 }}>
          <span style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Вес готового блюда, г</div>
            <div className="muted" style={{ fontSize: 12 }}>
              После варки или запекания вес меняется. Взвесь кастрюлю/форму без посуды — порция в граммах будет точной
            </div>
          </span>
          <input className="re-time num" inputMode="decimal" value={cooked} onChange={(e) => setCooked(e.target.value.replace(/[^\d.,]/g, "").slice(0, 7))} placeholder={String(Math.round(weight))} />
        </label>
      )}

      <div className="section-title">Как готовить</div>
      <AutoTextarea
        className="input re-steps"
        maxRows={14}
        value={steps}
        onChange={(e) => setSteps(e.target.value.slice(0, 6000))}
        placeholder={"Каждый шаг — с новой строки.\nНапример: Отварить рис 15 минут"}
      />

      <Tap className="btn btn-block btn-accent" style={{ marginTop: 20 }} disabled={!ok || save.isPending} onClick={submit}>
        {recipe ? "Сохранить" : "Создать рецепт"}
      </Tap>
      {!ok && (
        <div className="faint" style={{ textAlign: "center", fontSize: 13, marginTop: 8 }}>
          Нужно название и хотя бы один продукт
        </div>
      )}
    </Screen>
  );
}
