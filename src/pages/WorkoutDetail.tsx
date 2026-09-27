import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Share2, Trash } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { useCatalog, useDeleteWorkout, useSaveRoutine, useWorkoutDetail } from "@/data/workouts";
import { localDay } from "@/data/workouts";
import { fmtDuration } from "@/state/workout";
import { MUSCLE_RU, type Muscle } from "@/lib/exercise";
import { fmt } from "@/lib/dates";
import { fmtNum } from "@/lib/nutrition";
import { confirmDialog, haptic, vibrate } from "@/lib/telegram";
import { sfx } from "@/lib/sound";
import { Screen } from "@/ui/Screen";
import { ExerciseImage } from "@/ui/ExerciseImage";
import { MuscleMap } from "@/ui/MuscleMap";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { NewPostSheet } from "@/sheets/NewPost";
import { ExerciseScreen } from "./ExerciseDetail";
import "./workouts.css";

const fmtW = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const PR_KIND = { e1rm: "расчётный максимум", weight: "рабочий вес", reps: "повторения", volume: "объём" } as const;
const CONFETTI = ["#7c8cff", "#b388ff", "#ff7a5c", "#ffc247", "#4fd18b", "#ff5e9e"];

function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 70 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dx: (Math.random() - 0.5) * 160,
      rot: (Math.random() - 0.5) * 900,
      color: CONFETTI[i % CONFETTI.length],
      w: 6 + Math.random() * 6,
    })),
  );
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), 3400);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div className="confetti">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: p.w,
            animationDelay: `${p.delay}s`,
            ["--dx" as string]: `${p.dx}px`,
            ["--rot" as string]: `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}

/** Итоги тренировки (сразу после завершения — с поздравлением) */
export function WorkoutDetailScreen({ id, celebrate = false }: { id: string; celebrate?: boolean }) {
  const nav = useNav();
  const layer = useLayer();
  const toast = useToast();
  const catalog = useCatalog();
  const q = useWorkoutDetail(id);
  const del = useDeleteWorkout();
  const saveRoutine = useSaveRoutine();

  useEffect(() => {
    if (celebrate) {
      vibrate("success");
      sfx.celebrate();
    }
  }, [celebrate]);

  const w = q.data?.workout;
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof q.data>["sets"]>();
    for (const s of q.data?.sets ?? []) m.set(s.exercise, [...(m.get(s.exercise) ?? []), s]);
    return [...m.entries()];
  }, [q.data]);

  const load = useMemo(() => {
    const entries = Object.entries(w?.muscles ?? {}) as [Muscle, number][];
    const max = Math.max(1, ...entries.map(([, v]) => v));
    return Object.fromEntries(entries.map(([m, v]) => [m, v / max]));
  }, [w]);
  const topMuscles = (Object.entries(w?.muscles ?? {}) as [Muscle, number][]).sort((a, b) => b[1] - a[1]).slice(0, 4);

  if (!w) {
    return (
      <Screen title="Тренировка">
        <div className="skeleton" style={{ height: 300, borderRadius: 26 }} />
      </Screen>
    );
  }

  const share = () =>
    nav.sheet(
      <NewPostSheet
        attach={{
          type: "workout",
          name: w.name,
          duration: w.duration_s,
          volume: Math.round(w.volume),
          sets: w.sets_done,
          kcal: w.kcal,
          prs: w.prs.length,
          muscles: topMuscles.map(([m]) => MUSCLE_RU[m]),
          load: Object.fromEntries(Object.entries(load).map(([k, v]) => [k, Math.round(Number(v) * 100) / 100])),
          top: groups
            .map(([exId, sets]) => {
              const work = sets.filter((x) => x.kind !== "warmup");
              const vol = work.reduce((acc, x) => acc + (x.weight ?? 0) * (x.reps ?? 0), 0);
              const bestSet = [...work].sort((p, q) => (q.weight ?? 0) * (1 + (q.reps ?? 0) / 30) - (p.weight ?? 0) * (1 + (p.reps ?? 0) / 30))[0];
              const v = bestSet?.seconds ? `${bestSet.seconds} с` : bestSet?.weight ? `${fmtW(bestSet.weight)} × ${bestSet.reps}` : `${bestSet?.reps ?? 0} повт.`;
              return { n: catalog.byId.get(exId)?.n ?? exId, v, pr: w.prs.some((pr) => pr.ex === exId), vol };
            })
            .sort((p, q) => Number(q.pr) - Number(p.pr) || q.vol - p.vol)
            .slice(0, 3)
            .map(({ n, v, pr }) => ({ n, v, pr })),
        }}
      />,
      { full: true },
    );

  const saveAsRoutine = async () => {
    await saveRoutine.mutateAsync({
      name: w.name,
      exercises: groups.map(([ex, sets]) => ({ ex, sets: sets.filter((s) => s.kind !== "warmup").map((s) => ({ reps: s.reps ? String(s.reps) : s.seconds ? `${s.seconds} с` : "8-12" })), rest: 90 })),
    });
    haptic.success();
    toast("Сохранено в «Мои шаблоны»");
  };

  return (
    <Screen title={celebrate ? "" : fmt(localDay(w.started_at), "d MMMM")}>
      {celebrate && <Confetti />}
      {celebrate ? (
        <div className="done-hero">
          <div className="done-trophy">{w.prs.length ? "🏆" : "💪"}</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 6 }}>{w.prs.length ? "Новые рекорды!" : "Тренировка завершена!"}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            {w.name}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{w.name}</div>
      )}

      <div className="done-stats">
        <div>
          <b className="num">{fmtDuration(w.duration_s)}</b>
          <span>длительность</span>
        </div>
        <div>
          <b className="num">{fmtNum(w.volume)} кг</b>
          <span>поднято за тренировку</span>
        </div>
        <div>
          <b className="num">{w.sets_done}</b>
          <span>рабочих подходов</span>
        </div>
        <div>
          <b className="num">≈ {w.kcal}</b>
          <span>ккал сожжено</span>
        </div>
      </div>

      {w.prs.length > 0 && (
        <>
          <div className="section-title">Рекорды</div>
          {w.prs.map((pr, i) => {
            const ex = catalog.byId.get(pr.ex);
            return (
              <button key={i} className="pr-item tap" style={{ width: "100%", textAlign: "left" }} onClick={() => nav.push(<ExerciseScreen id={pr.ex} />)}>
                <span style={{ fontSize: 26 }}>🏆</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{ex?.n ?? pr.ex}</div>
                  <div className="muted num" style={{ fontSize: 13 }}>
                    {PR_KIND[pr.kind]}: {pr.kind === "reps" ? pr.value : `${fmtW(pr.value)} кг`}
                    {pr.prev ? ` (было ${pr.kind === "reps" ? pr.prev : fmtW(pr.prev)})` : ""}
                  </div>
                </span>
              </button>
            );
          })}
        </>
      )}

      {Object.keys(load).length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>
            Нагруженные мышцы
          </div>
          <MuscleMap load={load} height={200} />
          <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {topMuscles.map(([m, v]) => (
              <span key={m} className="ex-badge">
                {MUSCLE_RU[m]} · {fmtNum(v, v % 1 ? 1 : 0)} подх.
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="section-title">Упражнения</div>
      <div className="list">
        {groups.map(([exId, sets]) => {
          const ex = catalog.byId.get(exId);
          return (
            <button key={exId} className="day-ex press" style={{ padding: "12px 14px", alignItems: "flex-start" }} onClick={() => nav.push(<ExerciseScreen id={exId} />)}>
              {ex && <ExerciseImage ex={ex} animate={false} />}
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 15 }}>{ex?.n ?? exId}</div>
                <div className="faint num" style={{ fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>
                  {sets
                    .map((s) => (s.seconds ? `${s.seconds} с` : `${s.weight ? fmtW(s.weight) + "×" : ""}${s.reps ?? 0}`) + (s.kind === "warmup" ? "р" : s.kind === "drop" ? "д" : ""))
                    .join("  ·  ")}
                </div>
              </span>
            </button>
          );
        })}
      </div>

      <div className="stack" style={{ marginTop: 20, gap: 10 }}>
        <Tap className="btn btn-accent btn-block" onClick={share}>
          <Share2 size={18} /> Поделиться в ленте
        </Tap>
        {!w.routine_id && !w.program && (
          <Tap className="btn btn-block" onClick={saveAsRoutine} disabled={saveRoutine.isPending}>
            <BookmarkPlus size={18} /> Сохранить как шаблон
          </Tap>
        )}
        {celebrate ? (
          <Tap className="btn btn-block" onClick={layer.close}>
            Готово
          </Tap>
        ) : (
          <button
            className="row faint"
            style={{ justifyContent: "center", gap: 6, fontSize: 14, marginTop: 6 }}
            onClick={async () => {
              if (!(await confirmDialog("Удалить тренировку? Рекорды пересчитаются."))) return;
              haptic.rigid();
              await del.mutateAsync(id);
              layer.close();
            }}
          >
            <Trash size={15} /> Удалить тренировку
          </button>
        )}
      </div>
    </Screen>
  );
}
