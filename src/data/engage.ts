// Напоминания, итоги недели, избранное, мои приёмы пищи и рецепты, достижения, челленджи, аккаунт.
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUid } from "@/lib/auth";
import type { Food, Macros, Meal } from "@/lib/types";
import { qk } from "./api";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const r1 = (n: number) => Math.round(n * 10) / 10;

export const ek = {
  reminders: ["reminders"] as const,
  summary: (a: string, b: string) => ["summary", a, b] as const,
  favorites: ["favorites"] as const,
  favFoods: (ids: string[]) => ["favorites", "foods", ids.join(",")] as const,
  templates: ["meal-templates"] as const,
  myRecipes: ["user-recipes"] as const,
  recipes: ["recipes-db"] as const,
  achievements: (uid: string) => ["achievements", uid] as const,
  challenges: ["challenges"] as const,
  challenge: (id: string) => ["challenges", id] as const,
  board: (id: string) => ["challenges", id, "board"] as const,
};

// ───────────── Напоминания

export type Reminders = {
  user_id: string;
  enabled: boolean;
  tz: string;
  meals: boolean;
  meal_times: string[];
  workout: boolean;
  workout_time: string;
  workout_days: number[];
  workout_label: string | null;
  weigh: boolean;
  weigh_time: string;
  streak: boolean;
  streak_time: string;
  weekly: boolean;
};

export const hm = (t: string | undefined) => (t ?? "").slice(0, 5);

export function useReminders() {
  const uid = useUid();
  return useQuery({
    queryKey: ek.reminders,
    queryFn: async () => unwrap<Reminders | null>(await supabase.from("reminders").select("*").eq("user_id", uid).maybeSingle()),
  });
}

export function useSaveReminders() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (patch: Partial<Reminders>) =>
      unwrap<Reminders>(await supabase.from("reminders").upsert({ user_id: uid, ...patch }).select().single()),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ek.reminders });
      const prev = qc.getQueryData<Reminders | null>(ek.reminders);
      if (prev) qc.setQueryData(ek.reminders, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => ctx && qc.setQueryData(ek.reminders, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ek.reminders }),
  });
}

/** Часовой пояс устройства — чтобы бот писал вовремя. Строку создаём при первом запуске. */
export function useSyncTimezone() {
  const r = useReminders();
  const save = useSaveReminders();
  useEffect(() => {
    if (r.isLoading || r.isError) return;
    let tz = "Europe/Moscow";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
    } catch {
      /* старый движок */
    }
    if (!r.data || r.data.tz !== tz) save.mutate({ tz });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.isLoading, r.data?.tz]);
}

// ───────────── Итоги периода

export type Summary = {
  from: string;
  to: string;
  days_logged: number;
  days_complete?: number;
  workouts_plan?: number;
  avg_kcal: number | null;
  avg_protein: number | null;
  target_kcal: number | null;
  target_protein: number | null;
  days_on_target: number;
  weight_avg: number | null;
  weight_prev_avg: number | null;
  weigh_ins: number;
  workouts: number;
  workouts_prev: number;
  volume: number;
  sets: number;
  minutes: number;
  burned: number;
  prs: number;
  streak: number;
};

export function useSummary(from: string, to: string) {
  return useQuery({
    queryKey: ek.summary(from, to),
    queryFn: async () => {
      const s = unwrap<Summary>(await supabase.rpc("my_summary", { d1: from, d2: to }));
      return {
        ...s,
        weight_avg: s.weight_avg == null ? null : Number(s.weight_avg),
        weight_prev_avg: s.weight_prev_avg == null ? null : Number(s.weight_prev_avg),
        volume: Number(s.volume ?? 0),
      } as Summary;
    },
  });
}

/** Совет по итогам недели (такой же присылает бот) */
export function weeklyAdvice(s: Summary): string {
  if (s.days_logged < 4) return "Записывай еду хотя бы 5 дней в неделю — тогда расчёт расхода калорий станет точным.";
  if (s.target_protein && s.avg_protein && s.avg_protein < s.target_protein * 0.8)
    return `Белка маловато: ${s.avg_protein} г из ${s.target_protein}. Добавь творог, яйца, курицу или рыбу в каждый приём пищи.`;
  if (s.target_kcal && s.avg_kcal && s.avg_kcal > s.target_kcal * 1.1)
    return "Калорий заметно больше цели. Попробуй планировать ужин заранее и держать под рукой белковые перекусы.";
  if (s.target_kcal && s.avg_kcal && s.avg_kcal < s.target_kcal * 0.85)
    return "Ты ешь заметно меньше цели — это тормозит восстановление и может сорвать прогресс. Добавь 1 перекус в день.";
  if (!s.workouts) return "На этой неделе не было тренировок. Даже 2 коротких занятия по 30 минут дадут результат.";
  if (s.workouts > s.workouts_prev) return "Тренировок больше, чем неделей раньше — так держать! 💪";
  return "Отличная неделя! Продолжай в том же темпе — стабильность решает всё.";
}

// ───────────── Избранное

export type Favorite = { kind: "food" | "recipe"; ref: string; created_at: string };

export function useFavorites() {
  return useQuery({
    queryKey: ek.favorites,
    queryFn: async () =>
      unwrap<Favorite[]>(await supabase.from("favorites").select("kind,ref,created_at").order("created_at", { ascending: false })),
    staleTime: 5 * 60_000,
  });
}

export function useIsFavorite(kind: Favorite["kind"], ref: string | undefined) {
  const f = useFavorites();
  return !!ref && !!f.data?.some((x) => x.kind === kind && x.ref === ref);
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async ({ kind, ref, on }: { kind: Favorite["kind"]; ref: string; on: boolean }) => {
      if (on) unwrap(await supabase.from("favorites").upsert({ user_id: uid, kind, ref }));
      else unwrap(await supabase.from("favorites").delete().eq("kind", kind).eq("ref", ref));
    },
    onMutate: async ({ kind, ref, on }) => {
      await qc.cancelQueries({ queryKey: ek.favorites });
      const prev = qc.getQueryData<Favorite[]>(ek.favorites);
      qc.setQueryData<Favorite[]>(ek.favorites, (old = []) =>
        on ? [{ kind, ref, created_at: new Date().toISOString() }, ...old] : old.filter((x) => !(x.kind === kind && x.ref === ref)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx && qc.setQueryData(ek.favorites, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ek.favorites }),
  });
}

export function useFavoriteFoods() {
  const fav = useFavorites();
  const ids = (fav.data ?? []).filter((f) => f.kind === "food").map((f) => f.ref);
  return useQuery({
    queryKey: ek.favFoods(ids),
    enabled: fav.isSuccess,
    queryFn: async () => {
      if (!ids.length) return [];
      const rows = unwrap<Food[]>(await supabase.from("foods").select("*").in("id", ids));
      const byId = new Map(rows.map((f) => [f.id, f]));
      return ids
        .map((id) => byId.get(id))
        .filter((f): f is Food => !!f)
        .map((f) => ({ ...f, kcal: +f.kcal, protein: +f.protein, fat: +f.fat, carbs: +f.carbs, serving_g: f.serving_g == null ? null : +f.serving_g }));
    },
  });
}

// ───────────── Мои приёмы пищи

export type TemplateItem = Macros & { food_id: string | null; name: string; brand: string | null; grams: number | null };
export type MealTemplate = { id: string; name: string; emoji: string; items: TemplateItem[]; uses: number; created_at: string };

export function useMealTemplates() {
  return useQuery({
    queryKey: ek.templates,
    queryFn: async () =>
      unwrap<MealTemplate[]>(await supabase.from("meal_templates").select("*").order("uses", { ascending: false }).order("created_at", { ascending: false })),
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Pick<MealTemplate, "name" | "emoji" | "items"> & { id?: string }) => {
      const { id, ...row } = t;
      return unwrap<MealTemplate>(
        id
          ? await supabase.from("meal_templates").update(row).eq("id", id).select().single()
          : await supabase.from("meal_templates").insert(row).select().single(),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ek.templates }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from("meal_templates").delete().eq("id", id)),
    onMutate: (id) => qc.setQueryData<MealTemplate[]>(ek.templates, (old) => old?.filter((t) => t.id !== id)),
    onSettled: () => qc.invalidateQueries({ queryKey: ek.templates }),
  });
}

export const templateTotal = (items: Macros[]) =>
  items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, fat: a.fat + i.fat, carbs: a.carbs + i.carbs }), {
    kcal: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
  });

/** Записать несколько продуктов разом (приём пищи, рецепт) */
export function useLogItems() {
  const qc = useQueryClient();
  return useMutation({
    meta: { achievements: true },
    mutationFn: async ({ items, day, meal, templateId }: { items: TemplateItem[]; day: string; meal: Meal; templateId?: string }) => {
      // Продукт из шаблона могли удалить — такую запись добавляем без привязки, а не роняем весь набор
      const ids = [...new Set(items.map((i) => i.food_id).filter((x): x is string => !!x))];
      const alive = new Set<string>();
      if (ids.length) {
        const { data } = await supabase.from("foods").select("id").in("id", ids);
        for (const r of data ?? []) alive.add(r.id);
      }
      const rows = items.map((i) => ({
        day,
        meal,
        food_id: i.food_id && alive.has(i.food_id) ? i.food_id : null,
        name: i.name,
        brand: i.brand,
        grams: i.grams,
        kcal: r1(i.kcal),
        protein: r1(i.protein),
        fat: r1(i.fat),
        carbs: r1(i.carbs),
      }));
      unwrap(await supabase.from("food_entries").insert(rows));
      if (templateId) {
        const t = qc.getQueryData<MealTemplate[]>(ek.templates)?.find((x) => x.id === templateId);
        await supabase.from("meal_templates").update({ uses: (t?.uses ?? 0) + 1 }).eq("id", templateId);
      }
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: qk.entries(v.day) });
      qc.invalidateQueries({ queryKey: qk.totals });
      qc.invalidateQueries({ queryKey: qk.recents });
      if (v.templateId) qc.invalidateQueries({ queryKey: ek.templates });
    },
  });
}

// ───────────── Рецепты: база Emli

export type RecipeCategory = "breakfast" | "soup" | "main" | "salad" | "side" | "snack" | "dessert" | "drink";
export type Recipe = {
  id: string;
  title: string;
  emoji: string;
  category: RecipeCategory;
  tags: string[];
  time: number;
  servings: number;
  difficulty: 1 | 2 | 3;
  description: string;
  ingredients: { name: string; grams: number; note: string | null; per100: [number, number, number, number] }[];
  steps: string[];
  tip: string | null;
  serving: Macros & { grams: number };
  photo?: { author: string; source: "pexels" | "wiki"; license: string | null; link: string } | null;
};

/** Фото рецепта: большое для карточки рецепта, маленькое для списков */
export const recipeImg = (r: Pick<Recipe, "id" | "photo">, small = false) =>
  r.photo ? `${import.meta.env.BASE_URL}recipes/img/${r.id}${small ? "-s" : ""}.webp` : null;

export const RECIPE_CATS: { id: RecipeCategory; name: string; emoji: string; colors: [string, string] }[] = [
  { id: "breakfast", name: "Завтраки", emoji: "🍳", colors: ["#ffb35c", "#ff7a5c"] },
  { id: "main", name: "Горячее", emoji: "🍗", colors: ["#ff7a5c", "#e8475f"] },
  { id: "soup", name: "Супы", emoji: "🍲", colors: ["#ff9f43", "#d35400"] },
  { id: "salad", name: "Салаты", emoji: "🥗", colors: ["#4fd18b", "#1f9d6a"] },
  { id: "side", name: "Гарниры", emoji: "🍚", colors: ["#e4b363", "#b07d2b"] },
  { id: "snack", name: "Перекусы", emoji: "🥪", colors: ["#7c8cff", "#5b4fd6"] },
  { id: "dessert", name: "Десерты", emoji: "🍰", colors: ["#ff8fb5", "#d9467a"] },
  { id: "drink", name: "Напитки", emoji: "🥤", colors: ["#5cc8ff", "#3a7bd5"] },
];
export const catOf = (id: RecipeCategory) => RECIPE_CATS.find((c) => c.id === id) ?? RECIPE_CATS[0];

export function useRecipes() {
  return useQuery({
    queryKey: ek.recipes,
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}recipes.json`);
      if (!res.ok) throw new Error("recipes");
      return (await res.json()) as Recipe[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");
export function searchRecipes(list: Recipe[], q: string) {
  const t = norm(q.trim());
  if (!t) return list;
  const words = t.split(/\s+/);
  return list
    .map((r) => {
      const title = norm(r.title);
      const ingr = norm(r.ingredients.map((i) => i.name).join(" "));
      const tags = norm(r.tags.join(" "));
      let score = 0;
      for (const w of words) {
        // Грубая основа слова: «курица» найдёт «куриная», «куриное филе»
        const st = w.length >= 5 ? w.slice(0, w.length - 2) : w;
        if (title.startsWith(w)) score += 50;
        else if (title.includes(w)) score += 30;
        else if (title.includes(st)) score += 22;
        else if (tags.includes(w)) score += 15;
        else if (ingr.includes(w)) score += 10;
        else if (ingr.includes(st)) score += 6;
        else return null;
      }
      return { r, score };
    })
    .filter((x): x is { r: Recipe; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

/** Порция рецепта из базы → запись в дневник */
export function recipeItem(r: Recipe, portions: number): TemplateItem {
  return {
    food_id: null,
    name: r.title,
    brand: portions === 1 ? "рецепт · 1 порция" : `рецепт · ${portions} порц.`,
    grams: Math.round(r.serving.grams * portions),
    kcal: r.serving.kcal * portions,
    protein: r.serving.protein * portions,
    fat: r.serving.fat * portions,
    carbs: r.serving.carbs * portions,
  };
}

// ───────────── Мои рецепты

export type UserRecipe = {
  id: string;
  title: string;
  emoji: string;
  servings: number;
  time: number | null;
  ingredients: TemplateItem[];
  steps: string | null;
  /** Вес готового блюда целиком, г — после варки/запекания; если не указан, считаем по сырым продуктам */
  cooked_g?: number | null;
  created_at: string;
};

export function useUserRecipes() {
  return useQuery({
    queryKey: ek.myRecipes,
    queryFn: async () => unwrap<UserRecipe[]>(await supabase.from("user_recipes").select("*").order("created_at", { ascending: false })),
  });
}

export function useSaveUserRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Omit<UserRecipe, "id" | "created_at"> & { id?: string }) => {
      const { id, ...row } = r;
      return unwrap<UserRecipe>(
        id
          ? await supabase.from("user_recipes").update(row).eq("id", id).select().single()
          : await supabase.from("user_recipes").insert(row).select().single(),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ek.myRecipes }),
  });
}

export function useDeleteUserRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from("user_recipes").delete().eq("id", id)),
    onMutate: (id) => qc.setQueryData<UserRecipe[]>(ek.myRecipes, (old) => old?.filter((t) => t.id !== id)),
    onSettled: () => qc.invalidateQueries({ queryKey: ek.myRecipes }),
  });
}

export function userRecipeServing(r: UserRecipe) {
  const t = templateTotal(r.ingredients);
  const raw = r.ingredients.reduce((a, i) => a + (i.grams ?? 0), 0);
  const grams = r.cooked_g ? Number(r.cooked_g) : raw;
  const n = Math.max(1, r.servings);
  return { kcal: t.kcal / n, protein: t.protein / n, fat: t.fat / n, carbs: t.carbs / n, grams: grams / n };
}

export function userRecipeItem(r: UserRecipe, portions: number): TemplateItem {
  const s = userRecipeServing(r);
  return {
    food_id: null,
    name: r.title,
    brand: portions === 1 ? "мой рецепт · 1 порция" : `мой рецепт · ${portions} порц.`,
    grams: Math.round(s.grams * portions) || null,
    kcal: s.kcal * portions,
    protein: s.protein * portions,
    fat: s.fat * portions,
    carbs: s.carbs * portions,
  };
}

// ───────────── Достижения

export type Earned = { key: string; earned_at: string };

export function useAchievements(uid: string | undefined) {
  return useQuery({
    queryKey: ek.achievements(uid ?? ""),
    enabled: !!uid,
    queryFn: async () =>
      unwrap<Earned[]>(await supabase.from("achievements").select("key,earned_at").eq("user_id", uid!).order("earned_at", { ascending: false })),
  });
}

export async function syncAchievements() {
  const { data } = await supabase.rpc("sync_achievements");
  return ((data ?? []) as (string | { sync_achievements: string })[]).map((x) => (typeof x === "string" ? x : x.sync_achievements));
}

// ───────────── Челленджи

export type ChallengeMetric = "workouts" | "volume" | "sets" | "minutes" | "logged_days" | "weigh_ins";
export type ChallengeRow = {
  id: string;
  title: string;
  emoji: string;
  metric: ChallengeMetric;
  start_date: string;
  end_date: string;
  owner_id: string;
  status: "invited" | "joined";
  members: number;
  my_value: number | null;
  my_place: number | null;
  leader_name: string | null;
  leader_value: number | null;
};
export type BoardRow = { user_id: string; first_name: string; last_name: string | null; avatar_url: string | null; value: number; place: number };

export function useMyChallenges() {
  return useQuery({
    queryKey: ek.challenges,
    queryFn: async () =>
      unwrap<ChallengeRow[]>(await supabase.rpc("my_challenges")).map((c) => ({
        ...c,
        my_value: c.my_value == null ? null : Number(c.my_value),
        leader_value: c.leader_value == null ? null : Number(c.leader_value),
      })),
  });
}

export function useChallengeBoard(id: string) {
  return useQuery({
    queryKey: ek.board(id),
    queryFn: async () => unwrap<BoardRow[]>(await supabase.rpc("challenge_board", { cid: id })).map((b) => ({ ...b, value: Number(b.value) })),
    refetchInterval: 60_000,
  });
}

export function useChallengeActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ek.challenges });
  return {
    create: useMutation({
      meta: { achievements: true },
      mutationFn: async (a: { title: string; emoji: string; metric: ChallengeMetric; start: string; end: string; invitees: string[] }) =>
        unwrap<string>(
          await supabase.rpc("create_challenge", {
            title: a.title,
            emoji: a.emoji,
            metric: a.metric,
            start_date: a.start,
            end_date: a.end,
            invitees: a.invitees,
          }),
        ),
      onSettled: done,
    }),
    respond: useMutation({
      meta: { achievements: true },
      mutationFn: async ({ id, accept }: { id: string; accept: boolean }) =>
        unwrap(await supabase.rpc("respond_challenge", { cid: id, accept })),
      onSettled: () => {
        done();
        qc.invalidateQueries({ queryKey: ["notices"] });
      },
    }),
    leave: useMutation({
      meta: { achievements: true },
      mutationFn: async (id: string) => unwrap(await supabase.rpc("leave_challenge", { cid: id })),
      onSettled: done,
    }),
    invite: useMutation({
      meta: { achievements: true },
      mutationFn: async ({ id, uids }: { id: string; uids: string[] }) =>
        unwrap<number>(await supabase.rpc("invite_to_challenge", { cid: id, uids })),
      onSettled: done,
    }),
  };
}

// ───────────── Аккаунт

export async function exportData() {
  const { data, error } = await supabase.functions.invoke("account", { body: { action: "export" } });
  if (error) throw error;
  return data as { ok?: boolean; error?: string; sent?: number; total?: number };
}

export async function deleteAccount() {
  const { data, error } = await supabase.functions.invoke("account", { body: { action: "delete" } });
  if (error) throw error;
  return data as { ok?: boolean };
}

// ───────────── Еда по фото (ИИ)

export type AiFoodItem = Macros & {
  name: string;
  grams: number;
  confidence: number;
  /** food — базовый продукт Emli, product — товар из базы товаров (с брендом), ai — оценка модели */
  source: "food" | "product" | "recipe" | "ai";
  food_id: string | null;
  matched: string | null;
  brand?: string | null;
  /** Подано рядом с блюдом (хлеб, соус в пиале, варенье) — легко убрать, если не ел */
  separate?: boolean;
  per100: [number, number, number, number];
};
export type AiFoodResult = { dish: string | null; comment: string | null; items: AiFoodItem[]; total: Macros; ms: Record<string, number> };
export type AiFoodError = "limit" | "bad_image" | "network" | "failed";

/** Фото → продукты с граммовкой, найденные в базе Emli. Бросает Error с кодом AiFoodError */
export async function recognizeFood(image: string, hint?: string): Promise<AiFoodResult> {
  const { data, error } = await supabase.functions.invoke("ai-food", { body: { image, hint } });
  if (error) {
    let code: AiFoodError = "failed";
    try {
      const ctx = (error as { context?: Response }).context;
      if (!ctx) code = "network";
      else {
        const body = await ctx.json();
        code = body.error === "limit" ? "limit" : body.error === "bad_image" ? "bad_image" : "failed";
      }
    } catch {
      code = "network";
    }
    throw new Error(code);
  }
  return data as AiFoodResult;
}

/** Файл с камеры → JPEG data URL до 1024 px (быстрее и дешевле для ИИ) */
export async function photoToDataUrl(file: File) {
  const { compressImage } = await import("./social");
  const blob = await compressImage(file, 1024, 0.82);
  return await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
