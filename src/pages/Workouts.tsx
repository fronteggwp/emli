import { useMemo, useEffect } from "react";
import { ChevronRight, Dumbbell, History, Library, Play, Plus, Trophy } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useSettings } from "@/data/api";
import { PROGRAMS, programByKey } from "@/data/programs";
import { ProgramTile, ProgramsScreen } from "./Programs";
import { nextProgramDay, useCatalog, useLastSets, useRoutines, useWorkouts, type Routine, type WorkoutRow } from "@/data/workouts";
import { localDay } from "@/data/workouts";
import { fmtDuration, useNow, useWorkoutDraft } from "@/state/workout";
import type { Muscle } from "@/lib/exercise";
import { fmt, fromKey, shiftKey, todayKey, weekStart } from "@/lib/dates";
import { fmtNum } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { Tap } from "@/ui/Tap";
import { ExerciseImage } from "@/ui/ExerciseImage";
import { MuscleMap } from "@/ui/MuscleMap";
import { HeaderAvatar } from "@/ui/HeaderAvatar";
import { ActiveWorkoutScreen } from "./ActiveWorkout";
import { ExercisesScreen } from "./Exercises";
import { ProgramScreen } from "./Program";
import { RoutineScreen } from "./Routine";
import { WorkoutDetailScreen } from "./WorkoutDetail";
import { HistoryScreen } from "./WorkoutHistory";
import { RecordsScreen } from "./Records";
import { useReminders, useSaveReminders, type Reminders } from "@/data/engage";
import "./workouts.css";

/** Сколько подходов за период пришлось на каждую мышцу (основная = 1, вспомогательная = 0,5) */
export function muscleSets(workouts: WorkoutRow[] | undefined, from: string) {
  const out: Partial<Record<Muscle, number>> = {};
  for (const w of workouts ?? []) {
    if (localDay(w.started_at) < from) continue;
    for (const [m, v] of Object.entries(w.muscles ?? {})) out[m as Muscle] = (out[m as Muscle] ?? 0) + Number(v);
  }
  return out;
}

export function WorkoutsPage() {
  const nav = useNav();
  const settings = useSettings();
  const workouts = useWorkouts();
  const routines = useRoutines();
  const catalog = useCatalog();
  const wd = useWorkoutDraft();

  const active = programByKey(settings.data?.active_program);
  const next = nextProgramDay(settings.data?.active_program, workouts.data, settings.data?.program_started);
  const nextRoutine = routines.data?.find((r) => r.program === next?.program.key && r.program_day === next?.index);
  const nextExercises = nextRoutine?.exercises ?? next?.day.exercises.map((x) => ({ ex: x.ex, sets: [], rest: x.rest })) ?? [];
  const last = useLastSets(nextExercises.map((x) => x.ex));
  const myRoutines = (routines.data ?? []).filter((r) => !r.program);
  useProgramReminders(active, next ? `${active?.title} · ${next.day.title}` : null);
  // Витрина: моя программа + самые известные
  const featured = [...(active ? [active] : []), ...PROGRAMS.filter((p) => p.key !== active?.key && ["starting-strength", "531-bbb", "reddit-ppl", "phul", "golden-six", "start-fullbody"].includes(p.key))].slice(0, 2);

  const week = weekStart(todayKey());
  const thisWeek = (workouts.data ?? []).filter((w) => localDay(w.started_at) >= week);
  const load = useMemo(() => {
    const sets = muscleSets(workouts.data, shiftKey(todayKey(), -6));
    const max = Math.max(1, ...Object.values(sets).map(Number));
    return Object.fromEntries(Object.entries(sets).map(([m, v]) => [m, Math.min(1, Number(v) / Math.max(max, 10))]));
  }, [workouts.data]);

  const startWith = (r: Pick<Routine, "id" | "name" | "exercises" | "program" | "program_day"> | null, name?: string) => {
    if (wd.draft) {
      nav.push(<ActiveWorkoutScreen />);
      return;
    }
    haptic.medium();
    wd.start({
      name: r?.name ?? name ?? "Тренировка",
      routineId: r?.id?.startsWith("program:") ? null : (r?.id ?? null),
      program: r?.program ?? null,
      programDay: r?.program_day ?? null,
      exercises: r?.exercises ?? [],
      last: last.data,
    });
    nav.push(<ActiveWorkoutScreen />);
  };

  const startNext = () => {
    if (!next) return;
    const r =
      nextRoutine ??
      ({
        id: `program:${next.program.key}`,
        name: next.day.title,
        program: next.program.key,
        program_day: next.index,
        exercises: next.day.exercises.map((x) => ({ ex: x.ex, sets: Array.from({ length: x.sets }, () => ({ reps: x.reps })), rest: x.rest, note: x.note })),
      } as Routine);
    startWith(r);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Тренировки</div>
        <HeaderAvatar />
      </div>

      {wd.draft ? (
        <ActiveCard onOpen={() => nav.push(<ActiveWorkoutScreen />)} />
      ) : next ? (
        <div className="start-card" style={{ ["--c1" as string]: next.program.colors[0], ["--c2" as string]: next.program.colors[1] }}>
          <div className="label">
            {next.program.emoji} {next.program.title} · день {next.index + 1} из {next.program.days.length}
          </div>
          <div className="title">{nextRoutine?.name ?? next.day.title}</div>
          <div className="sub">
            {next.day.focus} · ~{next.program.minutes} мин
          </div>
          <div className="start-thumbs">
            {nextExercises.slice(0, 6).map((x) => {
              const e = catalog.byId.get(x.ex);
              return e ? <ExerciseImage key={x.ex} ex={e} size={40} animate={false} radius={12} /> : null;
            })}
          </div>
          <Tap className="btn btn-block" onClick={startNext}>
            <Play size={18} fill="#111" /> Начать тренировку
          </Tap>
        </div>
      ) : (
        <div className="start-card">
          <div className="label">Готов потренироваться?</div>
          <div className="title">Выбери программу или начни с чистого листа</div>
          <div className="sub">Записывай веса и повторы — Emli посчитает рекорды и прогресс</div>
          <Tap className="btn btn-block" onClick={() => startWith(null, "Свободная тренировка")}>
            <Plus size={18} /> Пустая тренировка
          </Tap>
        </div>
      )}

      {next && !wd.draft && (
        <Tap className="btn btn-block btn-sm" style={{ marginTop: 10 }} onClick={() => startWith(null, "Свободная тренировка")}>
          <Plus size={16} /> Пустая тренировка
        </Tap>
      )}

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-sub">Эта неделя</div>
          <div className="row" style={{ alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <span className="num" style={{ fontSize: 30, fontWeight: 800 }}>
              {thisWeek.length}
            </span>
            <span className="muted">{active ? `из ${active.perWeek}` : "трен."}</span>
          </div>
          <WeekDots workouts={workouts.data} />
          <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            {fmtNum(thisWeek.reduce((s, w) => s + w.volume, 0) / 1000, 1)} т · {fmtNum(thisWeek.reduce((s, w) => s + w.kcal, 0))} ккал
          </div>
        </div>
        <Tap className="card" scale={0.97} style={{ textAlign: "left", padding: "12px 10px" }} onClick={() => nav.push(<HistoryScreen initialTab="muscles" />)}>
          <div className="card-sub" style={{ paddingLeft: 6 }}>
            Мышцы за 7 дней ›
          </div>
          <MuscleMap load={load} height={128} labels={false} />
        </Tap>
      </div>

      <div className="section-title">
        Программы
        {active && <button onClick={() => nav.push(<ProgramScreen programKey={active.key} />)}>Моя: {active.title}</button>}
      </div>
      <div className="stack">
        {featured.map((p) => (
          <ProgramTile key={p.key} p={p} active={active?.key === p.key} />
        ))}
      </div>
      <Tap className="btn btn-block btn-sm" style={{ marginTop: 10 }} onClick={() => nav.push(<ProgramsScreen />)}>
        Все программы · {PROGRAMS.length}
      </Tap>

      <div className="section-title">
        Мои шаблоны
        <button onClick={() => nav.push(<RoutineScreen />)}>+ Создать</button>
      </div>
      {myRoutines.length ? (
        <div className="list">
          {myRoutines.map((r) => (
            <button key={r.id} className="wk-row press" onClick={() => nav.push(<RoutineScreen routine={r} />)}>
              <span className="icon-btn" style={{ width: 42, height: 42, background: "rgba(124,140,255,.15)", color: "var(--kcal)" }}>
                <Dumbbell size={20} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650 }}>{r.name}</div>
                <div className="faint" style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.exercises.map((x) => catalog.byId.get(x.ex)?.n).filter(Boolean).join(" · ") || "пусто"}
                </div>
              </span>
              <Tap
                className="icon-btn"
                style={{ width: 38, height: 38, background: "var(--good)", color: "#062a14" }}
                onClick={(e) => {
                  e.stopPropagation();
                  startWith(r);
                }}
                aria-label="Начать"
              >
                <Play size={16} fill="#062a14" />
              </Tap>
            </button>
          ))}
        </div>
      ) : (
        <div className="faint" style={{ fontSize: 14, padding: "0 4px" }}>
          Собери свою тренировку из любых упражнений — и запускай в одно касание
        </div>
      )}

      <div className="section-title">Ещё</div>
      <div className="list">
        {[
          { Icon: Library, title: "Упражнения", sub: `${catalog.list.length || 873} с техникой и анимацией`, go: () => nav.push(<ExercisesScreen />) },
          { Icon: Trophy, title: "Рекорды", sub: "Максимумы и прогресс по упражнениям", go: () => nav.push(<RecordsScreen />) },
          { Icon: History, title: "История", sub: `${workouts.data?.length ?? 0} тренировок`, go: () => nav.push(<HistoryScreen />) },
        ].map((i) => (
          <button key={i.title} className="list-item press" onClick={i.go}>
            <span className="li-icon">
              <i.Icon size={21} />
            </span>
            <span style={{ flex: 1 }}>
              <div className="li-title">{i.title}</div>
              <div className="li-sub">{i.sub}</div>
            </span>
            <ChevronRight size={18} className="faint" />
          </button>
        ))}
      </div>

      {!!workouts.data?.length && (
        <>
          <div className="section-title">
            Последние
            <button onClick={() => nav.push(<HistoryScreen />)}>Все</button>
          </div>
          <div className="list">
            {workouts.data.slice(0, 3).map((w) => (
              <WorkoutRowItem key={w.id} w={w} onClick={() => nav.push(<WorkoutDetailScreen id={w.id} />)} />
            ))}
          </div>
        </>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

function ActiveCard({ onOpen }: { onOpen: () => void }) {
  const wd = useWorkoutDraft();
  const d = wd.draft!;
  const done = d.exercises.reduce((s, e) => s + e.sets.filter((x) => x.done).length, 0);
  const total = d.exercises.reduce((s, e) => s + e.sets.length, 0);
  return (
    <div className="start-card" style={{ ["--c1" as string]: "#22b573", ["--c2" as string]: "#1d8f9a" }}>
      <div className="label">● Идёт тренировка</div>
      <div className="title">{d.name}</div>
      <div className="sub">
        <ElapsedText from={d.startedAt} /> · {done} из {total} подходов
      </div>
      <Tap className="btn btn-block" onClick={onOpen}>
        <Play size={18} fill="#111" /> Продолжить
      </Tap>
    </div>
  );
}

/** Сколько идёт тренировка — обновляется каждую секунду */
export function ElapsedText({ from }: { from: string }) {
  const now = useNow();
  return <span className="num">{fmtDuration((now - new Date(from).getTime()) / 1000)}</span>;
}

function WeekDots({ workouts }: { workouts?: WorkoutRow[] }) {
  const start = weekStart(todayKey());
  const days = new Set((workouts ?? []).map((w) => localDay(w.started_at)));
  return (
    <div className="row" style={{ gap: 5, marginTop: 10 }}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = shiftKey(start, i);
        const on = days.has(d);
        return (
          <span
            key={d}
            style={{
              flex: 1,
              height: 22,
              borderRadius: 7,
              background: on ? "linear-gradient(180deg,#4fd18b,#22b573)" : d === todayKey() ? "var(--card-3)" : "var(--card-2)",
              display: "grid",
              placeItems: "center",
              fontSize: 10,
              fontWeight: 700,
              color: on ? "#062a14" : "var(--text-3)",
            }}
          >
            {"ПВСЧПСВ"[i]}
          </span>
        );
      })}
    </div>
  );
}

export function WorkoutRowItem({ w, onClick }: { w: WorkoutRow; onClick: () => void }) {
  const d = localDay(w.started_at);
  return (
    <button className="wk-row press" onClick={onClick}>
      <span className="wk-date">
        <b className="num">{fromKey(d).getDate()}</b>
        <span>{fmt(d, "MMM")}</span>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 650 }}>
          {w.name} {w.prs?.length ? "🏆" : ""}
        </div>
        <div className="faint" style={{ fontSize: 13 }}>
          {fmtDuration(w.duration_s)} · {w.sets_done} подх. · {fmtNum(w.volume)} кг · {w.kcal} ккал
        </div>
      </span>
      <ChevronRight size={18} className="faint" />
    </button>
  );
}

const WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const DEFAULT_DAYS: Record<number, number[]> = { 1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 7] };

/** Напоминания бота о тренировках: дни — из расписания программы, текст — следующий день программы */
function useProgramReminders(p: ReturnType<typeof programByKey>, label: string | null) {
  const rem = useReminders();
  const save = useSaveReminders();
  useEffect(() => {
    const r = rem.data;
    if (!r || !p) return;
    const patch: Partial<Reminders> = {};
    if (!r.workout_days.length) {
      const fromText = WD.map((w, i) => (new RegExp(`(^|[^а-яё])${w}([^а-яё]|$)`).test(p.schedule.toLowerCase()) ? i + 1 : 0)).filter(Boolean);
      patch.workout_days = fromText.length === p.perWeek ? fromText : (DEFAULT_DAYS[p.perWeek] ?? [1, 3, 5]);
    }
    if (label && r.workout_label !== label) patch.workout_label = label;
    if (Object.keys(patch).length) save.mutate(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rem.data?.workout_label, rem.data?.workout_days.length, p?.key, label]);
}
