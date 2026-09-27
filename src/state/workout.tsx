import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { uuid } from "@/data/social";
import type { RoutineExercise, SetRow } from "@/data/workouts";

// Текущая тренировка живёт на телефоне (localStorage) — не пропадёт без сети в подвальном зале.
// В базу уходит целиком при завершении.

export type SetKind = "normal" | "warmup" | "drop" | "failure";
export type SetDraft = { id: string; kind: SetKind; weight: string; reps: string; seconds: string; done: boolean; target?: string };
export type ExDraft = { key: string; ex: string; rest: number; note?: string; sets: SetDraft[]; group?: string };
export type Draft = {
  id: string;
  name: string;
  routineId: string | null;
  program: string | null;
  programDay: number | null;
  startedAt: string;
  exercises: ExDraft[];
};
export type Rest = { endAt: number; total: number; exKey: string } | null;

type StartOpts = {
  name: string;
  routineId?: string | null;
  program?: string | null;
  programDay?: number | null;
  exercises?: RoutineExercise[];
  last?: Map<string, SetRow[]>;
};

type Api = {
  draft: Draft | null;
  rest: Rest;
  start: (o: StartOpts) => Draft;
  update: (fn: (d: Draft) => Draft) => void;
  discard: () => void;
  startRest: (seconds: number, exKey: string) => void;
  adjustRest: (delta: number) => void;
  stopRest: () => void;
};

const KEY = "emli-workout";
const Ctx = createContext<Api | null>(null);
export const useWorkoutDraft = () => useContext(Ctx)!;


export function newSet(prev?: Partial<SetDraft>, target?: string): SetDraft {
  return { id: uuid(), kind: "normal", weight: prev?.weight ?? "", reps: prev?.reps ?? "", seconds: prev?.seconds ?? "", done: false, target };
}

/** Упражнение для тренировки: подходы из шаблона, веса — из прошлого раза */
export function exDraftFrom(ex: string, tpl: RoutineExercise | null, last?: SetRow[]): ExDraft {
  const working = (last ?? []).filter((s) => s.kind !== "warmup");
  const count = tpl?.sets.length ?? Math.max(working.length, 3);
  // Поля пустые: серые подсказки (прошлый раз / предыдущий подход) видны прямо в полях,
  // а галочка по пустому подходу берёт значения из подсказки
  const sets = Array.from({ length: count }, (_, i) => newSet(undefined, tpl?.sets[i]?.reps));
  return { key: uuid(), ex, rest: tpl?.rest ?? 90, note: tpl?.note, sets };
}

function load(): { draft: Draft | null; rest: Rest } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw?.draft?.id) return { draft: raw.draft, rest: raw.rest && raw.rest.endAt > Date.now() ? raw.rest : null };
  } catch {
    /* повреждённые данные — начинаем с чистого листа */
  }
  return { draft: null, rest: null };
}

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(load);
  const saveTimer = useRef<number | undefined>(undefined);

  // Сохраняем с небольшой задержкой, чтобы не писать на каждую цифру
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        if (state.draft) localStorage.setItem(KEY, JSON.stringify(state));
        else localStorage.removeItem(KEY);
      } catch {
        /* нет места — не критично */
      }
    }, 250);
  }, [state]);

  // Перед закрытием приложения — сохранить сразу
  useEffect(() => {
    const flush = () => {
      try {
        if (state.draft) localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [state]);

  const start = useCallback((o: StartOpts) => {
    const draft: Draft = {
      id: uuid(),
      name: o.name,
      routineId: o.routineId ?? null,
      program: o.program ?? null,
      programDay: o.programDay ?? null,
      startedAt: new Date().toISOString(),
      exercises: (o.exercises ?? []).map((x) => exDraftFrom(x.ex, x, o.last?.get(x.ex))),
    };
    setState({ draft, rest: null });
    return draft;
  }, []);

  const update = useCallback((fn: (d: Draft) => Draft) => setState((s) => (s.draft ? { ...s, draft: fn(s.draft) } : s)), []);
  const discard = useCallback(() => setState({ draft: null, rest: null }), []);
  const startRest = useCallback(
    (seconds: number, exKey: string) => setState((s) => ({ ...s, rest: seconds > 0 ? { endAt: Date.now() + seconds * 1000, total: seconds, exKey } : null })),
    [],
  );
  const adjustRest = useCallback(
    (delta: number) =>
      setState((s) =>
        s.rest ? { ...s, rest: { ...s.rest, endAt: Math.max(Date.now(), s.rest.endAt + delta * 1000), total: Math.max(s.rest.total + delta, 1) } } : s,
      ),
    [],
  );
  const stopRest = useCallback(() => setState((s) => ({ ...s, rest: null })), []);

  const api = useMemo<Api>(
    () => ({ draft: state.draft, rest: state.rest, start, update, discard, startRest, adjustRest, stopRest }),
    [state, start, update, discard, startRest, adjustRest, stopRest],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Секундомер: тикает раз в секунду, пока компонент на экране */
export function useNow(active = true, ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

export function fmtDuration(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
}
