import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUid } from "@/lib/auth";
import { shiftKey, todayKey } from "@/lib/dates";
import type {
  DayTotal,
  Entry,
  Food,
  FoodDraft,
  Goal,
  Profile,
  RecentFood,
  Settings,
  Targets,
  Weight,
} from "@/lib/types";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const numify = <T extends object>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row };
  for (const k of keys) if (out[k] != null) (out as Record<keyof T, unknown>)[k] = Number(out[k]);
  return out;
};
const MACRO_KEYS = ["kcal", "protein", "fat", "carbs"] as const;

export const qk = {
  profile: ["profile"] as const,
  settings: ["settings"] as const,
  entries: (day: string) => ["entries", day] as const,
  totals: ["totals"] as const,
  weights: ["weights"] as const,
  targets: ["targets"] as const,
  goal: ["goal"] as const,
  recents: ["recents"] as const,
  myFoods: ["my-foods"] as const,
  search: (q: string) => ["search", q] as const,
};

// ───────────── Профиль и настройки

export function useProfile() {
  const uid = useUid();
  return useQuery({
    queryKey: qk.profile,
    queryFn: async () => unwrap<Profile>(await supabase.from("profiles").select("*").eq("id", uid).single()),
  });
}

export function useSettings() {
  const uid = useUid();
  return useQuery({
    queryKey: qk.settings,
    queryFn: async () => {
      const row = unwrap<Settings | null>(await supabase.from("user_settings").select("*").eq("user_id", uid).maybeSingle());
      return row ? numify(row, ["height_cm", "activity"]) : null;
    },
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (patch: Partial<Settings>) =>
      unwrap(await supabase.from("user_settings").upsert({ user_id: uid, ...patch }).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.settings }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) =>
      unwrap(await supabase.from("profiles").update(patch).eq("id", uid).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profile }),
  });
}

// ───────────── Дневник

export function useEntries(day: string) {
  return useQuery({
    queryKey: qk.entries(day),
    queryFn: async () =>
      unwrap<Entry[]>(await supabase.from("food_entries").select("*").eq("day", day).order("created_at")).map((e) =>
        numify(e, [...MACRO_KEYS, "grams"]),
      ),
    placeholderData: keepPreviousData,
  });
}

/** Суммы по дням за последние ~полгода: хватает для недели, графиков и оценки расхода */
export function useTotals() {
  return useQuery({
    queryKey: qk.totals,
    queryFn: async () => {
      const rows = unwrap<DayTotal[]>(
        await supabase.rpc("daily_totals", { from_day: shiftKey(todayKey(), -180), to_day: shiftKey(todayKey(), 60) }),
      );
      return rows.map((r) => numify(r, [...MACRO_KEYS]));
    },
  });
}

export type NewEntry = Omit<Entry, "id" | "user_id" | "created_at">;

export function useAddEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: NewEntry) => unwrap<Entry>(await supabase.from("food_entries").insert(e).select().single()),
    onMutate: async (e) => {
      await qc.cancelQueries({ queryKey: qk.entries(e.day) });
      const prev = qc.getQueryData<Entry[]>(qk.entries(e.day));
      const temp: Entry = { ...e, id: `temp-${Math.random()}`, user_id: "", created_at: new Date().toISOString() };
      qc.setQueryData<Entry[]>(qk.entries(e.day), (old) => [...(old ?? []), temp]);
      return { prev, day: e.day };
    },
    onError: (_err, _e, ctx) => ctx && qc.setQueryData(qk.entries(ctx.day), ctx.prev),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: qk.entries(vars.day) });
      qc.invalidateQueries({ queryKey: qk.totals });
      qc.invalidateQueries({ queryKey: qk.recents });
    },
  });
}

export function useUpdateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; day: string; patch: Partial<NewEntry> }) =>
      unwrap<Entry>(await supabase.from("food_entries").update(patch).eq("id", id).select().single()),
    onMutate: async ({ id, day, patch }) => {
      await qc.cancelQueries({ queryKey: qk.entries(day) });
      const prev = qc.getQueryData<Entry[]>(qk.entries(day));
      qc.setQueryData<Entry[]>(qk.entries(day), (old) => old?.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      return { prev, day };
    },
    onError: (_err, _v, ctx) => ctx && qc.setQueryData(qk.entries(ctx.day), ctx.prev),
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: qk.entries(v.day) });
      if (v.patch.day) qc.invalidateQueries({ queryKey: qk.entries(v.patch.day) });
      qc.invalidateQueries({ queryKey: qk.totals });
    },
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; day: string }) => unwrap(await supabase.from("food_entries").delete().eq("id", id)),
    onMutate: async ({ id, day }) => {
      await qc.cancelQueries({ queryKey: qk.entries(day) });
      const prev = qc.getQueryData<Entry[]>(qk.entries(day));
      qc.setQueryData<Entry[]>(qk.entries(day), (old) => old?.filter((e) => e.id !== id));
      return { prev, day };
    },
    onError: (_err, _v, ctx) => ctx && qc.setQueryData(qk.entries(ctx.day), ctx.prev),
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: qk.entries(v.day) });
      qc.invalidateQueries({ queryKey: qk.totals });
      qc.invalidateQueries({ queryKey: qk.recents });
    },
  });
}

// ───────────── Продукты

export function useFoodSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: qk.search(term),
    enabled: term.length >= 2,
    queryFn: async () =>
      unwrap<Food[]>(await supabase.rpc("search_foods", { q: term, lim: 40 })).map((f) => numify(f, [...MACRO_KEYS, "serving_g"])),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useRecents() {
  return useQuery({
    queryKey: qk.recents,
    queryFn: async () =>
      unwrap<RecentFood[]>(await supabase.rpc("recent_foods", { lim: 40 })).map((f) => numify(f, [...MACRO_KEYS, "grams"])),
  });
}

export function useMyFoods() {
  const uid = useUid();
  return useQuery({
    queryKey: qk.myFoods,
    queryFn: async () =>
      unwrap<Food[]>(await supabase.from("foods").select("*").eq("owner_id", uid).order("created_at", { ascending: false })).map((f) =>
        numify(f, [...MACRO_KEYS, "serving_g"]),
      ),
  });
}

export async function getFood(id: string) {
  const f = unwrap<Food>(await supabase.from("foods").select("*").eq("id", id).single());
  return numify(f, [...MACRO_KEYS, "serving_g"]);
}

export async function findFoodByBarcode(code: string) {
  const rows = unwrap<Food[]>(await supabase.from("foods").select("*").eq("barcode", code).limit(1));
  return rows[0] ? numify(rows[0], [...MACRO_KEYS, "serving_g"]) : null;
}

export function useSaveFood() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (f: FoodDraft) => {
      const { id, ...rest } = f;
      const row = { ...rest, owner_id: uid, source: rest.source === "system" ? "user" : rest.source };
      const res = id
        ? await supabase.from("foods").update(row).eq("id", id).select().single()
        : await supabase.from("foods").insert(row).select().single();
      return numify(unwrap<Food>(res), [...MACRO_KEYS, "serving_g"]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.myFoods });
      qc.invalidateQueries({ queryKey: ["search"] });
    },
  });
}

export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from("foods").delete().eq("id", id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.myFoods });
      qc.invalidateQueries({ queryKey: ["search"] });
    },
  });
}

// ───────────── Вес

export function useWeights() {
  return useQuery({
    queryKey: qk.weights,
    queryFn: async () =>
      unwrap<Weight[]>(await supabase.from("weights").select("day,weight_kg,body_fat").order("day")).map((w) =>
        numify(w, ["weight_kg", "body_fat"]),
      ),
  });
}

export function useSaveWeight() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (w: Weight) => unwrap(await supabase.from("weights").upsert({ user_id: uid, ...w })),
    onMutate: async (w) => {
      await qc.cancelQueries({ queryKey: qk.weights });
      const prev = qc.getQueryData<Weight[]>(qk.weights);
      qc.setQueryData<Weight[]>(qk.weights, (old) =>
        [...(old ?? []).filter((x) => x.day !== w.day), w].sort((a, b) => a.day.localeCompare(b.day)),
      );
      return { prev };
    },
    onError: (_e, _w, ctx) => ctx && qc.setQueryData(qk.weights, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.weights }),
  });
}

export function useDeleteWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (day: string) => unwrap(await supabase.from("weights").delete().eq("day", day)),
    onMutate: async (day) => {
      const prev = qc.getQueryData<Weight[]>(qk.weights);
      qc.setQueryData<Weight[]>(qk.weights, (old) => old?.filter((x) => x.day !== day));
      return { prev };
    },
    onError: (_e, _d, ctx) => ctx && qc.setQueryData(qk.weights, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.weights }),
  });
}

// ───────────── Цель и программа

export function useGoal() {
  return useQuery({
    queryKey: qk.goal,
    queryFn: async () => {
      const g = unwrap<Goal | null>(
        await supabase.from("goals").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      );
      return g ? numify(g, ["start_weight", "target_weight", "rate_kg_week"]) : null;
    },
  });
}

export function useGoalHistory() {
  return useQuery({
    queryKey: [...qk.goal, "history"],
    queryFn: async () =>
      unwrap<Goal[]>(await supabase.from("goals").select("*").order("created_at", { ascending: false })).map((g) =>
        numify(g, ["start_weight", "target_weight", "rate_kg_week"]),
      ),
  });
}

export function useSaveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (g: Omit<Goal, "id" | "created_at">) => unwrap(await supabase.from("goals").insert(g).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.goal }),
  });
}

export function useTargets() {
  return useQuery({
    queryKey: qk.targets,
    queryFn: async () => unwrap<Targets[]>(await supabase.from("targets").select("*").order("start_date")),
  });
}

export function useSaveTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Omit<Targets, "id" | "created_at">) => {
      // Одна программа на дату: при повторном сохранении в тот же день — заменяем
      await supabase.from("targets").delete().eq("start_date", t.start_date);
      return unwrap(await supabase.from("targets").insert(t).select().single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.targets }),
  });
}
