import { useState } from "react";
import { ArrowDown, ArrowUp, Minus, Play, Plus, Trash, X } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { useCatalog, useDeleteRoutine, useLastSets, useSaveRoutine, type Routine, type RoutineExercise } from "@/data/workouts";
import { fmtDuration, useWorkoutDraft } from "@/state/workout";
import { confirmDialog, haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { ExerciseImage } from "@/ui/ExerciseImage";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { ExercisesScreen } from "./Exercises";
import { ActiveWorkoutScreen } from "./ActiveWorkout";
import "./workouts.css";

const REST = [45, 60, 90, 120, 180];

/** Шаблон тренировки: свой или день программы (его тоже можно подстроить под себя) */
export function RoutineScreen({ routine }: { routine?: Routine }) {
  const nav = useNav();
  const layer = useLayer();
  const toast = useToast();
  const catalog = useCatalog();
  const save = useSaveRoutine();
  const del = useDeleteRoutine();
  const wd = useWorkoutDraft();
  const [name, setName] = useState(routine?.name ?? "");
  const [items, setItems] = useState<RoutineExercise[]>(routine?.exercises ?? []);
  const last = useLastSets(items.map((x) => x.ex));

  const upd = (i: number, patch: Partial<RoutineExercise>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setCount = (i: number, n: number) =>
    setItems((l) =>
      l.map((x, j) => {
        if (j !== i) return x;
        const reps = x.sets[0]?.reps ?? "8-12";
        return { ...x, sets: Array.from({ length: Math.min(Math.max(n, 1), 10) }, (_, k) => x.sets[k] ?? { reps }) };
      }),
    );
  const setReps = (i: number, reps: string) => setItems((l) => l.map((x, j) => (j === i ? { ...x, sets: x.sets.map(() => ({ reps })) } : x)));
  const move = (i: number, dir: -1 | 1) => {
    haptic.select();
    setItems((l) => {
      const c = [...l];
      const [it] = c.splice(i, 1);
      c.splice(i + dir, 0, it);
      return c;
    });
  };

  const canSave = name.trim().length > 0 && items.length > 0;

  const doSave = async () => {
    const saved = await save.mutateAsync({ id: routine?.id, name: name.trim(), exercises: items, program: routine?.program ?? null, program_day: routine?.program_day ?? null });
    haptic.success();
    toast("Шаблон сохранён");
    return saved;
  };

  const start = async () => {
    if (wd.draft) {
      toast("Сначала заверши текущую тренировку");
      return;
    }
    const saved = canSave ? await doSave() : null;
    wd.start({
      name: name.trim() || "Тренировка",
      routineId: saved?.id ?? null,
      program: routine?.program ?? null,
      programDay: routine?.program_day ?? null,
      exercises: items,
      last: last.data,
    });
    layer.close();
    nav.push(<ActiveWorkoutScreen />);
  };

  return (
    <Screen
      title={routine ? "Шаблон" : "Новый шаблон"}
      right={
        routine && !routine.program ? (
          <Tap
            className="icon-btn"
            onClick={async () => {
              if (!(await confirmDialog("Удалить шаблон?"))) return;
              del.mutate(routine.id);
              layer.close();
            }}
            aria-label="Удалить"
          >
            <Trash size={18} />
          </Tap>
        ) : undefined
      }
    >
      <input
        className="input"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название, например «Грудь и трицепс»"
        style={{ fontSize: 19, fontWeight: 700, height: 56 }}
      />

      <div className="stack" style={{ marginTop: 14 }}>
        {items.map((x, i) => {
          const ex = catalog.byId.get(x.ex);
          if (!ex) return null;
          return (
            <div key={`${x.ex}-${i}`} className="aw-ex" style={{ paddingBottom: 12 }}>
              <div className="aw-ex-head">
                <ExerciseImage ex={ex} animate={false} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="aw-ex-name">{ex.n}</div>
                </div>
                <div className="row" style={{ gap: 2 }}>
                  {i > 0 && (
                    <button className="icon-btn" style={{ width: 32, height: 32, background: "transparent" }} onClick={() => move(i, -1)}>
                      <ArrowUp size={17} />
                    </button>
                  )}
                  {i < items.length - 1 && (
                    <button className="icon-btn" style={{ width: 32, height: 32, background: "transparent" }} onClick={() => move(i, 1)}>
                      <ArrowDown size={17} />
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    style={{ width: 32, height: 32, background: "transparent", color: "var(--danger)" }}
                    onClick={() => {
                      haptic.rigid();
                      setItems((l) => l.filter((_, j) => j !== i));
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="row" style={{ gap: 10, marginTop: 12 }}>
                <div className="row" style={{ gap: 6 }}>
                  <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setCount(i, x.sets.length - 1)}>
                    <Minus size={16} />
                  </button>
                  <span className="num" style={{ fontWeight: 800, fontSize: 17, minWidth: 64, textAlign: "center" }}>
                    {x.sets.length} подх.
                  </span>
                  <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setCount(i, x.sets.length + 1)}>
                    <Plus size={16} />
                  </button>
                </div>
                <label className="row" style={{ gap: 6, flex: 1 }}>
                  <span className="faint" style={{ fontSize: 13 }}>
                    повт.
                  </span>
                  <input
                    className="set-in"
                    value={x.sets[0]?.reps ?? ""}
                    placeholder="8-12"
                    onChange={(e) => setReps(i, e.target.value.replace(/[^\dсмакx\- ]/gi, "").slice(0, 10))}
                  />
                </label>
              </div>
              <div className="chips-row" style={{ padding: "10px 0 0" }}>
                {REST.map((r) => (
                  <Tap
                    key={r}
                    className={`chip ${x.rest === r ? "on" : ""}`}
                    style={{ height: 30, fontSize: 12.5 }}
                    onClick={() => {
                      haptic.select();
                      upd(i, { rest: r });
                    }}
                  >
                    отдых {fmtDuration(r)}
                  </Tap>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Tap
        className="btn btn-block"
        style={{ marginTop: 12, background: "rgba(124,140,255,.14)", color: "var(--kcal)" }}
        onClick={() =>
          nav.push(
            <ExercisesScreen
              pick
              onPick={(ids) => setItems((l) => [...l, ...ids.map((ex) => ({ ex, sets: [{ reps: "8-12" }, { reps: "8-12" }, { reps: "8-12" }], rest: 90 }))])}
            />,
          )
        }
      >
        <Plus size={19} /> Добавить упражнения
      </Tap>

      <div className="row" style={{ gap: 10, marginTop: 20 }}>
        <Tap
          className="btn btn-block"
          disabled={!canSave || save.isPending}
          onClick={async () => {
            await doSave();
            layer.close();
          }}
        >
          Сохранить
        </Tap>
        <Tap className="btn btn-block" style={{ background: "var(--good)", color: "#062a14" }} disabled={!items.length} onClick={start}>
          <Play size={16} fill="#062a14" /> Начать
        </Tap>
      </div>
    </Screen>
  );
}
