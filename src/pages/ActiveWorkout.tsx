import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { ArrowDown, ArrowUp, Check, ChevronDown, MoreHorizontal, Plus, Repeat, Timer, Trash, TrendingUp } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { supabase } from "@/lib/supabase";
import { useInsights } from "@/data/insights";
import { useBests, useCatalog, useLastSets, useSaveWorkout, type Best, type PR, type SetRow } from "@/data/workouts";
import { parseReps } from "@/data/programs";
import { exDraftFrom, fmtDuration, newSet, useNow, useWorkoutDraft, type Draft, type ExDraft, type SetDraft, type SetKind } from "@/state/workout";
import { burnedKcal, e1rm, isTimed, metOf, usesWeight, weightStep, type Exercise, type Muscle } from "@/lib/exercise";
import { parseNum } from "@/lib/hooks";
import { confirmDialog, haptic, inTelegram } from "@/lib/telegram";
import { keepFocus } from "@/lib/viewport";
import { SheetHeader } from "@/ui/Screen";
import { ExerciseImage } from "@/ui/ExerciseImage";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { ExercisesScreen } from "./Exercises";
import { ExerciseScreen } from "./ExerciseDetail";
import { WorkoutDetailScreen } from "./WorkoutDetail";
import "./workouts.css";

const KIND_LABEL: Record<SetKind, string> = { normal: "", warmup: "Р", drop: "Д", failure: "О" };
const KIND_NEXT: Record<SetKind, SetKind> = { normal: "warmup", warmup: "drop", drop: "failure", failure: "normal" };
const KIND_RU: Record<SetKind, string> = { normal: "Рабочий", warmup: "Разминка", drop: "Дроп-сет", failure: "До отказа" };

const fmtW = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

async function fetchLast(ids: string[]) {
  const { data } = await supabase.rpc("last_sets", { exs: ids });
  const map = new Map<string, SetRow[]>();
  for (const r of (data ?? []) as SetRow[]) map.set(r.exercise, [...(map.get(r.exercise) ?? []), { ...r, weight: r.weight == null ? null : Number(r.weight) }]);
  return map;
}

export function ActiveWorkoutScreen() {
  const wd = useWorkoutDraft();
  const nav = useNav();
  const layer = useLayer();
  const toast = useToast();
  const catalog = useCatalog();
  const ins = useInsights();
  const bests = useBests();
  const save = useSaveWorkout();
  const d = wd.draft;
  const last = useLastSets(d?.exercises.map((e) => e.ex) ?? []);
  const now = useNow(!!d);
  const [saving, setSaving] = useState(false);

  // Тренировку отменили/завершили на другом экране — закрываемся
  useEffect(() => {
    if (!d && !saving) layer.close();
  }, [d, saving, layer]);
  if (!d) return <div className="aw" />;

  const addExercises = async (ids: string[]) => {
    const lastMap = await fetchLast(ids).catch(() => new Map<string, SetRow[]>());
    wd.update((x) => ({ ...x, exercises: [...x.exercises, ...ids.map((id) => exDraftFrom(id, null, lastMap.get(id)))] }));
  };

  const finish = async () => {
    const doneSets = d.exercises.reduce((s, e) => s + e.sets.filter((x) => x.done).length, 0);
    if (!doneSets) {
      if (await confirmDialog("Ни один подход не отмечен. Отменить тренировку?")) {
        wd.discard();
        layer.close();
      }
      return;
    }
    const undone = d.exercises.reduce((s, e) => s + e.sets.filter((x) => !x.done).length, 0);
    if (undone && !(await confirmDialog(`Завершить? Неотмеченные подходы (${undone}) не сохранятся.`))) return;
    setSaving(true);
    try {
      const payload = buildWorkout(d, catalog.byId, bests.data, ins.current ?? 75);
      await save.mutateAsync(payload);
      haptic.success();
      wd.discard();
      layer.close();
      nav.push(<WorkoutDetailScreen id={payload.workout.id} celebrate />);
    } catch (e) {
      setSaving(false);
      haptic.error();
      toast(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  };

  const elapsed = (now - new Date(d.startedAt).getTime()) / 1000;
  const done = d.exercises.reduce((s, e) => s + e.sets.filter((x) => x.done).length, 0);
  const total = d.exercises.reduce((s, e) => s + e.sets.length, 0);

  return (
    <div className="aw">
      <div className="aw-head">
        {!inTelegram && (
          <button className="icon-btn" style={{ width: 38, height: 38 }} onClick={layer.close} aria-label="Свернуть">
            <ChevronDown size={22} />
          </button>
        )}
        <button
          style={{ flex: 1, minWidth: 0, textAlign: "left" }}
          onClick={() => nav.sheet(<RenameSheet />)}
        >
          <div className="faint" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {d.name} ✎
          </div>
          <div className="aw-time num">{fmtDuration(elapsed)}</div>
        </button>
        <span className="faint num" style={{ fontSize: 13 }}>
          {done}/{total}
        </span>
        <Tap className="btn btn-sm" style={{ background: "var(--good)", color: "#062a14" }} disabled={saving} onClick={finish}>
          {saving ? "…" : "Завершить"}
        </Tap>
      </div>

      <div className="aw-scroll">
        <AnimatePresence initial={false}>
          {d.exercises.map((x, i) => {
            const ex = catalog.byId.get(x.ex);
            return ex ? (
              <motion.div key={x.key} layout exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}>
                <ExerciseBlock
                  x={x}
                  ex={ex}
                  index={i}
                  count={d.exercises.length}
                  last={last.data?.get(x.ex)}
                  best={bests.data?.get(x.ex)}
                />
              </motion.div>
            ) : null;
          })}
        </AnimatePresence>

        <Tap
          className="btn btn-block"
          style={{ marginTop: 4, background: "rgba(124,140,255,.14)", color: "var(--kcal)" }}
          onClick={() => nav.push(<ExercisesScreen pick onPick={addExercises} />)}
        >
          <Plus size={19} /> Добавить упражнение
        </Tap>
        <button
          className="faint"
          style={{ width: "100%", marginTop: 18, fontSize: 14 }}
          onClick={async () => {
            if (!(await confirmDialog("Отменить тренировку? Все подходы будут удалены."))) return;
            haptic.rigid();
            wd.discard();
            layer.close();
          }}
        >
          Отменить тренировку
        </button>
      </div>

      <RestTimer />
    </div>
  );
}

// ───────────────────────── Упражнение в тренировке

const ExerciseBlock = memo(function ExerciseBlock({
  x,
  ex,
  index,
  count,
  last,
  best,
}: {
  x: ExDraft;
  ex: Exercise;
  index: number;
  count: number;
  last?: SetRow[];
  best?: Best;
}) {
  const wd = useWorkoutDraft();
  const nav = useNav();
  const toast = useToast();
  const target = x.sets.find((s) => s.target)?.target;
  const t = target ? parseReps(target) : null;
  const timed = isTimed(ex) || !!t?.timed;
  const weighted = usesWeight(ex);
  const lastWorking = (last ?? []).filter((s) => s.kind !== "warmup");

  // Подсказка прогрессии: в прошлый раз все рабочие подходы до верха диапазона — пора добавить вес
  const suggest = useMemo(() => {
    if (timed || !t || !t.max || !lastWorking.length) return null;
    const lastW = Math.max(...lastWorking.map((s) => s.weight ?? 0));
    if (!lastW) return null;
    const allTop = lastWorking.every((s) => (s.reps ?? 0) >= t.max);
    return allTop ? lastW + weightStep(ex) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last, target]);

  const upd = (fn: (e: ExDraft) => ExDraft) => wd.update((d) => ({ ...d, exercises: d.exercises.map((e) => (e.key === x.key ? fn(e) : e)) }));
  const updSet = (id: string, patch: Partial<SetDraft>) => upd((e) => ({ ...e, sets: e.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const toggle = (s: SetDraft, i: number) => {
    if (s.done) {
      updSet(s.id, { done: false });
      return;
    }
    const prev = lastWorking[i] ?? lastWorking[lastWorking.length - 1];
    const patch: Partial<SetDraft> = { done: true };
    // Быстрая отметка: пустые поля берём из цели или прошлого раза
    if (timed) {
      if (!s.seconds) patch.seconds = String(prev?.seconds ?? t?.min ?? 30);
    } else {
      if (!s.reps) patch.reps = String(prev?.reps ?? (t?.toFailure ? "" : t?.max || t?.min || "") ?? "");
      if (weighted && !s.weight && prev?.weight) patch.weight = fmtW(prev.weight);
    }
    if (!timed && !parseNum(patch.reps ?? s.reps)) {
      haptic.warning();
      toast("Впиши количество повторов");
      return;
    }
    haptic.success();
    updSet(s.id, patch);
    // Новый рекорд прямо во время подхода
    const w = parseNum(patch.weight ?? s.weight);
    const r = parseNum(patch.reps ?? s.reps);
    if (s.kind !== "warmup" && best && w > 0 && best.best_e1rm && e1rm(w, r) > best.best_e1rm) {
      setTimeout(() => {
        haptic.heavy();
        toast(`🏆 Рекорд: ${ex.n} — ${fmtW(w)} × ${r}`);
      }, 250);
    }
    wd.startRest(x.rest, x.key);
  };

  const addSet = () => {
    haptic.tap();
    const lastSet = x.sets[x.sets.length - 1];
    upd((e) => ({ ...e, sets: [...e.sets, newSet({ weight: lastSet?.weight, reps: "", seconds: lastSet?.seconds }, lastSet?.target)] }));
  };

  const applySuggest = () => {
    if (!suggest) return;
    haptic.select();
    upd((e) => ({ ...e, sets: e.sets.map((s) => (s.kind !== "warmup" && !s.done ? { ...s, weight: fmtW(suggest) } : s)) }));
    toast(`Вес ${fmtW(suggest)} кг во всех рабочих подходах`);
  };

  const workingCount = x.sets.filter((s) => s.kind !== "warmup").length;

  return (
    <div className="aw-ex" style={{ animationDelay: `${index * 40}ms` }}>
      <div className="aw-ex-head">
        <button onClick={() => nav.push(<ExerciseScreen id={ex.id} />)} className="tap" style={{ borderRadius: 14 }}>
          <ExerciseImage ex={ex} animate={false} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="aw-ex-name">{ex.n}</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
            {target ? `${workingCount} × ${target}` : `${workingCount} подх.`} · отдых {fmtDuration(x.rest)}
          </div>
          {suggest && (
            <button className="aw-hint tap" onClick={applySuggest}>
              <TrendingUp size={13} /> Пора прибавить: {fmtW(suggest)} кг
            </button>
          )}
        </div>
        <button
          className="icon-btn"
          style={{ width: 36, height: 36, background: "transparent" }}
          onClick={() => nav.sheet(<ExerciseMenu exKey={x.key} index={index} count={count} />)}
          aria-label="Ещё"
        >
          <MoreHorizontal size={20} className="muted" />
        </button>
      </div>
      {x.note && (
        <div className="faint" style={{ fontSize: 12.5, marginTop: 8, paddingLeft: 2 }}>
          💡 {x.note}
        </div>
      )}

      <div className={`set-grid ${timed ? "timed" : ""}`}>
        <span className="h">№</span>
        <span className="h">Прошлый</span>
        {timed ? (
          <span className="h">Сек</span>
        ) : (
          <>
            <span className="h">{weighted ? "кг" : "+кг"}</span>
            <span className="h">Повт</span>
          </>
        )}
        <span className="h">✓</span>
        {x.sets.map((s, i) => {
          const prev = (last ?? [])[i];
          const prevText = prev ? (timed ? `${prev.seconds ?? 0} с` : `${prev.weight ? fmtW(prev.weight) + "×" : ""}${prev.reps ?? ""}`) : "—";
          const workingNo = x.sets.slice(0, i + 1).filter((z) => z.kind !== "warmup").length;
          return (
            <SetRowView
              key={s.id}
              s={s}
              num={s.kind === "normal" ? String(workingNo) : KIND_LABEL[s.kind]}
              prevText={prevText}
              timed={timed}
              repsPlaceholder={t ? (t.toFailure ? "макс" : t.min === t.max ? String(t.min) : `${t.min}-${t.max}`) : prev?.reps ? String(prev.reps) : "0"}
              onKind={() => {
                haptic.select();
                updSet(s.id, { kind: KIND_NEXT[s.kind] });
                toast(KIND_RU[KIND_NEXT[s.kind]]);
              }}
              onChange={(patch) => updSet(s.id, patch)}
              onToggle={() => toggle(s, i)}
              onDelete={() => {
                haptic.rigid();
                upd((e) => ({ ...e, sets: e.sets.filter((z) => z.id !== s.id) }));
              }}
            />
          );
        })}
      </div>
      <button className="aw-add-set press" onClick={addSet} {...keepFocus}>
        + Подход
      </button>
    </div>
  );
});

function SetRowView({
  s,
  num,
  prevText,
  timed,
  repsPlaceholder,
  onKind,
  onChange,
  onToggle,
  onDelete,
}: {
  s: SetDraft;
  num: string;
  prevText: string;
  timed: boolean;
  repsPlaceholder: string;
  onKind: () => void;
  onChange: (p: Partial<SetDraft>) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const clean = (v: string) => v.replace(/[^\d.,]/g, "").slice(0, 6);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -90 || info.velocity.x < -600) onDelete();
  };
  return (
    <div className={`set-row ${s.done ? "row-done" : ""}`}>
      <motion.button
        className={`set-num ${s.kind}`}
        onClick={onKind}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0 }}
        onDragEnd={onDragEnd}
        style={{ touchAction: "pan-y" }}
        aria-label="Тип подхода (свайп влево — удалить)"
      >
        {num}
      </motion.button>
      <span className="set-prev num">{prevText}</span>
      {timed ? (
        <input className="set-in" inputMode="numeric" placeholder="сек" value={s.seconds} onChange={(e) => onChange({ seconds: clean(e.target.value) })} />
      ) : (
        <>
          <input className="set-in" inputMode="decimal" placeholder="0" value={s.weight} onChange={(e) => onChange({ weight: clean(e.target.value) })} />
          <input className="set-in" inputMode="numeric" placeholder={repsPlaceholder} value={s.reps} onChange={(e) => onChange({ reps: clean(e.target.value) })} />
        </>
      )}
      <button className={`set-done ${s.done ? "on" : ""}`} onClick={onToggle} {...keepFocus} aria-label="Подход выполнен">
        <Check size={20} strokeWidth={3} />
      </button>
    </div>
  );
}

// ───────────────────────── Таймер отдыха

function RestTimer() {
  const wd = useWorkoutDraft();
  const now = useNow(!!wd.rest, 250);
  const fired = useRef<number | null>(null);
  const rest = wd.rest;
  const left = rest ? (rest.endAt - now) / 1000 : 0;

  useEffect(() => {
    if (!rest || left > 0 || fired.current === rest.endAt) return;
    fired.current = rest.endAt;
    haptic.success();
    setTimeout(() => haptic.heavy(), 250);
    const t = setTimeout(() => wd.stopRest(), 4000);
    return () => clearTimeout(t);
  }, [left, rest, wd]);

  if (!rest) return null;
  const over = left <= 0;
  return (
    <div className={`rest ${over ? "over" : ""}`}>
      <Timer size={22} className={over ? "" : "muted"} style={{ color: over ? "var(--good)" : undefined }} />
      <div style={{ flex: 1 }}>
        <div className="faint" style={{ fontSize: 12 }}>
          {over ? "Отдых окончен — вперёд!" : "Отдых"}
        </div>
        <div className="rest-time num">{over ? "0:00" : fmtDuration(Math.ceil(left))}</div>
      </div>
      {!over && (
        <>
          <Tap className="chip" onClick={() => wd.adjustRest(-15)}>
            −15
          </Tap>
          <Tap className="chip" onClick={() => wd.adjustRest(15)}>
            +15
          </Tap>
        </>
      )}
      <Tap className="chip on" onClick={() => wd.stopRest()}>
        {over ? "OK" : "Пропустить"}
      </Tap>
      <span className="rest-bar" style={{ width: `${over ? 100 : (1 - left / rest.total) * 100}%` }} />
    </div>
  );
}

// ───────────────────────── Меню упражнения

function ExerciseMenu({ exKey, index, count }: { exKey: string; index: number; count: number }) {
  const wd = useWorkoutDraft();
  const nav = useNav();
  const layer = useLayer();
  const x = wd.draft?.exercises.find((e) => e.key === exKey);
  if (!x) return null;
  const upd = (fn: (d: Draft) => Draft) => wd.update(fn);
  const move = (dir: -1 | 1) => {
    haptic.select();
    upd((d) => {
      const list = [...d.exercises];
      const [it] = list.splice(index, 1);
      list.splice(index + dir, 0, it);
      return { ...d, exercises: list };
    });
    layer.close();
  };
  return (
    <>
      <SheetHeader title="Упражнение" />
      <div className="sheet-body">
        <div className="group-label" style={{ marginTop: 0 }}>
          Отдых между подходами
        </div>
        <div className="chips-row" style={{ padding: "4px 0 12px" }}>
          {[45, 60, 90, 120, 150, 180, 240].map((sec) => (
            <Tap
              key={sec}
              className={`chip ${x.rest === sec ? "on" : ""}`}
              onClick={() => {
                haptic.select();
                upd((d) => ({ ...d, exercises: d.exercises.map((e) => (e.key === exKey ? { ...e, rest: sec } : e)) }));
              }}
            >
              {fmtDuration(sec)}
            </Tap>
          ))}
        </div>
        <div className="list">
          <button
            className="list-item press"
            onClick={() => {
              layer.close();
              nav.push(
                <ExercisesScreen
                  pick
                  single
                  onPick={async ([id]) => {
                    const lastMap = await fetchLast([id]).catch(() => new Map<string, SetRow[]>());
                    wd.update((d) => ({
                      ...d,
                      exercises: d.exercises.map((e) =>
                        e.key === exKey ? { ...exDraftFrom(id, { ex: id, sets: e.sets.map((s) => ({ reps: s.target ?? "" })), rest: e.rest }, lastMap.get(id)), key: e.key } : e,
                      ),
                    }));
                  }}
                />,
              );
            }}
          >
            <span className="li-icon">
              <Repeat size={20} />
            </span>
            <span className="li-title">Заменить упражнение</span>
          </button>
          {index > 0 && (
            <button className="list-item press" onClick={() => move(-1)}>
              <span className="li-icon">
                <ArrowUp size={20} />
              </span>
              <span className="li-title">Переместить выше</span>
            </button>
          )}
          {index < count - 1 && (
            <button className="list-item press" onClick={() => move(1)}>
              <span className="li-icon">
                <ArrowDown size={20} />
              </span>
              <span className="li-title">Переместить ниже</span>
            </button>
          )}
          <button
            className="list-item press"
            style={{ color: "var(--danger)" }}
            onClick={() => {
              haptic.rigid();
              upd((d) => ({ ...d, exercises: d.exercises.filter((e) => e.key !== exKey) }));
              layer.close();
            }}
          >
            <span className="li-icon" style={{ color: "inherit" }}>
              <Trash size={20} />
            </span>
            <span className="li-title">Убрать из тренировки</span>
          </button>
        </div>
        <p className="faint" style={{ fontSize: 13, marginTop: 14 }}>
          Подсказки: нажми на номер подхода, чтобы сделать его разминочным (Р), дроп-сетом (Д) или до отказа (О). Свайп номера влево — удалить подход.
        </p>
      </div>
    </>
  );
}

function RenameSheet() {
  const wd = useWorkoutDraft();
  const layer = useLayer();
  const [name, setName] = useState(wd.draft?.name ?? "");
  return (
    <>
      <SheetHeader title="Название" />
      <div className="sheet-body">
        <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="sheet-foot">
        <Tap
          className="btn btn-accent btn-block"
          disabled={!name.trim()}
          onClick={() => {
            wd.update((d) => ({ ...d, name: name.trim() }));
            layer.close();
          }}
        >
          Сохранить
        </Tap>
      </div>
    </>
  );
}

// ───────────────────────── Подсчёт итогов

export function buildWorkout(d: Draft, byId: Map<string, Exercise>, bests: Map<string, Best> | undefined, bodyKg: number) {
  const finishedAt = new Date();
  const duration = Math.max(60, Math.round((finishedAt.getTime() - new Date(d.startedAt).getTime()) / 1000));
  const sets: Omit<SetRow, "id" | "workout_id">[] = [];
  const muscles: Partial<Record<Muscle, number>> = {};
  const metParts: { met: number; sets: number }[] = [];
  const prs: PR[] = [];
  let volume = 0;

  d.exercises.forEach((x, exOrder) => {
    const ex = byId.get(x.ex);
    const done = x.sets.filter((s) => s.done);
    if (!done.length) return;
    let bestW = 0;
    let bestE = 0;
    let bestR = 0;
    done.forEach((s, i) => {
      const weight = parseNum(s.weight) || null;
      const reps = parseNum(s.reps) || null;
      const seconds = parseNum(s.seconds) || null;
      sets.push({ exercise: x.ex, ex_order: exOrder, set_order: i, kind: s.kind, weight, reps, seconds, rpe: null, done_at: finishedAt.toISOString() });
      if (s.kind === "warmup") return;
      volume += (weight ?? 0) * (reps ?? 0);
      if (weight) bestW = Math.max(bestW, weight);
      if (weight && reps) bestE = Math.max(bestE, e1rm(weight, reps));
      if (reps) bestR = Math.max(bestR, reps);
      for (const m of ex?.pm ?? []) muscles[m] = (muscles[m] ?? 0) + 1;
      for (const m of ex?.sm ?? []) muscles[m] = (muscles[m] ?? 0) + 0.5;
    });
    metParts.push({ met: ex ? metOf(ex) : 5, sets: done.length });
    // Рекорды считаем, только если упражнение уже делали раньше
    const b = bests?.get(x.ex);
    if (b) {
      if (bestE && b.best_e1rm && bestE > b.best_e1rm) prs.push({ ex: x.ex, kind: "e1rm", value: bestE, prev: b.best_e1rm });
      else if (bestW && b.best_weight && bestW > b.best_weight) prs.push({ ex: x.ex, kind: "weight", value: bestW, prev: b.best_weight });
      else if (!bestW && bestR && b.best_reps && bestR > b.best_reps) prs.push({ ex: x.ex, kind: "reps", value: bestR, prev: b.best_reps });
    }
  });

  const kcal = burnedKcal(metParts, bodyKg, duration / 60);
  return {
    workout: {
      id: d.id,
      name: d.name,
      routine_id: d.routineId,
      program: d.program,
      program_day: d.programDay,
      started_at: d.startedAt,
      finished_at: finishedAt.toISOString(),
      duration_s: duration,
      kcal,
      volume: Math.round(volume),
      sets_done: sets.filter((s) => s.kind !== "warmup").length,
      prs,
      muscles: Object.fromEntries(Object.entries(muscles).map(([k, v]) => [k, Math.round((v as number) * 10) / 10])),
      notes: null,
    },
    sets,
  };
}

