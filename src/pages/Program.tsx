import { Check, Clock, Lightbulb, Play } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useSettings } from "@/data/api";
import { GOAL_RU, PLACE_RU, programByKey } from "@/data/programs";
import { useCatalog, useRoutines, useStartProgram, useStopProgram, useWorkouts } from "@/data/workouts";
import { useWorkoutDraft } from "@/state/workout";
import { useMemo } from "react";
import { LEVEL_RU } from "@/lib/exercise";
import { MuscleMap } from "@/ui/MuscleMap";
import { programStats } from "@/data/programStats";
import { confirmDialog, haptic, tg } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { ExerciseImage } from "@/ui/ExerciseImage";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { ExerciseScreen } from "./ExerciseDetail";
import { RoutineScreen } from "./Routine";
import { ActiveWorkoutScreen } from "./ActiveWorkout";
import "./workouts.css";

export function ProgramScreen({ programKey }: { programKey: string }) {
  const nav = useNav();
  const toast = useToast();
  const p = programByKey(programKey)!;
  const settings = useSettings();
  const catalog = useCatalog();
  const routines = useRoutines();
  const workouts = useWorkouts();
  const startProgram = useStartProgram();
  const stopProgram = useStopProgram();
  const wd = useWorkoutDraft();
  const isActive = settings.data?.active_program === p.key;
  const done = (workouts.data ?? []).filter((w) => w.program === p.key).length;

  const start = async () => {
    if (settings.data?.active_program && !isActive) {
      const cur = programByKey(settings.data.active_program);
      if (!(await confirmDialog(`Сменить программу «${cur?.title}» на «${p.title}»?`))) return;
    }
    await startProgram.mutateAsync(p.key);
    haptic.success();
    toast(`Программа «${p.title}» — твоя! 💪`);
  };

  const startDay = (i: number) => {
    if (wd.draft) {
      nav.push(<ActiveWorkoutScreen />);
      return;
    }
    const r = routines.data?.find((x) => x.program === p.key && x.program_day === i);
    const day = p.days[i];
    haptic.medium();
    wd.start({
      name: r?.name ?? day.title,
      routineId: r?.id ?? null,
      program: p.key,
      programDay: i,
      exercises:
        r?.exercises ??
        day.exercises.map((x) => ({ ex: x.ex, sets: Array.from({ length: x.sets }, () => ({ reps: x.reps })), rest: x.rest, note: x.note })),
    });
    nav.push(<ActiveWorkoutScreen />);
  };

  const st = useMemo(() => programStats(p, catalog.byId), [p, catalog.byId]);

  return (
    <Screen title="">
      <div className="program-hero" style={{ ["--c1" as string]: p.colors[0], ["--c2" as string]: p.colors[1] }}>
        <span className="emoji">{p.emoji}</span>
        <div className="row" style={{ gap: 6, marginBottom: 10 }}>
          <span className="tag">{LEVEL_RU[p.level]}</span>
          <span className="tag">{GOAL_RU[p.goal]}</span>
          <span className="tag">{PLACE_RU[p.place]}</span>
        </div>
        <h2>{p.title}</h2>
        <p>{p.subtitle}</p>
      </div>

      <div className="program-stats">
        <div>
          <b className="num">{p.perWeek}</b>
          <span>раз в неделю</span>
        </div>
        <div>
          <b className="num">~{p.minutes}</b>
          <span>минут</span>
        </div>
        <div>
          <b className="num">{st.weeklySets}</b>
          <span>подходов в неделю</span>
        </div>
      </div>

      <div className="for-who">
        <span>👤</span>
        <div>
          <div className="pcard-label">Для кого</div>
          <div style={{ fontSize: 15, marginTop: 2 }}>{p.forWho}</div>
        </div>
      </div>

      {p.author && (
        <div className="author-row">
          <span style={{ fontSize: 18 }}>✍️</span>
          <span style={{ flex: 1 }}>
            Автор: <b style={{ color: "var(--text)" }}>{p.author}</b>
          </span>
          {p.source && (
            <a
              href={p.source}
              onClick={(e) => {
                e.preventDefault();
                if (tg) tg.openLink(p.source!);
                else window.open(p.source, "_blank");
              }}
            >
              Первоисточник ↗
            </a>
          )}
        </div>
      )}
      <p className="explain" style={{ margin: "14px 2px 0", fontSize: 15 }}>
        {p.description}
      </p>
      <div className="row muted" style={{ gap: 6, fontSize: 13.5, margin: "10px 2px 0" }}>
        <Clock size={15} /> {p.schedule}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Нагрузка на мышцы</div>
        <div className="card-sub">по всем тренировкам программы за неделю</div>
        <div className="row" style={{ gap: 12, marginTop: 12, alignItems: "center" }}>
          <div className="pcard-map">
            <MuscleMap load={st.load} height={170} labels={false} color="#ff8a5c" />
          </div>
          <div className="pcard-bars">
            {st.groups.map((g) => (
              <div key={g.key} className="pcard-bar">
                <span>{g.title}</span>
                <div>
                  <i style={{ width: `${Math.min(100, g.pct * 2.2)}%`, background: g.color }} />
                </div>
                <b className="num">{g.pct}%</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isActive ? (
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <div className="btn btn-block" style={{ background: "rgba(79,209,139,.15)", color: "var(--good)" }}>
            <Check size={18} /> Твоя программа · {done} трен.
          </div>
          <Tap
            className="btn btn-sm"
            style={{ height: 54 }}
            onClick={async () => {
              if (!(await confirmDialog("Прекратить следовать этой программе? История тренировок сохранится."))) return;
              stopProgram.mutate();
            }}
          >
            Выйти
          </Tap>
        </div>
      ) : (
        <Tap
          className="btn btn-block"
          style={{ marginTop: 16, background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`, color: "#fff" }}
          disabled={startProgram.isPending}
          onClick={start}
        >
          Начать программу
        </Tap>
      )}

      <div className="section-title">Тренировки</div>
      <div className="stack">
        {p.days.map((d, i) => {
          const r = routines.data?.find((x) => x.program === p.key && x.program_day === i);
          const list = r?.exercises ?? d.exercises.map((x) => ({ ex: x.ex, sets: Array.from({ length: x.sets }, () => ({ reps: x.reps })), rest: x.rest }));
          return (
            <div key={i} className="day-card">
              <div className="day-card-head">
                <span className="day-num" style={{ background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{r?.name ?? d.title}</div>
                  <div className="faint" style={{ fontSize: 13 }}>
                    {d.focus}
                  </div>
                </span>
                {isActive && r && (
                  <button className="faint" style={{ fontSize: 13, fontWeight: 600 }} onClick={() => nav.push(<RoutineScreen routine={r} />)}>
                    Изменить
                  </button>
                )}
              </div>
              {list.map((x, j) => {
                const ex = catalog.byId.get(x.ex);
                if (!ex) return null;
                return (
                  <button key={j} className="day-ex press" onClick={() => nav.push(<ExerciseScreen id={ex.id} />)}>
                    <ExerciseImage ex={ex} animate={false} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{ex.n}</div>
                      <div className="faint num" style={{ fontSize: 12.5 }}>
                        {x.sets.length} × {x.sets[0]?.reps || "—"} · отдых {Math.floor(x.rest / 60)}:{String(x.rest % 60).padStart(2, "0")}
                      </div>
                    </span>
                  </button>
                );
              })}
              <div style={{ padding: "8px 16px 14px" }}>
                <Tap className="btn btn-block btn-sm" onClick={() => startDay(i)}>
                  <Play size={15} fill="currentColor" /> Начать эту тренировку
                </Tap>
              </div>
            </div>
          );
        })}
      </div>

      {p.progression && (
        <>
          <div className="section-title">Как прогрессировать</div>
          <div className="stack" style={{ gap: 10 }}>
            {p.progression.map((t, i) => (
              <div key={i} className="prog-step">
                <span>{t}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Советы</div>
      <div className="stack" style={{ gap: 8 }}>
        {p.tips.map((t, i) => (
          <div key={i} className="tip">
            <Lightbulb size={17} style={{ flexShrink: 0, marginTop: 1 }} />
            {t}
          </div>
        ))}
      </div>
    </Screen>
  );
}
