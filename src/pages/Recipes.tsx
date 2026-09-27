import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { useNav } from "@/nav/Nav";
import {
  RECIPE_CATS,
  catOf,
  searchRecipes,
  recipeImg,
  useFavorites,
  useRecipes,
  useUserRecipes,
  userRecipeServing,
  type Recipe,
  type RecipeCategory,
  type UserRecipe,
} from "@/data/engage";
import { fmtNum } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { Photo } from "@/ui/Photo";
import { todayKey } from "@/lib/dates";
import { Tap } from "@/ui/Tap";
import { RecipeScreen, UserRecipeScreen } from "./Recipe";
import { RecipeEditorScreen } from "./RecipeEditor";
import "./engage.css";
import "./recipes.css";

const TAGS = ["высокобелковое", "быстро", "для похудения", "на массу", "вегетарианское", "без сахара", "заготовка", "бюджетно"];
type Cat = RecipeCategory | "all" | "fav" | "mine";

/** Книга рецептов: база Emli, избранное и свои рецепты */
export function RecipesScreen({ initial = "all" }: { initial?: Cat }) {
  const nav = useNav();
  const recipes = useRecipes();
  const mine = useUserRecipes();
  const fav = useFavorites();
  const [cat, setCat] = useState<Cat>(initial);
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const favIds = useMemo(() => new Set((fav.data ?? []).filter((f) => f.kind === "recipe").map((f) => f.ref)), [fav.data]);
  const all = recipes.data ?? [];
  const list = useMemo(() => {
    let l = searchRecipes(all, q);
    if (cat === "fav") l = l.filter((r) => favIds.has(r.id));
    else if (cat !== "all" && cat !== "mine") l = l.filter((r) => r.category === cat);
    if (tag) l = l.filter((r) => r.tags.includes(tag));
    return l;
  }, [all, q, cat, tag, favIds]);

  const browsing = cat === "all" && !tag && !q.trim();
  const myList = (mine.data ?? []).filter((r) => !q.trim() || r.title.toLowerCase().includes(q.trim().toLowerCase()));

  const chip = (id: Cat, label: string) => (
    <Tap
      key={id}
      className={`chip ${cat === id ? "on" : ""}`}
      onClick={() => {
        haptic.select();
        setCat(id);
      }}
    >
      {label}
    </Tap>
  );

  return (
    <Screen
      title="Рецепты"
      right={
        <Tap className="icon-btn" onClick={() => nav.push(<RecipeEditorScreen />)} aria-label="Свой рецепт">
          <Plus size={20} />
        </Tap>
      }
    >
      <div className="search-box" style={{ margin: "0 0 10px" }}>
        <Search size={19} className="faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Сырники, курица, без сахара…" enterKeyHint="search" autoComplete="off" />
        {q && (
          <button className="icon-btn" onClick={() => setQ("")}>
            <X size={16} />
          </button>
        )}
      </div>
      <div className="chips-row" style={{ margin: "0 -16px", padding: "0 16px" }}>
        {chip("all", "Все")}
        {chip("fav", "❤️ Избранные")}
        {chip("mine", "👤 Мои")}
        {RECIPE_CATS.map((c) => chip(c.id, `${c.emoji} ${c.name}`))}
      </div>
      {cat !== "mine" && (
        <div className="chips-row" style={{ margin: "0 -16px", padding: "8px 16px 0" }}>
          {TAGS.map((t) => (
            <Tap
              key={t}
              className={`chip ${tag === t ? "on" : ""}`}
              style={{ height: 30, fontSize: 13 }}
              onClick={() => {
                haptic.select();
                setTag(tag === t ? null : t);
              }}
            >
              #{t}
            </Tap>
          ))}
        </div>
      )}

      {(cat === "mine" || (browsing && myList.length > 0)) && (
        <>
          <div className="section-title">
            Мои рецепты
            <button onClick={() => nav.push(<RecipeEditorScreen />)}>+ Создать</button>
          </div>
          {myList.length ? (
            <div className="recipe-grid">
              {myList.map((r) => (
                <UserRecipeCard key={r.id} r={r} />
              ))}
            </div>
          ) : (
            <Tap className="recipe-create" onClick={() => nav.push(<RecipeEditorScreen />)}>
              <span style={{ fontSize: 34 }}>👩‍🍳</span>
              <b>Добавь свой рецепт</b>
              <span className="muted">Собери блюдо из продуктов — Emli посчитает КБЖУ на порцию</span>
            </Tap>
          )}
        </>
      )}

      {cat !== "mine" &&
        (recipes.isLoading ? (
          <div className="recipe-grid" style={{ marginTop: 16 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 210, borderRadius: 22 }} />
            ))}
          </div>
        ) : browsing ? (
          <>
          <DailyRecipe list={all} />
          {RECIPE_CATS.map((c) => {
            const items = all.filter((r) => r.category === c.id);
            if (!items.length) return null;
            return (
              <div key={c.id}>
                <div className="section-title">
                  {c.emoji} {c.name}
                  <button
                    onClick={() => {
                      haptic.select();
                      setCat(c.id);
                    }}
                  >
                    Все {items.length} →
                  </button>
                </div>
                <div className="recipe-rail no-scrollbar">
                  {items.slice(0, 10).map((r) => (
                    <RecipeCard key={r.id} r={r} fav={favIds.has(r.id)} />
                  ))}
                </div>
              </div>
            );
          })}
          </>
        ) : list.length ? (
          <>
            <div className="muted" style={{ fontSize: 13, margin: "14px 2px 10px" }}>
              {list.length} {plural(list.length)}
            </div>
            <div className="recipe-grid">
              {list.map((r) => (
                <RecipeCard key={r.id} r={r} fav={favIds.has(r.id)} />
              ))}
            </div>
          </>
        ) : (
          <div className="empty">
            <div className="big">{cat === "fav" ? "❤️" : "🔍"}</div>
            {cat === "fav" ? "Жми на сердечко в рецепте — он появится здесь" : "Ничего не нашлось — попробуй другое слово"}
          </div>
        ))}
    </Screen>
  );
}

const plural = (n: number) => {
  const a = n % 100;
  const b = n % 10;
  if (a > 10 && a < 20) return "рецептов";
  if (b === 1) return "рецепт";
  if (b > 1 && b < 5) return "рецепта";
  return "рецептов";
};

export function RecipeCard({ r, fav }: { r: Recipe; fav?: boolean }) {
  const nav = useNav();
  const c = catOf(r.category);
  return (
    <Tap className="recipe-card" scale={0.97} onClick={() => nav.push(<RecipeScreen id={r.id} />)}>
      <span className="recipe-cover" style={{ ["--c1" as string]: c.colors[0], ["--c2" as string]: c.colors[1] }}>
        <span className="recipe-emoji">{r.emoji}</span>
        {r.photo && <Photo src={recipeImg(r, true)!} alt={r.title} className="recipe-img" />}
        {fav && <span className="recipe-fav">❤️</span>}
        <span className="recipe-time">⏱ {r.time} мин</span>
      </span>
      <span className="recipe-info">
        <span className="recipe-title">{r.title}</span>
        <span className="recipe-meta">
          <b className="num">{fmtNum(r.serving.kcal)}</b> ккал · <span style={{ color: "var(--protein)" }}>Б {fmtNum(r.serving.protein)}</span>
        </span>
      </span>
    </Tap>
  );
}

function UserRecipeCard({ r }: { r: UserRecipe }) {
  const nav = useNav();
  const s = userRecipeServing(r);
  return (
    <Tap className="recipe-card" scale={0.97} onClick={() => nav.push(<UserRecipeScreen id={r.id} />)}>
      <span className="recipe-cover" style={{ ["--c1" as string]: "#7c8cff", ["--c2" as string]: "#b388ff" }}>
        <span className="recipe-emoji">{r.emoji}</span>
        {r.time ? <span className="recipe-time">⏱ {r.time} мин</span> : null}
      </span>
      <span className="recipe-info">
        <span className="recipe-title">{r.title}</span>
        <span className="recipe-meta">
          <b className="num">{fmtNum(s.kcal)}</b> ккал · <span style={{ color: "var(--protein)" }}>Б {fmtNum(s.protein)}</span>
        </span>
      </span>
    </Tap>
  );
}

/** Компактная строка рецепта для списков (добавление еды) */
export function RecipeRow({ r, onOpen, onQuick }: { r: Recipe; onOpen: () => void; onQuick?: () => void }) {
  const c = catOf(r.category);
  return (
    <button className="food-row press" onClick={onOpen}>
      <span className="recipe-dot" style={{ background: `linear-gradient(135deg, ${c.colors[0]}, ${c.colors[1]})` }}>
        {r.emoji}
        {r.photo && <Photo src={recipeImg(r, true)!} alt="" className="recipe-img" />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="food-row-name">{r.title}</div>
        <div className="food-row-sub">
          {c.name} · ⏱ {r.time} мин · порция {fmtNum(r.serving.grams)} г
        </div>
      </div>
      <div className="food-row-kcal num">
        {fmtNum(r.serving.kcal)}
        <small>за порцию</small>
      </div>
      {onQuick && (
        <span
          className="quick-add tap"
          role="button"
          aria-label="Добавить порцию"
          onClick={(e) => {
            e.stopPropagation();
            onQuick();
          }}
        >
          <Plus size={18} strokeWidth={2.4} />
        </span>
      )}
    </button>
  );
}

/** Рецепт дня — большая карточка с фото, меняется каждый день */
function DailyRecipe({ list }: { list: Recipe[] }) {
  const nav = useNav();
  const withPhoto = list.filter((r) => r.photo);
  if (!withPhoto.length) return null;
  const day = todayKey();
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = withPhoto[h % withPhoto.length];
  const c = catOf(r.category);
  return (
    <Tap className="daily" scale={0.98} onClick={() => nav.push(<RecipeScreen id={r.id} />)}>
      <Photo src={recipeImg(r)!} alt={r.title} className="daily-img" eager />
      <span className="daily-shade" />
      <span className="daily-badge">✨ Рецепт дня</span>
      <span className="daily-info">
        <span className="daily-cat">
          {c.emoji} {c.name} · ⏱ {r.time} мин
        </span>
        <span className="daily-title">{r.title}</span>
        <span className="daily-meta">
          <b className="num">{fmtNum(r.serving.kcal)}</b> ккал · Б {fmtNum(r.serving.protein)} · Ж {fmtNum(r.serving.fat)} · У {fmtNum(r.serving.carbs)}
        </span>
      </span>
    </Tap>
  );
}
