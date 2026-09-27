// План питания: блюда, планы, общий список покупок (реалтайм), приглашения, запросы к ИИ.
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUid } from "@/lib/auth";
import { BASICS } from "@/lib/basics";
import { fromKey, shiftKey, todayKey } from "@/lib/dates";
import { entryFor, type Dict, type Dish, type PlanItem, type PlanPrefs } from "@/lib/mealplan";
import type { Meal } from "@/lib/types";
import { recipeImg, useFavorites, useRecipes, useUserRecipes, userRecipeServing, type TemplateItem } from "./engage";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const mk = {
  plans: ["meal-plans"] as const,
  shared: ["meal-plans", "shared"] as const,
  plan: (id: string) => ["meal-plans", "one", id] as const,
  marks: (id: string) => ["shop-marks", id] as const,
  members: (id: string) => ["meal-plans", "members", id] as const,
  dict: ["ingredients-dict"] as const,
};

export type MealPlan = {
  id: string;
  owner_id: string;
  start_day: string;
  days: number;
  prefs: PlanPrefs;
  items: PlanItem[];
  note: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

/** Один и тот же план слушают несколько экранов сразу — у каждого свой канал */
let chanSeq = 0;

export const planEnd = (p: Pick<MealPlan, "start_day" | "days">) => shiftKey(p.start_day, p.days - 1);
export const planDays = (p: Pick<MealPlan, "start_day" | "days">) => Array.from({ length: p.days }, (_, i) => shiftKey(p.start_day, i));

// ───────────── Словарь покупок и блюда

export function useDict() {
  return useQuery({
    queryKey: mk.dict,
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}ingredients.json`);
      if (!res.ok) throw new Error("dict");
      return (await res.json()) as Dict;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Метки ограничений для продукта: из словаря, а для неизвестного — по отделу */
function flagsOf(name: string, dict: Dict) {
  const e = entryFor(name, dict);
  if (dict[name]) return e.x;
  const byDept: Record<string, string[]> = { meat: ["meat"], fish: ["fish"], dairy: /яйц/i.test(name) ? ["egg"] : ["dairy"] };
  return byDept[e.d] ?? [];
}

export const dishKey = (kind: string, ref: string) => `${kind}:${ref}`;

/** Все блюда для плана: рецепты Emli, простые блюда и свои рецепты — ключ «kind:ref» */
export function useDishes() {
  const recipes = useRecipes();
  const mine = useUserRecipes();
  const dict = useDict();
  const favs = useFavorites();
  const data = useMemo(() => {
    if (!recipes.data || !dict.data) return null;
    const d = dict.data;
    const fav = new Set((favs.data ?? []).filter((f) => f.kind === "recipe").map((f) => f.ref));
    const map = new Map<string, Dish & { fav?: boolean }>();
    for (const r of [...recipes.data, ...BASICS]) {
      const basic = "basic" in r;
      map.set(dishKey("recipe", r.id), {
        code: "",
        kind: "recipe",
        ref: r.id,
        title: r.title,
        emoji: r.emoji,
        category: r.category,
        time: r.time,
        servings: r.servings,
        difficulty: r.difficulty,
        serving: r.serving,
        ingredients: r.ingredients.map((i) => ({ name: i.name, grams: i.grams })),
        tags: r.tags,
        flags: [...new Set(r.ingredients.flatMap((i) => flagsOf(i.name, d)))],
        basic: basic || undefined,
        meals: basic ? (r as (typeof BASICS)[number]).meals : undefined,
        img: recipeImg(r, true),
        fav: fav.has(r.id),
      });
    }
    for (const r of mine.data ?? []) {
      const s = userRecipeServing(r);
      map.set(dishKey("mine", r.id), {
        code: "",
        kind: "mine",
        ref: r.id,
        title: r.title,
        emoji: r.emoji,
        category: "main",
        time: r.time,
        servings: Math.max(1, r.servings),
        difficulty: 1,
        serving: { kcal: s.kcal, protein: s.protein, fat: s.fat, carbs: s.carbs, grams: s.grams },
        ingredients: r.ingredients.map((i) => ({ name: i.name, grams: i.grams ?? 0 })),
        tags: ["мой рецепт"],
        flags: [...new Set(r.ingredients.flatMap((i) => flagsOf(i.name, d)))],
        img: null,
        fav: true,
      });
    }
    return map;
  }, [recipes.data, mine.data, dict.data, favs.data]);
  return { map: data, dict: dict.data ?? null, loading: !data };
}

export const dishOfItem = (map: Map<string, Dish> | null | undefined, it: Pick<PlanItem, "kind" | "ref">) => map?.get(dishKey(it.kind, it.ref));

/** Элемент плана → запись в дневник */
export function planEntry(it: PlanItem): TemplateItem {
  const p = it.portions;
  return {
    food_id: null,
    name: it.title,
    brand: `по плану · ${p === 1 ? "1 порция" : `${String(p).replace(".", ",")} порц.`}`,
    grams: it.grams || null,
    kcal: it.kcal,
    protein: it.protein,
    fat: it.fat,
    carbs: it.carbs,
  };
}

// ───────────── Планы

const numifyPlan = (p: MealPlan): MealPlan => ({ ...p, items: Array.isArray(p.items) ? p.items : [] });

export function useMyPlans() {
  const uid = useUid();
  return useQuery({
    queryKey: mk.plans,
    queryFn: async () =>
      unwrap<MealPlan[]>(await supabase.from("meal_plans").select("*").eq("owner_id", uid).order("created_at", { ascending: false }).limit(30)).map(numifyPlan),
  });
}

/** Текущий свой план: не в архиве и ещё не закончился */
export function useActivePlan() {
  const plans = useMyPlans();
  const today = todayKey();
  const plan = plans.data?.find((p) => !p.archived && planEnd(p) >= today) ?? null;
  return { plan, loading: plans.isLoading };
}

export type SharedPlan = { status: "invited" | "joined"; plan: MealPlan };

export function useSharedPlans() {
  const uid = useUid();
  return useQuery({
    queryKey: mk.shared,
    queryFn: async () => {
      const rows = unwrap<{ status: "invited" | "joined"; plan: MealPlan | null }[]>(
        (await supabase.from("meal_plan_members").select("status, plan:meal_plans(*)").eq("user_id", uid)) as unknown as { data: null; error: null },
      );
      return rows.filter((r): r is SharedPlan => !!r.plan).map((r) => ({ ...r, plan: numifyPlan(r.plan) }));
    },
  });
}

export function usePlan(id: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: mk.plan(id),
    queryFn: async () => numifyPlan(unwrap<MealPlan>(await supabase.from("meal_plans").select("*").eq("id", id).single())),
    initialData: () =>
      qc.getQueryData<MealPlan[]>(mk.plans)?.find((p) => p.id === id) ?? qc.getQueryData<SharedPlan[]>(mk.shared)?.find((s) => s.plan.id === id)?.plan,
  });
  // Правки владельца видны семье сразу
  useEffect(() => {
    const ch = supabase
      .channel(`plan:${id}:${++chanSeq}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "meal_plans", filter: `id=eq.${id}` }, (payload) => {
        const row = numifyPlan(payload.new as MealPlan);
        const cur = qc.getQueryData<MealPlan>(mk.plan(id));
        if (!cur || cur.updated_at <= row.updated_at) qc.setQueryData(mk.plan(id), row);
      })
      // Кто-то принял приглашение или вышел — обновляем состав
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_plan_members", filter: `plan_id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: mk.members(id) }),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [id, qc]);
  return q;
}

export function useCreatePlan() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (p: Pick<MealPlan, "start_day" | "days" | "prefs" | "items" | "note">) => {
      // Новый план заменяет текущий: старые активные — в архив
      await supabase.from("meal_plans").update({ archived: true }).eq("owner_id", uid).eq("archived", false);
      return numifyPlan(unwrap<MealPlan>(await supabase.from("meal_plans").insert({ ...p, owner_id: uid }).select().single()));
    },
    onSuccess: (plan) => {
      qc.setQueryData<MealPlan[]>(mk.plans, (old) => [plan, ...(old ?? []).map((p) => ({ ...p, archived: true }))]);
      qc.setQueryData(mk.plan(plan.id), plan);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: mk.plans }),
  });
}

/** Изменить меню плана (оптимистично: карточки меняются мгновенно) */
export function useUpdatePlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<MealPlan, "items" | "note" | "prefs" | "archived">>) =>
      numifyPlan(unwrap<MealPlan>(await supabase.from("meal_plans").update(patch).eq("id", id).select().single())),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: mk.plan(id) });
      const prev = qc.getQueryData<MealPlan>(mk.plan(id));
      if (prev) qc.setQueryData<MealPlan>(mk.plan(id), { ...prev, ...patch });
      qc.setQueryData<MealPlan[]>(mk.plans, (old) => old?.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(mk.plan(id), ctx.prev);
      qc.invalidateQueries({ queryKey: mk.plans });
    },
    onSuccess: (plan) => {
      qc.setQueryData(mk.plan(id), plan);
      qc.setQueryData<MealPlan[]>(mk.plans, (old) => old?.map((p) => (p.id === id ? plan : p)));
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from("meal_plans").delete().eq("id", id)),
    onMutate: (id) => qc.setQueryData<MealPlan[]>(mk.plans, (old) => old?.filter((p) => p.id !== id)),
    onSettled: () => qc.invalidateQueries({ queryKey: mk.plans }),
  });
}

// ───────────── Общий список покупок

export type ShopMark = { plan_id: string; key: string; checked: boolean; have: boolean; custom: { name: string; qty?: string } | null; by_user: string | null; updated_at: string };

export function useShopMarks(planId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: mk.marks(planId),
    queryFn: async () => unwrap<ShopMark[]>(await supabase.from("shop_marks").select("*").eq("plan_id", planId)),
  });
  // Галочки второго человека появляются сразу
  useEffect(() => {
    const ch = supabase
      .channel(`shop:${planId}:${++chanSeq}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_marks", filter: `plan_id=eq.${planId}` }, (payload) => {
        qc.setQueryData<ShopMark[]>(mk.marks(planId), (old = []) => {
          if (payload.eventType === "DELETE") {
            const k = (payload.old as Partial<ShopMark>).key;
            return old.filter((m) => m.key !== k);
          }
          const row = payload.new as ShopMark;
          const cur = old.find((m) => m.key === row.key);
          if (cur && cur.updated_at > row.updated_at) return old;
          return cur ? old.map((m) => (m.key === row.key ? row : m)) : [...old, row];
        });
      })
      .subscribe((status) => status === "SUBSCRIBED" && qc.invalidateQueries({ queryKey: mk.marks(planId) }));
    return () => void supabase.removeChannel(ch);
  }, [planId, qc]);
  return q;
}

export function useSetMark(planId: string) {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (m: Pick<ShopMark, "key"> & Partial<Pick<ShopMark, "checked" | "have" | "custom">>) =>
      unwrap(await supabase.from("shop_marks").upsert({ plan_id: planId, by_user: uid, ...m }).select().single()),
    onMutate: async (m) => {
      await qc.cancelQueries({ queryKey: mk.marks(planId) });
      const prev = qc.getQueryData<ShopMark[]>(mk.marks(planId));
      const now = new Date().toISOString();
      qc.setQueryData<ShopMark[]>(mk.marks(planId), (old = []) => {
        const cur = old.find((x) => x.key === m.key);
        const base: ShopMark = cur ?? { plan_id: planId, key: m.key, checked: false, have: false, custom: null, by_user: uid, updated_at: now };
        const next = { ...base, ...m, by_user: uid, updated_at: now };
        return cur ? old.map((x) => (x.key === m.key ? next : x)) : [...old, next];
      });
      return { prev };
    },
    onError: (_e, _m, ctx) => ctx?.prev && qc.setQueryData(mk.marks(planId), ctx.prev),
  });
}

export function useDeleteMark(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => unwrap(await supabase.from("shop_marks").delete().eq("plan_id", planId).eq("key", key)),
    onMutate: (key) => qc.setQueryData<ShopMark[]>(mk.marks(planId), (old) => old?.filter((m) => m.key !== key)),
    onSettled: () => qc.invalidateQueries({ queryKey: mk.marks(planId) }),
  });
}

/** Снять все отметки (новый поход в магазин) */
export function useResetMarks(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await supabase.from("shop_marks").update({ checked: false }).eq("plan_id", planId).eq("checked", true)),
    onMutate: () => qc.setQueryData<ShopMark[]>(mk.marks(planId), (old) => old?.map((m) => ({ ...m, checked: false }))),
    onSettled: () => qc.invalidateQueries({ queryKey: mk.marks(planId) }),
  });
}

// ───────────── Семья: доступ к плану

export type PlanMember = { user_id: string; status: "invited" | "joined"; invited_by: string | null };

export function usePlanMembers(planId: string) {
  return useQuery({
    queryKey: mk.members(planId),
    queryFn: async () => unwrap<PlanMember[]>(await supabase.from("meal_plan_members").select("user_id,status,invited_by").eq("plan_id", planId)),
  });
}

export function useSharePlan(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (users: string[]) => unwrap<number>(await supabase.rpc("share_meal_plan", { pid: planId, users })),
    onSettled: () => qc.invalidateQueries({ queryKey: mk.members(planId) }),
  });
}

export function useRemoveMember(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => unwrap(await supabase.from("meal_plan_members").delete().eq("plan_id", planId).eq("user_id", userId)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: mk.members(planId) });
      qc.invalidateQueries({ queryKey: mk.shared });
    },
  });
}

export function useRespondPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => unwrap(await supabase.rpc("respond_meal_plan", { pid: id, accept })),
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: mk.shared });
      qc.invalidateQueries({ queryKey: mk.members(v.id) });
      qc.invalidateQueries({ queryKey: mk.marks(v.id) });
      qc.invalidateQueries({ queryKey: ["notices"] });
    },
  });
}

// ───────────── ИИ

export type PlanAiError = "limit" | "network" | "failed" | "few_dishes";

async function invokePlan<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ai-plan", { body });
  if (error) {
    let code: PlanAiError = "failed";
    try {
      const ctx = (error as { context?: Response }).context;
      if (!ctx) code = "network";
      else {
        const b = await ctx.json();
        code = b.error === "limit" ? "limit" : b.error === "few_dishes" ? "few_dishes" : "failed";
      }
    } catch {
      code = "network";
    }
    throw new Error(code);
  }
  return data as T;
}

export type AiCand = { c: string; t: string; k: string; min: number | null; s: number; kcal: number; p: number; f: number; cb: number; tags?: string; fav?: boolean; meals?: string };
export type AiDay = { d: number; label: string; weekend: boolean; kcal: number; protein: number; fat?: number; carbs?: number };

export const aiPlan = (body: { prefs: unknown; days: AiDay[]; cands: AiCand[]; keep?: { d: number; m: number; t: string }[] }) =>
  invokePlan<{ note: string | null; slots: { d: number; m: number; r: string; cook: boolean }[]; skip?: { d: number; m: number }[]; ms: number }>({ mode: "plan", ...body });

export const aiSwap = (body: { prefs: unknown; cands: AiCand[]; slot: { label: string; m: Meal; cur: string; kcal: number; protein: number }; menu: string[] }) =>
  invokePlan<{ options: { r: string; why: string }[] }>({ mode: "swap", ...body });

export const isWeekend = (day: string) => [0, 6].includes(fromKey(day).getDay());

// ───────────── «Съел»: запись в дневник и отметка в плане

export function useEatItem(planId: string) {
  const qc = useQueryClient();
  const update = useUpdatePlan(planId);
  return useMutation({
    meta: { achievements: true },
    mutationFn: async ({ item, eat }: { item: PlanItem; eat: boolean }) => {
      const cached = () => qc.getQueryData<MealPlan>(mk.plan(planId)) ?? qc.getQueryData<MealPlan[]>(mk.plans)?.find((p) => p.id === planId);
      const plan = cached();
      if (!plan) throw new Error("no plan");
      let entry: string | undefined;
      if (eat) {
        const e = planEntry(item);
        const row = unwrap<{ id: string }>(
          await supabase
            .from("food_entries")
            .insert({ day: item.day, meal: item.meal, food_id: null, name: e.name, brand: e.brand, grams: e.grams, kcal: Math.round(e.kcal * 10) / 10, protein: e.protein, fat: e.fat, carbs: e.carbs })
            .select("id")
            .single(),
        );
        entry = row.id;
      } else if (item.entry) {
        await supabase.from("food_entries").delete().eq("id", item.entry);
      }
      const fresh = cached() ?? plan;
      const items = fresh.items.map((i) => (i.id === item.id ? { ...i, eaten: eat, entry: eat ? entry : undefined } : i));
      await update.mutateAsync({ items });
    },
    onMutate: ({ item, eat }) => {
      // Галочка ставится сразу, не дожидаясь сервера
      const mark = (p: MealPlan) => ({ ...p, items: p.items.map((i) => (i.id === item.id ? { ...i, eaten: eat } : i)) });
      qc.setQueryData<MealPlan>(mk.plan(planId), (p) => p && mark(p));
      qc.setQueryData<MealPlan[]>(mk.plans, (old) => old?.map((p) => (p.id === planId ? mark(p) : p)));
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: mk.plan(planId) });
      qc.invalidateQueries({ queryKey: mk.plans });
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ["entries", v.item.day] });
      qc.invalidateQueries({ queryKey: ["totals"] });
    },
  });
}
