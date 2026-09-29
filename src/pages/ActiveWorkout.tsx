import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { ArrowDown, ArrowUp, Calculator, Check, ChevronDown, Flame, Link2, MoreHorizontal, Plus, Repeat, Timer, Trash, TrendingUp, Unlink } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { supabase } from "@/lib/supabase";
import { useInsights } from "@/data/insights";
import { useBests, useCatalog, useLastSets, useSaveWorkout, useSessions, useWorkouts, type Best, type PR, type SetRow } from "@/data/workouts";
import { localDay } from "@/data/workouts";
import { useSettings } from "@/data/api";
import { planFor, historyFor, roleOf, type Plan, type Session } from "@/lib/progression";
import { useProgramState, useSaveProgramState } from "@/data/workouts";
import { parseReps, programByKey } from "@/data/programs";
import { exDraftFrom, fmtDuration, newSet, useNow, useWorkoutDraft, type Draft, type ExDraft, type SetDraft, type SetKind } from "@/state/workout";
import { burnedKcal, e1rm, isTimed, metOf, MIN_SET_MIN, usesWeight, weightStep, type Exercise, type Muscle } from "@/lib/exercise";
import { parseNum } from "@/lib/hooks";
import { confirmDialog, haptic, inTelegram, vibrate } from "@/lib/telegram";
import { sfx } from "@/lib/sound";
import { keepFocus } from "@/lib/viewport";
import { SheetHeader } from "@/ui/Screen";
import { ExerciseImage } from "@/ui/ExerciseImage";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { ExercisesScreen } from "./Exercises";
import { ExerciseScreen } from "./ExerciseDetail";
import { WorkoutDetailScreen } from "./WorkoutDetail";
import { PlateCalcSheet } from "@/sheets/PlateCalc";
import { uuid } from "@/data/social";
import "./workouts.css";

const KIND_LABEL: Record<SetKind, string> = { normal: "", warmup: "Р", drop: "Д", failure: "О" };
const KIND_NEXT: Record<SetKind, SetKind> = { normal: "warmup", warmup: "drop", drop: "failure", failure: "normal" };
const KIND_RU: Record<SetKind, string> = { normal: "Рабочий", warmup: "Разминка", drop: "Дроп-сет", failure: "До отказа" };

const fmtW = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

type SsPos = "first" | "mid" | "last";
/** Суперсеты: «группа» из одного упражнения — уже не суперсет */
function normalizeGroups(list: ExDraft[]): ExDraft[] {
  return list.map((e, i) => {
    if (!e.group) return e;
    const linked = list[i - 1]?.group === e.group || list[i + 1]?.group === e.group;
    return linked ? e : { ...e, group: undefined };
  });
}

/** Разминочные подходы к рабочему весу */
export function warmupPlan(work: number, barbell: boolean, step: number) {
  const r = (w: number) => Math.max(step, Math.round(w / step) * step);
  if (!work || work < 10) return [];
  if (!barbell)
    return work < 16
      ? [{ w: r(work * 0.5), reps: 10 }]
      : [
          { w: r(work * 0.5), reps: 10 },
          { w: r(work * 0.75), reps: 5 },
        ];
  const out: { w: number; reps: number }[] = [];
  if (work >= 40) out.push({ w: 20, reps: 10 });
  const steps: [number, number][] = [
    [0.4, 8],
    [0.6, 5],
    [0.8, 3],
  ];
  for (const [p, reps] of steps) {
    const w = Math.max(20, r(work * p));
    if (w > (out[out.length - 1]?.w ?? 0) + step / 2 && w < work) out.push({ w, reps });
  }
  return out;
}

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
  const sessions = useSessions(d?.exercises.map((e) => e.ex) ?? []);
  const settings = useSettings();
  const allWorkouts = useWorkouts();
  const programSessions = d?.program
    ? (allWorkouts.data ?? []).filter((w) => w.program === d.program && (!settings.data?.program_started || localDay(w.started_at) >= settings.data.program_started)).length
    : 0;
  const programDayTitle = d?.program != null && d.programDay != null ? programByKey(d.program)?.days[d.programDay]?.title : undefined;
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
    // За это время отмеченные подходы сделать нельзя — значит, тренировку записали после. Спросим, сколько она шла
    const elapsedMin = (Date.now() - new Date(d.startedAt).getTime()) / 60000;
    if (elapsedMin < doneSets * MIN_SET_MIN) {
      nav.sheet(<DurationSheet elapsedMin={elapsedMin} estimate={estimateMinutes(d)} onPick={(min) => save_(min == null ? undefined : Math.round(min * 60))} />);
      return;
    }
    await save_();
  };

  const save_ = async (durationS?: number) => {
    if (!d) return;
    setSaving(true);
    try {
      const payload = buildWorkout(d, catalog.byId, bests.data, ins.current ?? 75, durationS);
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
            const list = d.exercises;
            const prevSame = !!x.group && list[i - 1]?.group === x.group;
            const nextSame = !!x.group && list[i + 1]?.group === x.group;
            const ss: SsPos | undefined = prevSame && nextSame ? "mid" : prevSame ? "last" : nextSame ? "first" : undefined;
            return ex ? (
              <motion.div key={x.key} id={`ex-${x.key}`} layout exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}>
                <ExerciseBlock
                  x={x}
                  ex={ex}
                  index={i}
                  ss={ss}
                  ssNext={nextSame ? list[i + 1].key : undefined}
                  count={d.exercises.length}
                  last={last.data?.get(x.ex)}
                  sessions={sessions.data?.get(x.ex)}
                  program={d.program}
                  programDayTitle={programDayTitle}
                  programSessions={programSessions}
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
  ss,
  ssNext,
  sessions,
  program,
  programDayTitle,
  programSessions = 0,
}: {
  x: ExDraft;
  ex: Exercise;
  index: number;
  count: number;
  last?: SetRow[];
  best?: Best;
  ss?: SsPos;
  ssNext?: string;
  sessions?: Session[];
  program?: string | null;
  programDayTitle?: string;
  programSessions?: number;
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
  // План на сегодня по схеме программы (или двойная прогрессия для своих тренировок)
  const workingTotal = x.sets.filter((z) => z.kind !== "warmup").length;
  const role = roleOf(x.note, program);
  const programState = useProgramState(program ?? null);
  const saveState = useSaveProgramState();
  const tm = programState.data?.get(ex.id) ?? null;
  const plan: Plan = useMemo(() => {
    if (timed) return { sets: null, weight: null, note: null, tone: "info" };
    return planFor({
      program: program ?? null,
      programDayTitle,
      role,
      ex,
      targetReps: target,
      workingSets: workingTotal,
      history: historyFor(sessions, program ?? null, target, role),
      bestE1rm: best?.best_e1rm ?? null,
      programSessions,
      tm,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, target, program, programSessions, workingTotal, best?.best_e1rm, tm, role]);

  // 5/3/1: тренировочный максимум фиксируем при первом расчёте — дальше он растёт по циклам, а не прыгает за рекордами
  useEffect(() => {
    if (program !== "531-bbb" || role !== "main" || tm || !best?.best_e1rm || programState.isLoading) return;
    saveState.mutate({ program, exercise: ex.id, tm: Math.round(best.best_e1rm * 0.9 * 4) / 4, cycle: Math.floor(programSessions / 16) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, role, tm, best?.best_e1rm, programState.isLoading]);

  const upd = (fn: (e: ExDraft) => ExDraft) => wd.update((d) => ({ ...d, exercises: d.exercises.map((e) => (e.key === x.key ? fn(e) : e)) }));
  const updSet = (id: string, patch: Partial<SetDraft>) => upd((e) => ({ ...e, sets: e.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  // Подсказки для каждого подхода: предыдущий подход этой тренировки → прошлый раз → цель
  const hints = useMemo(() => {
    const out: { w: string; r: string; sec: string }[] = [];
    let workingNo = -1;
    x.sets.forEach((st, i) => {
      if (st.kind !== "warmup") workingNo++;
      let j = i - 1;
      while (j >= 0 && (x.sets[j].kind === "warmup") !== (st.kind === "warmup")) j--;
      const lastS = st.kind === "warmup" ? undefined : (lastWorking[workingNo] ?? lastWorking[lastWorking.length - 1]);
      const planned = st.kind !== "warmup" ? plan.sets?.[workingNo] : undefined;
      if (planned) {
        out.push({ w: planned.w != null ? fmtW(planned.w) : "", r: planned.r.replace("+", ""), sec: "" });
        return;
      }
      if (j < 0 && st.kind !== "warmup" && plan.weight) {
        const targetR = t && !t.toFailure && !t.timed ? String(t.min === t.max ? t.max : t.min) : "";
        out.push({ w: fmtW(plan.weight), r: targetR || (lastS?.reps ? String(lastS.reps) : ""), sec: "" });
        return;
      }
      if (j >= 0) {
        const p = x.sets[j];
        out.push({ w: p.weight || out[j].w, r: p.reps || out[j].r, sec: p.seconds || out[j].sec });
      } else {
        const targetR = t && !t.toFailure && !t.timed ? String(lastS?.reps && lastS.reps >= t.min && lastS.reps <= t.max ? lastS.reps : t.max) : "";
        out.push({
          w: lastS?.weight ? fmtW(lastS.weight) : "",
          r: targetR || (lastS?.reps ? String(lastS.reps) : ""),
          sec: lastS?.seconds ? String(lastS.seconds) : t?.timed ? String(t.max || t.min) : "",
        });
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x.sets, last, target, plan]);

  const toggle = (s: SetDraft, i: number) => {
    if (s.done) {
      updSet(s.id, { done: false });
      return;
    }
    const h = hints[i];
    const patch: Partial<SetDraft> = { done: true };
    // Пустые поля — берём из подсказки: повторить подход можно одним нажатием
    if (timed) {
      if (!s.seconds) patch.seconds = h.sec || "30";
    } else {
      if (!s.reps) patch.reps = h.r;
      if (!s.weight && h.w) patch.weight = h.w;
    }
    if (!timed && !parseNum(patch.reps ?? s.reps)) {
      haptic.warning();
      toast("Впиши количество повторов");
      return;
    }
    vibrate("success");
    sfx.set();
    patch.doneAt = new Date().toISOString();
    updSet(s.id, patch);
    // Новый рекорд прямо во время подхода
    const w = parseNum(patch.weight ?? s.weight);
    const r = parseNum(patch.reps ?? s.reps);
    if (s.kind !== "warmup" && best && w > 0 && best.best_e1rm && e1rm(w, r) > best.best_e1rm) {
      setTimeout(() => {
        vibrate("heavy");
        sfx.fanfare();
        toast(`🏆 Рекорд: ${ex.n} — ${fmtW(w)} × ${r}`);
      }, 250);
    }
    if (ssNext) {
      // Суперсет: без отдыха — сразу к следующему упражнению
      setTimeout(() => document.getElementById(`ex-${ssNext}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
    } else wd.startRest(x.rest, x.key);
  };

  // «Как в первом»: вес и повторы первого рабочего подхода — во все остальные незаполненные
  const firstIdx = x.sets.findIndex((z) => z.kind !== "warmup");
  const first = firstIdx >= 0 ? x.sets[firstIdx] : undefined;
  const firstVals = first ? { w: first.weight || hints[firstIdx].w, r: first.reps || hints[firstIdx].r } : null;
  const canCopy =
    !timed &&
    !!first &&
    (first.done || !!first.weight || !!first.reps) &&
    x.sets.some(
      (z, k) =>
        k > firstIdx && z.kind !== "warmup" && !z.done && ((z.weight || hints[k].w) !== firstVals!.w || (z.reps || hints[k].r) !== firstVals!.r),
    );
  const copyFirst = () => {
    if (!firstVals) return;
    haptic.select();
    upd((e) => ({
      ...e,
      sets: e.sets.map((z, k) => (k > firstIdx && z.kind !== "warmup" && !z.done ? { ...z, weight: firstVals.w, reps: firstVals.r } : z)),
    }));
  };

  const addSet = () => {
    haptic.tap();
    const lastSet = x.sets[x.sets.length - 1];
    upd((e) => ({ ...e, sets: [...e.sets, newSet({ weight: lastSet?.weight, reps: "", seconds: lastSet?.seconds }, lastSet?.target)] }));
  };

  const applyPlan = () => {
    if (!plan.weight && !plan.sets) return;
    haptic.select();
    upd((e) => {
      const warm = e.sets.filter((z) => z.kind === "warmup");
      let work = e.sets.filter((z) => z.kind !== "warmup");
      // Схема сменилась (например, 6×2 вместо 5×3) — подгоняем число подходов
      if (plan.sets && plan.sets.length !== work.length) {
        // Подходы, где уже что-то вписано или отмечено, сохраняем всегда
        const keep = work.reduce((n, z, i) => (z.done || z.weight || z.reps ? i + 1 : n), 0);
        const len = Math.max(plan.sets.length, keep);
        work = Array.from({ length: len }, (_, i) => work[i] ?? newSet(undefined, work[0]?.target));
      }
      work = work.map((z, i) => {
        if (z.done) return z;
        const p = plan.sets?.[i];
        const w = p?.w ?? plan.weight;
        return { ...z, weight: w != null ? fmtW(w) : z.weight, reps: p ? p.r.replace("+", "") : z.reps };
      });
      return { ...e, sets: [...warm, ...work] };
    });
    toast(plan.sets ? "Подходы заполнены по плану" : `Вес ${fmtW(plan.weight!)} кг во всех рабочих подходах`);
  };

  const workingCount = x.sets.filter((s) => s.kind !== "warmup").length;

  return (
    <div className={`aw-ex ${ss ? `ss ss-${ss}` : ""}`} style={{ animationDelay: `${index * 40}ms` }}>
      {ss === "first" && (
        <div className="ss-label">
          <Link2 size={12} /> Суперсет · без отдыха
        </div>
      )}
      <div className="aw-ex-head">
        <button onClick={() => nav.push(<ExerciseScreen id={ex.id} />)} className="tap" style={{ borderRadius: 14 }}>
          <ExerciseImage ex={ex} animate={false} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="aw-ex-name">{ex.n}</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
            {target ? `${workingCount} × ${target}` : `${workingCount} подх.`} · отдых {fmtDuration(x.rest)}
          </div>
          {plan.note && (
            <button className={`aw-hint tap tone-${plan.tone}`} onClick={applyPlan}>
              <TrendingUp size={13} /> {plan.note}
            </button>
          )}
        </div>
        <button
          className="icon-btn"
          style={{ width: 36, height: 36, background: "transparent" }}
          onClick={() =>
            nav.sheet(
              <ExerciseMenu
                exKey={x.key}
                index={index}
                count={count}
                weighted={weighted && !timed}
                barbell={ex.e === "barbell"}
                step={weightStep(ex)}
                workWeight={parseNum(firstVals?.w ?? "")}
              />,
            )
          }
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
              hint={hints[i]}
              toFailure={!!t?.toFailure}
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
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="aw-add-set press" style={{ marginTop: 0, flex: 1 }} onClick={addSet} {...keepFocus}>
          + Подход
        </button>
        {canCopy && (
          <button className="aw-add-set press" style={{ marginTop: 0, flex: 1, color: "var(--kcal)" }} onClick={copyFirst} {...keepFocus}>
            ⤓ Как в 1-м подходе
          </button>
        )}
      </div>
    </div>
  );
});

function SetRowView({
  s,
  num,
  prevText,
  timed,
  hint,
  toFailure,
  onKind,
  onChange,
  onToggle,
  onDelete,
}: {
  s: SetDraft;
  num: string;
  prevText: string;
  timed: boolean;
  hint: { w: string; r: string; sec: string };
  toFailure: boolean;
  onKind: () => void;
  onChange: (p: Partial<SetDraft>) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const clean = (v: string) => v.replace(/[^\d.,]/g, "").slice(0, 6);
  // «Далее» на клавиатуре — к следующему полю
  const nextField = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const all = [...document.querySelectorAll<HTMLInputElement>(".aw .set-in")];
    const next = all[all.indexOf(e.currentTarget) + 1];
    if (next) next.focus({ preventScroll: false });
    else e.currentTarget.blur();
  };
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
        <input className="set-in" inputMode="numeric" enterKeyHint="next" onKeyDown={nextField} placeholder={hint.sec || "сек"} value={s.seconds} onChange={(e) => onChange({ seconds: clean(e.target.value) })} />
      ) : (
        <>
          <input className="set-in" inputMode="decimal" enterKeyHint="next" onKeyDown={nextField} placeholder={hint.w || "0"} value={s.weight} onChange={(e) => onChange({ weight: clean(e.target.value) })} />
          <input className="set-in" inputMode="numeric" enterKeyHint="next" onKeyDown={nextField} placeholder={hint.r || (toFailure ? "макс" : "0")} value={s.reps} onChange={(e) => onChange({ reps: clean(e.target.value) })} />
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
  const whole = Math.ceil(left);
  const counted = useRef(0);

  // Последние 3 секунды — тихий отсчёт
  useEffect(() => {
    if (!rest || whole < 1 || whole > 3 || counted.current === whole) return;
    counted.current = whole;
    vibrate("select");
    sfx.tick();
  }, [whole, rest]);

  const finished = !!rest && left <= 0;
  useEffect(() => {
    if (!rest || !finished || fired.current === rest.endAt) return;
    fired.current = rest.endAt;
    vibrate("success");
    sfx.bell();
    setTimeout(() => vibrate("heavy"), 250);
  }, [finished, rest]);
  // Отдельный эффект: закрыть плашку через 4 секунды после окончания (не сбрасывается каждый тик)
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => wd.stopRest(), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, rest?.endAt]);

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

function ExerciseMenu({
  exKey,
  index,
  count,
  weighted,
  barbell,
  step,
  workWeight,
}: {
  exKey: string;
  index: number;
  count: number;
  weighted: boolean;
  barbell: boolean;
  step: number;
  workWeight: number;
}) {
  const wd = useWorkoutDraft();
  const nav = useNav();
  const layer = useLayer();
  const toast = useToast();
  const x = wd.draft?.exercises.find((e) => e.key === exKey);
  if (!x) return null;
  const upd = (fn: (d: Draft) => Draft) =>
    wd.update((d) => {
      const n = fn(d);
      return { ...n, exercises: normalizeGroups(n.exercises) };
    });
  const list = wd.draft!.exercises;
  const next = list[index + 1];
  const inSs = !!x.group && (list[index - 1]?.group === x.group || next?.group === x.group);
  const warm = weighted ? warmupPlan(workWeight, barbell, step) : [];
  const warmText = warm.map((w) => `${fmtW(w.w)}×${w.reps}`).join(" → ");

  const addWarmups = () => {
    haptic.success();
    upd((d) => ({
      ...d,
      exercises: d.exercises.map((e) =>
        e.key === exKey
          ? {
              ...e,
              sets: [
                ...warm.map((w) => ({ ...newSet({ weight: fmtW(w.w), reps: String(w.reps) }), kind: "warmup" as const })),
                ...e.sets.filter((z) => z.kind !== "warmup" || z.done),
              ],
            }
          : e,
      ),
    }));
    toast(`Разминка: ${warmText}`);
    layer.close();
  };
  const linkNext = () => {
    if (!next) return;
    haptic.success();
    const g = x.group ?? next.group ?? uuid();
    upd((d) => ({ ...d, exercises: d.exercises.map((e) => (e.key === exKey || e.key === next.key ? { ...e, group: g } : e)) }));
    toast("Суперсет: отдых только после последнего упражнения");
    layer.close();
  };
  const unlink = () => {
    haptic.tap();
    upd((d) => ({ ...d, exercises: d.exercises.map((e) => (e.key === exKey ? { ...e, group: undefined } : e)) }));
    layer.close();
  };
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
        {weighted && (
          <div className="list" style={{ marginBottom: 10 }}>
            {warm.length > 0 && (
              <button className="list-item press" onClick={addWarmups}>
                <span className="li-icon">
                  <Flame size={20} />
                </span>
                <span style={{ flex: 1 }}>
                  <div className="li-title">Добавить разминку</div>
                  <div className="li-sub">
                    {warmText} перед {fmtW(workWeight)} кг
                  </div>
                </span>
              </button>
            )}
            <button
              className="list-item press"
              onClick={() => {
                layer.close();
                nav.sheet(<PlateCalcSheet weight={workWeight || undefined} />);
              }}
            >
              <span className="li-icon">
                <Calculator size={20} />
              </span>
              <span style={{ flex: 1 }}>
                <div className="li-title">Калькулятор блинов</div>
                <div className="li-sub">Что повесить на штангу</div>
              </span>
            </button>
          </div>
        )}
        <div className="list">
          {inSs ? (
            <button className="list-item press" onClick={unlink}>
              <span className="li-icon">
                <Unlink size={20} />
              </span>
              <span className="li-title">Убрать из суперсета</span>
            </button>
          ) : (
            index < count - 1 && (
              <button className="list-item press" onClick={linkNext}>
                <span className="li-icon">
                  <Link2 size={20} />
                </span>
                <span style={{ flex: 1 }}>
                  <div className="li-title">Суперсет со следующим</div>
                  <div className="li-sub">Подходы подряд, отдых после последнего</div>
                </span>
              </button>
            )
          )}
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

/** Тренировку записали после — спрашиваем реальную длительность (от неё зависят сожжённые калории) */
function DurationSheet({ elapsedMin, estimate, onPick }: { elapsedMin: number; estimate: number; onPick: (min: number | null) => void }) {
  const layer = useLayer();
  const est = Math.max(10, Math.round(estimate / 5) * 5);
  const options = [...new Set([est, 30, 45, 60, 90])].sort((a, b) => a - b);
  const [min, setMin] = useState(est);
  const pick = (v: number | null) => {
    haptic.select();
    layer.close();
    onPick(v);
  };
  const label = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}` : `${m} мин`);
  return (
    <>
      <SheetHeader title="Сколько длилась тренировка?" />
      <div className="sheet-body">
        <p className="muted" style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.45 }}>
          Таймер показывает {elapsedMin < 1 ? "меньше минуты" : fmtDuration(elapsedMin * 60)} — похоже, подходы отметили уже после тренировки. От длительности зависят
          сожжённые калории. По подходам и отдыху выходит примерно {label(est)}.
        </p>
        <div className="chips-row" style={{ flexWrap: "wrap", gap: 8 }}>
          {options.map((m) => (
            <Tap key={m} className={`chip ${min === m ? "on" : ""}`} onClick={() => (haptic.select(), setMin(m))}>
              {label(m)}
              {m === est ? " · по подходам" : ""}
            </Tap>
          ))}
        </div>
      </div>
      <div className="sheet-foot" style={{ display: "grid", gap: 8 }}>
        <Tap className="btn btn-accent btn-block" onClick={() => pick(min)}>
          Сохранить · {label(min)}
        </Tap>
        <Tap className="btn btn-block" onClick={() => pick(null)}>
          Оставить по таймеру
        </Tap>
      </div>
    </>
  );
}

// ───────────────────────── Подсчёт итогов

/** Длительность по отмеченным подходам (подход + отдых), минуты — для оценки, если тренировку записали после */
export function estimateMinutes(d: Draft) {
  let min = 0;
  for (const x of d.exercises) {
    const done = x.sets.filter((s) => s.done);
    done.forEach((s, i) => {
      const seconds = parseNum(s.seconds) || 0;
      min += (seconds ? seconds / 60 : 0.67) + (i < done.length - 1 ? Math.min(x.rest, 180) / 60 : 0);
    });
  }
  // Переходы между упражнениями — ≈2 минуты
  return min + Math.max(0, d.exercises.filter((x) => x.sets.some((s) => s.done)).length - 1) * 2;
}

/** durationS — длительность, которую указал человек (тренировку записали после); иначе — по таймеру */
export function buildWorkout(d: Draft, byId: Map<string, Exercise>, bests: Map<string, Best> | undefined, bodyKg: number, durationS?: number) {
  const finishedAt = new Date();
  const duration = durationS ?? Math.max(60, Math.round((finishedAt.getTime() - new Date(d.startedAt).getTime()) / 1000));
  const sets: Omit<SetRow, "id" | "workout_id">[] = [];
  const muscles: Partial<Record<Muscle, number>> = {};
  const metParts: { met: number; minutes: number }[] = [];
  const total = d.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  let idx = 0;
  const prs: PR[] = [];
  let volume = 0;

  d.exercises.forEach((x, exOrder) => {
    const ex = byId.get(x.ex);
    const done = x.sets.filter((s) => s.done);
    if (!done.length) return;
    let bestW = 0;
    let bestE = 0;
    let bestR = 0;
    let bestSet = 0;
    const planned = x.sets.filter((s) => s.kind !== "warmup").length;
    let workMin = 0;
    done.forEach((s, i) => {
      const weight = parseNum(s.weight) || null;
      const reps = parseNum(s.reps) || null;
      const seconds = parseNum(s.seconds) || null;
      // Время выполнения — настоящее; для старых черновиков — по порядку, чтобы история не путалась
      const doneAt = s.doneAt ?? new Date(finishedAt.getTime() - (total - idx++) * 1000).toISOString();
      sets.push({
        exercise: x.ex,
        ex_order: exOrder,
        set_order: i,
        kind: s.kind,
        weight,
        reps,
        seconds,
        rpe: null,
        done_at: doneAt,
        target: s.target ?? null,
        planned: s.kind === "warmup" ? null : planned,
      });
      // Работа: время подхода + отдых после него (не больше 3 минут)
      workMin += (seconds ? seconds / 60 : 0.67) + (i < done.length - 1 ? Math.min(x.rest, 180) / 60 : 0);
      if (s.kind === "warmup") return;
      volume += (weight ?? 0) * (reps ?? 0);
      if (weight) bestW = Math.max(bestW, weight);
      if (weight && reps) bestE = Math.max(bestE, e1rm(weight, reps));
      if (reps) bestR = Math.max(bestR, reps);
      if (weight && reps) bestSet = Math.max(bestSet, weight * reps);
      for (const m of ex?.pm ?? []) muscles[m] = (muscles[m] ?? 0) + 1;
      for (const m of ex?.sm ?? []) muscles[m] = (muscles[m] ?? 0) + 0.5;
    });
    metParts.push({ met: ex ? metOf(ex) : 5, minutes: workMin });
    // Рекорды считаем, только если упражнение уже делали раньше
    const b = bests?.get(x.ex);
    if (b) {
      if (bestE && b.best_e1rm && bestE > b.best_e1rm) prs.push({ ex: x.ex, kind: "e1rm", value: bestE, prev: b.best_e1rm });
      else if (bestW && b.best_weight && bestW > b.best_weight) prs.push({ ex: x.ex, kind: "weight", value: bestW, prev: b.best_weight });
      else if (!bestW && bestR && b.best_reps && bestR > b.best_reps) prs.push({ ex: x.ex, kind: "reps", value: bestR, prev: b.best_reps });
      // Больше повторов с тем же весом — тоже рекорд: лучший подход по «вес × повторы»
      else if (bestSet && b.best_volume && bestSet > b.best_volume) prs.push({ ex: x.ex, kind: "volume", value: bestSet, prev: b.best_volume });
    }
  });

  const kcal = burnedKcal(metParts, bodyKg, duration / 60, total);
  return {
    workout: {
      id: d.id,
      name: d.name,
      routine_id: d.routineId,
      program: d.program,
      program_day: d.programDay,
      started_at: durationS ? new Date(finishedAt.getTime() - durationS * 1000).toISOString() : d.startedAt,
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

