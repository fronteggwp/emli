import { useState } from "react";
import { Check, Minus, Pencil, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useNav } from "@/nav/Nav";
import {
  catOf,
  recipeImg,
  recipeItem,
  type Recipe,
  useRecipes,
  useUserRecipes,
  userRecipeItem,
  userRecipeServing,
  type TemplateItem,
} from "@/data/engage";
import { fmtNum } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { Macros } from "@/lib/types";
import { Screen } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { FavButton } from "@/ui/FavButton";
import { NumberTicker } from "@/ui/NumberTicker";
import { Photo } from "@/ui/Photo";
import { tg } from "@/lib/telegram";
import { LogRecipeSheet } from "@/sheets/LogRecipe";
import { RecipeEditorScreen } from "./RecipeEditor";
import "./engage.css";
import "./recipes.css";

export type RecipeVM = {
  key: string;
  title: string;
  emoji: string;
  colors: [string, string];
  category?: string;
  description?: string;
  time?: number | null;
  difficulty?: 1 | 2 | 3;
  servings: number;
  tags?: string[];
  ingredients: { name: string; grams: number; note?: string | null }[];
  steps: string[];
  tip?: string | null;
  serving: Macros & { grams: number };
  toItem: (portions: number) => TemplateItem;
  favRef?: string;
  onEdit?: () => void;
  img?: string | null;
  credit?: Recipe["photo"];
  rawWeight?: boolean;
};

const DIFF = ["", "Легко", "Средне", "Сложно"];

export function RecipeScreen({ id }: { id: string }) {
  const recipes = useRecipes();
  const r = recipes.data?.find((x) => x.id === id);
  if (!r) return <Screen title="">{recipes.isLoading ? <div className="skeleton" style={{ height: 260, borderRadius: 28 }} /> : <div className="empty">Рецепт не найден</div>}</Screen>;
  const c = catOf(r.category);
  return (
    <RecipeView
      vm={{
        key: r.id,
        title: r.title,
        emoji: r.emoji,
        colors: c.colors,
        category: `${c.emoji} ${c.name}`,
        description: r.description,
        time: r.time,
        difficulty: r.difficulty,
        servings: r.servings,
        tags: r.tags,
        ingredients: r.ingredients,
        steps: r.steps,
        tip: r.tip,
        serving: r.serving,
        toItem: (p) => recipeItem(r, p),
        favRef: r.id,
        img: recipeImg(r),
        credit: r.photo,
        rawWeight: true,
      }}
    />
  );
}

export function UserRecipeScreen({ id }: { id: string }) {
  const nav = useNav();
  const list = useUserRecipes();
  const r = list.data?.find((x) => x.id === id);
  if (!r) return <Screen title="">{list.isLoading ? <div className="skeleton" style={{ height: 260, borderRadius: 28 }} /> : <div className="empty">Рецепт удалён</div>}</Screen>;
  const s = userRecipeServing(r);
  return (
    <RecipeView
      vm={{
        key: r.id,
        title: r.title,
        emoji: r.emoji,
        colors: ["#7c8cff", "#b388ff"],
        category: "👤 Мой рецепт",
        time: r.time,
        servings: r.servings,
        ingredients: r.ingredients.map((i) => ({ name: i.name, grams: i.grams ?? 0, note: i.brand })),
        steps: (r.steps ?? "")
          .split(/\n+/)
          .map((x) => x.trim())
          .filter(Boolean),
        serving: s,
        toItem: (p) => userRecipeItem(r, p),
        onEdit: () => nav.push(<RecipeEditorScreen recipe={r} />),
        rawWeight: !r.cooked_g,
      }}
    />
  );
}

function RecipeView({ vm }: { vm: RecipeVM }) {
  const nav = useNav();
  const [cook, setCook] = useState(vm.servings);
  const [done, setDone] = useState<Set<number>>(new Set());
  const k = cook / vm.servings;
  const s = vm.serving;
  const kcalP = s.protein * 4;
  const kcalF = s.fat * 9;
  const kcalC = s.carbs * 4;
  const sum = kcalP + kcalF + kcalC || 1;

  const bump = (d: number) => {
    haptic.select();
    setCook((c) => Math.min(30, Math.max(1, c + d)));
  };

  return (
    <Screen
      title=""
      right={
        <div className="row" style={{ gap: 6 }}>
          {vm.onEdit && (
            <Tap className="icon-btn" onClick={vm.onEdit} aria-label="Изменить">
              <Pencil size={17} />
            </Tap>
          )}
          {vm.favRef && <FavButton kind="recipe" refId={vm.favRef} />}
        </div>
      }
    >
      {vm.img ? (
        <>
          <div className="rc-photo">
            <Photo src={vm.img} alt={vm.title} eager />
            <span className="rc-photo-shade" />
            {vm.category && <span className="rc-cat rc-photo-cat">{vm.category}</span>}
            <div className="rc-photo-info">
              <div className="rc-title">{vm.title}</div>
              {vm.description && <div className="rc-desc">{vm.description}</div>}
              <div className="rc-chips">
                {vm.time ? <span>⏱ {vm.time} мин</span> : null}
                {vm.difficulty ? (
                  <span>
                    {"●".repeat(vm.difficulty)}
                    <i>{"●".repeat(3 - vm.difficulty)}</i> {DIFF[vm.difficulty]}
                  </span>
                ) : null}
                <span>🍽 {vm.servings} порц.</span>
              </div>
            </div>
          </div>
          {vm.credit && (
            <button
              className="rc-credit"
              onClick={() => (tg ? tg.openLink(vm.credit!.link) : window.open(vm.credit!.link, "_blank"))}
            >
              Фото: {vm.credit.author} · {vm.credit.source === "pexels" ? "Pexels" : `Wikimedia Commons${vm.credit.license ? `, ${vm.credit.license}` : ""}`}
            </button>
          )}
        </>
      ) : (
      <div className="rc-hero" style={{ ["--c1" as string]: vm.colors[0], ["--c2" as string]: vm.colors[1] }}>
        <motion.div
          className="rc-emoji"
          initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
        >
          {vm.emoji}
        </motion.div>
        {vm.category && <div className="rc-cat">{vm.category}</div>}
        <div className="rc-title">{vm.title}</div>
        {vm.description && <div className="rc-desc">{vm.description}</div>}
        <div className="rc-chips">
          {vm.time ? <span>⏱ {vm.time} мин</span> : null}
          {vm.difficulty ? (
            <span>
              {"●".repeat(vm.difficulty)}
              <i>{"●".repeat(3 - vm.difficulty)}</i> {DIFF[vm.difficulty]}
            </span>
          ) : null}
          <span>🍽 {vm.servings} порц.</span>
        </div>
      </div>
      )}

      <div className="card rc-macros">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="card-title">На порцию</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {s.grams ? `≈ ${fmtNum(s.grams)} г` : ""}
          </div>
        </div>
        <div className="rc-mgrid">
          <div className="rc-kcal">
            <b className="num">
              <NumberTicker value={Math.round(s.kcal)} />
            </b>
            <span>ккал</span>
          </div>
          {(
            [
              ["Белки", s.protein, "var(--protein)"],
              ["Жиры", s.fat, "var(--fat)"],
              ["Углеводы", s.carbs, "var(--carbs)"],
            ] as const
          ).map(([l, v, c]) => (
            <div key={l} className="rc-m">
              <b className="num" style={{ color: c }}>
                {fmtNum(v)}
                <small> г</small>
              </b>
              <span>{l}</span>
            </div>
          ))}
        </div>
        <div className="split" style={{ marginTop: 12 }}>
          <motion.div initial={{ flexGrow: 0 }} animate={{ flexGrow: kcalP / sum }} style={{ background: "var(--protein)", flexBasis: 0 }} />
          <motion.div initial={{ flexGrow: 0 }} animate={{ flexGrow: kcalF / sum }} style={{ background: "var(--fat)", flexBasis: 0 }} />
          <motion.div initial={{ flexGrow: 0 }} animate={{ flexGrow: kcalC / sum }} style={{ background: "var(--carbs)", flexBasis: 0 }} />
        </div>
        {vm.tags && vm.tags.length > 0 && (
          <div className="rc-tags">
            {vm.tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="section-title">
        Ингредиенты
        <span className="rc-stepper">
          <Tap className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => bump(-1)} aria-label="Меньше">
            <Minus size={15} />
          </Tap>
          <b className="num">{cook}</b>
          <span className="muted" style={{ fontSize: 13 }}>порц.</span>
          <Tap className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => bump(1)} aria-label="Больше">
            <Plus size={15} />
          </Tap>
        </span>
      </div>
      <div className="list rc-ingr">
        {vm.ingredients.map((i, n) => (
          <div key={n} className="rc-ing">
            <span className="rc-ing-dot" />
            <span style={{ flex: 1, minWidth: 0 }}>
              <div>{i.name}</div>
              {i.note && k === 1 && <div className="muted" style={{ fontSize: 13 }}>{i.note}</div>}
            </span>
            <b className="num">{fmtG(i.grams * k)}</b>
          </div>
        ))}
      </div>

      {vm.steps.length > 0 && (
        <>
          <div className="section-title">Как готовить</div>
          <div className="stack" style={{ gap: 8 }}>
            {vm.steps.map((st, n) => {
              const on = done.has(n);
              return (
                <button
                  key={n}
                  className={`rc-step press ${on ? "done" : ""}`}
                  onClick={() => {
                    haptic.select();
                    setDone((d) => {
                      const x = new Set(d);
                      if (x.has(n)) x.delete(n);
                      else x.add(n);
                      return x;
                    });
                  }}
                >
                  <span className="rc-step-n">{on ? <Check size={15} strokeWidth={3} /> : n + 1}</span>
                  <span className="rc-step-t">{st}</span>
                </button>
              );
            })}
          </div>
          <div className="faint" style={{ fontSize: 12, textAlign: "center", marginTop: 8 }}>
            Нажимай на шаг, чтобы отметить готовое
          </div>
        </>
      )}

      {vm.tip && (
        <div className="rc-tip">
          <span>💡</span>
          <div>{vm.tip}</div>
        </div>
      )}

      <div className="rc-bar">
        <Tap className="btn btn-block btn-accent" onClick={() => nav.sheet(<LogRecipeSheet title={vm.title} emoji={vm.emoji} serving={vm.serving} toItem={vm.toItem} rawWeight={vm.rawWeight} />)}>
          <Plus size={19} /> Добавить в дневник
        </Tap>
      </div>
    </Screen>
  );
}

const fmtG = (g: number) => {
  if (g <= 0) return "по вкусу";
  if (g < 20) return `${Math.round(g)} г`;
  if (g < 100) return `${Math.round(g / 5) * 5} г`;
  if (g >= 1000) return `${(Math.round(g / 50) * 50 / 1000).toLocaleString("ru-RU")} кг`;
  return `${Math.round(g / 10) * 10} г`;
};
