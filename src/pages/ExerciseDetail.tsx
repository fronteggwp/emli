import { useMemo } from "react";
import { Lightbulb, Play, Plus } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useBests, useCatalog, useExerciseHistory } from "@/data/workouts";
import { exDraftFrom, useWorkoutDraft } from "@/state/workout";
import { CATEGORY_RU, EQUIPMENT_RU, LEVEL_RU, MUSCLE_RU, e1rm, isTimed } from "@/lib/exercise";
import { fmt } from "@/lib/dates";
import { haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { ExerciseImage } from "@/ui/ExerciseImage";
import { MuscleMap, exerciseLoad } from "@/ui/MuscleMap";
import { LineChart, useMounted } from "@/ui/Charts";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { ActiveWorkoutScreen } from "./ActiveWorkout";
import "./workouts.css";

const fmtW = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

export function ExerciseScreen({ id }: { id: string }) {
  const nav = useNav();
  const toast = useToast();
  const catalog = useCatalog();
  const bests = useBests();
  const history = useExerciseHistory(id);
  const wd = useWorkoutDraft();
  const mounted = useMounted(350);
  const ex = catalog.byId.get(id);
  const best = bests.data?.get(id);
  const timed = ex ? isTimed(ex) : false;

  // По тренировкам: лучший расчётный максимум за день — для графика
  const sessions = useMemo(() => {
    const byW = new Map<string, { day: string; name: string; sets: { w: number | null; r: number | null; s: number | null; kind: string }[] }>();
    for (const r of history.data ?? []) {
      const key = r.workout_id;
      const cur = byW.get(key) ?? { day: r.workouts.started_at, name: r.workouts.name, sets: [] };
      cur.sets.push({ w: r.weight, r: r.reps, s: r.seconds, kind: r.kind });
      byW.set(key, cur);
    }
    return [...byW.values()].sort((a, b) => b.day.localeCompare(a.day));
  }, [history.data]);

  const chart = useMemo(
    () =>
      [...sessions]
        .reverse()
        .map((s) => ({
          day: s.day.slice(0, 10),
          value: Math.max(0, ...s.sets.filter((x) => x.kind !== "warmup").map((x) => (x.w && x.r ? e1rm(x.w, x.r) : (x.r ?? 0)))),
        }))
        .filter((p) => p.value > 0),
    [sessions],
  );

  if (!ex) {
    return (
      <Screen title="Упражнение">
        <div className="skeleton" style={{ height: 260, borderRadius: 26 }} />
      </Screen>
    );
  }

  const addToWorkout = () => {
    haptic.success();
    if (wd.draft) {
      wd.update((d) => ({ ...d, exercises: [...d.exercises, exDraftFrom(ex.id, null)] }));
      toast("Добавлено в тренировку");
      return;
    }
    wd.start({ name: ex.n, exercises: [{ ex: ex.id, sets: [{ reps: "" }, { reps: "" }, { reps: "" }], rest: 90 }] });
    nav.push(<ActiveWorkoutScreen />);
  };

  const usesWeights = !!best?.best_weight;

  return (
    <Screen title="">
      <div className="ex-hero">
        <ExerciseImage ex={ex} radius={26} />
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: "16px 0 2px", lineHeight: 1.2 }}>{ex.n}</h1>
      {ex.en !== ex.n && <div className="faint" style={{ fontSize: 13 }}>{ex.en}</div>}
      <div className="ex-badges">
        <span className="ex-badge">{LEVEL_RU[ex.l]}</span>
        {ex.e && <span className="ex-badge">{EQUIPMENT_RU[ex.e]}</span>}
        <span className="ex-badge">{CATEGORY_RU[ex.c]}</span>
        {ex.m && <span className="ex-badge">{ex.m === "compound" ? "Базовое" : "Изолирующее"}</span>}
      </div>

      <Tap className="btn btn-accent btn-block" style={{ marginTop: 16 }} onClick={addToWorkout}>
        {wd.draft ? (
          <>
            <Plus size={18} /> Добавить в тренировку
          </>
        ) : (
          <>
            <Play size={17} fill="#fff" /> Начать тренировку с ним
          </>
        )}
      </Tap>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>
          Работающие мышцы
        </div>
        <MuscleMap load={exerciseLoad(ex.pm, ex.sm)} height={210} />
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {ex.pm.map((m) => (
            <span key={m} className="ex-badge" style={{ background: "rgba(255,122,92,.18)", color: "var(--protein)" }}>
              {MUSCLE_RU[m]}
            </span>
          ))}
          {ex.sm.map((m) => (
            <span key={m} className="ex-badge">
              {MUSCLE_RU[m]}
            </span>
          ))}
        </div>
      </div>

      {ex.i.length > 0 && (
        <>
          <div className="section-title">Техника</div>
          <div className="steps">
            {ex.i.map((s, i) => (
              <div key={i} className="step">
                <span>{s}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {ex.t.length > 0 && (
        <div className="stack" style={{ marginTop: 14, gap: 8 }}>
          {ex.t.map((t, i) => (
            <div key={i} className="tip">
              <Lightbulb size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              {t}
            </div>
          ))}
        </div>
      )}

      <div className="section-title">Мои результаты</div>
      {best ? (
        <>
          <div className="pr-grid">
            {usesWeights && !timed && (
              <>
                <div className="pr-tile">
                  <div className="v num">{fmtW(best.best_e1rm ?? 0)} кг</div>
                  <div className="k">расчётный максимум (1ПМ)</div>
                </div>
                <div className="pr-tile">
                  <div className="v num">{fmtW(best.best_weight ?? 0)} кг</div>
                  <div className="k">максимальный вес</div>
                </div>
              </>
            )}
            <div className="pr-tile">
              <div className="v num">{best.best_reps ?? 0}</div>
              <div className="k">максимум повторов</div>
            </div>
            <div className="pr-tile">
              <div className="v num">{best.sets}</div>
              <div className="k">подходов всего</div>
            </div>
          </div>
          {mounted && chart.length > 1 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-title">{usesWeights ? "Прогресс 1ПМ" : "Прогресс повторов"}</div>
              <div className="card-sub" style={{ marginBottom: 14 }}>
                лучший подход каждой тренировки
              </div>
              <LineChart points={chart} height={170} color="var(--good)" unit={usesWeights ? "кг" : "повт"} digits={usesWeights ? 1 : 0} />
            </div>
          )}
          <div className="section-title">История</div>
          <div className="list">
            {sessions.slice(0, 20).map((s, i) => (
              <div key={i} className="wk-row">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{fmt(s.day.slice(0, 10), "d MMMM, EEEEEE")}</div>
                  <div className="faint num" style={{ fontSize: 13, marginTop: 2 }}>
                    {s.sets
                      .map((x) => (x.s ? `${x.s} с` : `${x.w ? fmtW(x.w) + "×" : ""}${x.r ?? 0}`) + (x.kind === "warmup" ? "р" : ""))
                      .join("  ·  ")}
                  </div>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty" style={{ paddingTop: 12 }}>
          Сделай это упражнение в тренировке — здесь появятся рекорды и график прогресса
        </div>
      )}
    </Screen>
  );
}
