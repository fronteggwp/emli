import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUid } from "@/lib/auth";
import type { Exercise, Muscle } from "@/lib/exercise";
import { PROGRAMS, programByKey, programWeekdays, type ProgramExercise } from "./programs";
import type { Session as PlanSession } from "@/lib/progression";

type Session = PlanSession & { id: string };

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const wk = {
  catalog: ["ex-catalog"] as const,
  custom: ["ex-custom"] as const,
  routines: ["routines"] as const,
  workouts: ["workouts"] as const,
  workout: (id: string) => ["workout", id] as const,
  bests: ["ex-bests"] as const,
  last: (ids: string) => ["last-sets", ids] as const,
  history: (ex: string) => ["ex-history", ex] as const,
};

// ───────────── Каталог упражнений

type CustomExercise = { id: string; name: string; category: string; equipment: string | null; muscles: string[] };

/** Каталог (873 упражнения) + свои упражнения пользователя */
export function useCatalog() {
  const base = useQuery({
    queryKey: wk.catalog,
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}ex/catalog.json`);
      if (!res.ok) throw new Error("catalog");
      return (await res.json()) as Exercise[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const custom = useQuery({
    queryKey: wk.custom,
    queryFn: async () => unwrap<CustomExercise[]>(await supabase.from("custom_exercises").select("*").order("created_at")),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    const own: Exercise[] = (custom.data ?? []).map((c) => ({
      id: `c:${c.id}`,
      n: c.name,
      en: c.name,
      a: [],
      c: (c.category as Exercise["c"]) ?? "strength",
      e: (c.equipment as Exercise["e"]) ?? null,
      l: "beginner",
      f: null,
      m: null,
      pm: c.muscles as Muscle[],
      sm: [],
      i: [],
      t: [],
      p: 2,
      img: 0,
      custom: true,
    }));
    const list = [...own, ...(base.data ?? [])];
    return { list, byId: new Map(list.map((e) => [e.id, e])), loading: base.isLoading };
  }, [base.data, custom.data, base.isLoading]);
}

export function useCreateCustomExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { name: string; category: string; equipment: string | null; muscles: string[] }) =>
      unwrap<CustomExercise>(await supabase.from("custom_exercises").insert(c).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: wk.custom }),
  });
}

// ───────────── Шаблоны (routines) и программы

export type RoutineExercise = { ex: string; sets: { reps: string; kind?: string }[]; rest: number; note?: string; group?: string };
export type Routine = {
  id: string;
  name: string;
  program: string | null;
  program_day: number | null;
  position: number;
  exercises: RoutineExercise[];
  updated_at: string;
};

export function useRoutines() {
  return useQuery({
    queryKey: wk.routines,
    queryFn: async () =>
      unwrap<Routine[]>(await supabase.from("routines").select("*").order("program").order("program_day").order("position")),
  });
}

export function useSaveRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Partial<Routine> & { name: string; exercises: RoutineExercise[] }) => {
      const { id, ...row } = r;
      return unwrap<Routine>(
        id
          ? await supabase.from("routines").update(row).eq("id", id).select().single()
          : await supabase.from("routines").insert(row).select().single(),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: wk.routines }),
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from("routines").delete().eq("id", id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: wk.routines }),
  });
}

const toRoutineEx = (x: ProgramExercise): RoutineExercise => ({
  ex: x.ex,
  sets: Array.from({ length: x.sets }, () => ({ reps: x.reps })),
  rest: x.rest,
  note: x.note,
});

/** Взять программу: дни превращаются в шаблоны, которые можно править под себя */
export function useStartProgram() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (key: string) => {
      const p = programByKey(key);
      if (!p) throw new Error("program");
      void uid;
      // Шаблоны, настройки и дни напоминаний — одной операцией на сервере
      unwrap(
        await supabase.rpc("start_program", {
          key,
          days: p.days.map((d, i) => ({ name: d.title, program_day: i, position: i, exercises: d.exercises.map(toRoutineEx) })),
          workout_days: programWeekdays(p),
          label: `${p.title} · ${p.days[0].title}`,
        }),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wk.routines });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["reminders"] });
      qc.invalidateQueries({ queryKey: ["program-state"] });
    },
  });
}

export function useStopProgram() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async () => {
      void uid;
      unwrap(await supabase.rpc("stop_program"));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["reminders"] });
    },
  });
}

// ───────────── История тренировок

export type WorkoutRow = {
  id: string;
  name: string;
  routine_id: string | null;
  program: string | null;
  program_day: number | null;
  started_at: string;
  finished_at: string;
  duration_s: number;
  kcal: number;
  volume: number;
  sets_done: number;
  prs: PR[];
  muscles: Record<string, number>;
  notes: string | null;
};

export type SetRow = {
  id: string;
  workout_id: string;
  exercise: string;
  ex_order: number;
  set_order: number;
  kind: "normal" | "warmup" | "drop" | "failure";
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  rpe: number | null;
  done_at: string;
  target?: string | null;
  planned?: number | null;
};

export type PR = { ex: string; kind: "weight" | "e1rm" | "reps" | "volume"; value: number; prev: number | null };

const numify = <T extends object>(r: T, keys: (keyof T)[]) => {
  const o = { ...r };
  for (const k of keys) if (o[k] != null) (o as Record<keyof T, unknown>)[k] = Number(o[k]);
  return o;
};

/** Местная дата тренировки (а не UTC) — одинаково во всех разделах */
export const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function useWorkouts(limit = 1000) {
  return useQuery({
    queryKey: wk.workouts,
    queryFn: async () =>
      unwrap<WorkoutRow[]>(await supabase.from("workouts").select("*").order("started_at", { ascending: false }).limit(limit)).map(
        (w) => numify(w, ["volume"]),
      ),
  });
}

export function useWorkoutDetail(id: string) {
  return useQuery({
    queryKey: wk.workout(id),
    queryFn: async () => {
      const [w, sets] = await Promise.all([
        supabase.from("workouts").select("*").eq("id", id).single(),
        supabase.from("workout_sets").select("*").eq("workout_id", id).order("ex_order").order("set_order"),
      ]);
      return {
        workout: numify(unwrap<WorkoutRow>(w), ["volume"]),
        sets: unwrap<SetRow[]>(sets).map((s) => numify(s, ["weight", "rpe"])),
      };
    },
  });
}

export function useDeleteWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from("workouts").delete().eq("id", id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wk.workouts });
      qc.invalidateQueries({ queryKey: wk.bests });
      qc.invalidateQueries({ queryKey: ["ex-history"] });
      qc.invalidateQueries({ queryKey: ["ex-sessions"] });
      qc.invalidateQueries({ queryKey: ["last-sets"] });
    },
  });
}

// ───────────── Рекорды и прошлые подходы

export type Best = { exercise: string; best_weight: number | null; best_e1rm: number | null; best_reps: number | null; best_volume: number | null; sets: number; last_done: string };

export function useBests() {
  return useQuery({
    queryKey: wk.bests,
    queryFn: async () => {
      const rows = unwrap<Best[]>(await supabase.rpc("exercise_bests"));
      return new Map(rows.map((r) => [r.exercise, numify(r, ["best_weight", "best_e1rm", "best_volume"])]));
    },
  });
}

export function useLastSets(ids: string[]) {
  const key = [...new Set(ids)].sort().join(",");
  return useQuery({
    queryKey: wk.last(key),
    enabled: !!key,
    queryFn: async () => {
      const rows = unwrap<SetRow[]>(await supabase.rpc("last_sets", { exs: key.split(",") }));
      const map = new Map<string, SetRow[]>();
      for (const r of rows) {
        const s = numify(r, ["weight"]);
        map.set(s.exercise, [...(map.get(s.exercise) ?? []), s]);
      }
      return map;
    },
    staleTime: 60_000,
  });
}

/** Последние тренировки с этими упражнениями, по сессиям (новые сначала) — для прогрессии */
export function useSessions(ids: string[]) {
  const key = [...new Set(ids)].sort().join(",");
  return useQuery({
    queryKey: ["ex-sessions", key],
    enabled: !!key,
    queryFn: async () => {
      type Row = Pick<SetRow, "exercise" | "weight" | "reps" | "kind" | "set_order" | "ex_order" | "workout_id" | "done_at"> & {
        target: string | null;
        planned: number | null;
        workouts: { started_at: string; program_day: number | null; program: string | null } | null;
      };
      const res = await supabase
        .from("workout_sets")
        .select("exercise,weight,reps,kind,set_order,ex_order,workout_id,done_at,target,planned,workouts(started_at,program_day,program)")
        .in("exercise", key.split(","))
        .order("done_at", { ascending: false })
        .limit(600);
      const rows = unwrap(res as unknown as { data: Row[] | null; error: { message: string } | null });
      const map = new Map<string, Session[]>();
      for (const r of rows) {
        const list = map.get(r.exercise) ?? [];
        let s = list.find((x) => x.id === r.workout_id);
        if (!s) {
          if (list.length >= 6) continue;
          s = {
            id: r.workout_id,
            at: r.workouts?.started_at ?? r.done_at,
            programDay: r.workouts?.program_day ?? null,
            program: r.workouts?.program ?? null,
            sets: [],
          };
          list.push(s);
          map.set(r.exercise, list);
        }
        s.sets.push({
          weight: Number(r.weight ?? 0),
          reps: Number(r.reps ?? 0),
          kind: r.kind,
          target: r.target,
          planned: r.planned,
          order: r.ex_order * 100 + r.set_order,
        });
      }
      // Внутри тренировки — в порядке выполнения
      for (const list of map.values()) for (const s of list) s.sets.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return map;
    },
    staleTime: 60_000,
  });
}

export function useExerciseHistory(ex: string) {
  return useQuery({
    queryKey: wk.history(ex),
    queryFn: async () => {
      const rows = unwrap<(SetRow & { workouts: { started_at: string; name: string } })[]>(
        await supabase
          .from("workout_sets")
          .select("*, workouts(started_at, name)")
          .eq("exercise", ex)
          .order("done_at", { ascending: false })
          .limit(400),
      );
      return rows.map((r) => numify(r, ["weight"]));
    },
  });
}

// ───────────── Сохранение завершённой тренировки

export type FinishPayload = {
  workout: Omit<WorkoutRow, "id"> & { id: string };
  sets: Omit<SetRow, "id" | "workout_id">[];
};

export function useSaveWorkout() {
  const qc = useQueryClient();
  return useMutation({
    // Тренировка и подходы — одной операцией; повтор после обрыва связи не создаст дубль
    mutationFn: async ({ workout, sets }: FinishPayload) => {
      unwrap(await supabase.rpc("save_workout", { w: workout, s: sets }));
      return workout.id;
    },
    retry: 3,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
    meta: { achievements: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wk.workouts });
      qc.invalidateQueries({ queryKey: wk.bests });
      qc.invalidateQueries({ queryKey: ["last-sets"] });
      qc.invalidateQueries({ queryKey: ["ex-history"] });
      qc.invalidateQueries({ queryKey: ["ex-sessions"] });
    },
  });
}

/** Следующий день активной программы — по последней тренировке из неё с момента текущего запуска */
export function nextProgramDay(programKey: string | null | undefined, workouts: WorkoutRow[] | undefined, startedAt?: string | null) {
  const p = programByKey(programKey);
  if (!p) return null;
  const last = workouts?.find(
    (w) => w.program === p.key && w.program_day != null && (!startedAt || localDay(w.started_at) >= startedAt),
  );
  const idx = last ? ((last.program_day ?? -1) + 1) % p.days.length : 0;
  return { program: p, index: idx, day: p.days[idx] };
}

export { PROGRAMS };

// ───────────── Состояние программ (тренировочный максимум 5/3/1)

export function useProgramState(program: string | null) {
  return useQuery({
    queryKey: ["program-state", program ?? ""],
    enabled: !!program,
    queryFn: async () => {
      const rows = unwrap<{ exercise: string; tm: number; cycle: number }[]>(
        await supabase.from("program_state").select("exercise,tm,cycle").eq("program", program!),
      );
      return new Map(rows.map((r) => [r.exercise, { tm: Number(r.tm), cycle: r.cycle }]));
    },
    staleTime: 5 * 60_000,
  });
}

export function useSaveProgramState() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (r: { program: string; exercise: string; tm: number; cycle: number }) =>
      unwrap(await supabase.from("program_state").upsert({ user_id: uid, ...r, updated_at: new Date().toISOString() })),
    onSettled: () => qc.invalidateQueries({ queryKey: ["program-state"] }),
  });
}
