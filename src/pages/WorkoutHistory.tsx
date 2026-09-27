import { useMemo, useState } from "react";
import { useNav } from "@/nav/Nav";
import { useWorkouts } from "@/data/workouts";
import { MUSCLE_GROUPS, type Muscle } from "@/lib/exercise";
import { fmt, shiftKey, todayKey, weekStart } from "@/lib/dates";
import { fmtNum } from "@/lib/nutrition";
import { Screen } from "@/ui/Screen";
import { Segmented } from "@/ui/Segmented";
import { MuscleMap } from "@/ui/MuscleMap";
import { WorkoutDetailScreen } from "./WorkoutDetail";
import { WorkoutRowItem, muscleSets } from "./Workouts";
import "./workouts.css";

// Рекомендуемый недельный объём на группу мышц для роста (рабочих подходов)
const ZONE = [10, 20];
const GROUP_COLORS: Record<string, string> = {
  chest: "#ff7a5c",
  back: "#7c8cff",
  shoulders: "#ffc247",
  arms: "#b388ff",
  legs: "#4fd18b",
  glutes: "#ff8fb1",
  core: "#5cc8ff",
};

export function HistoryScreen({ initialTab = "list" }: { initialTab?: "list" | "muscles" }) {
  const nav = useNav();
  const workouts = useWorkouts();
  const [tab, setTab] = useState<"list" | "muscles">(initialTab);
  const [days, setDays] = useState<7 | 30>(7);

  const weeks = useMemo(() => {
    const m = new Map<string, NonNullable<typeof workouts.data>>();
    for (const w of workouts.data ?? []) {
      const k = weekStart(w.started_at.slice(0, 10));
      m.set(k, [...(m.get(k) ?? []), w]);
    }
    return [...m.entries()];
  }, [workouts.data]);

  const sets = useMemo(() => muscleSets(workouts.data, shiftKey(todayKey(), -(days - 1))), [workouts.data, days]);
  const perWeek = days / 7;
  const groups = MUSCLE_GROUPS.map((g) => ({ ...g, sets: g.muscles.reduce((s, m) => s + (sets[m as Muscle] ?? 0), 0) / perWeek }));
  const load = useMemo(() => {
    const max = Math.max(1, ...Object.values(sets).map(Number));
    return Object.fromEntries(Object.entries(sets).map(([m, v]) => [m, Number(v) / Math.max(max, 8)]));
  }, [sets]);
  const scale = Math.max(24, ...groups.map((g) => g.sets)) * 1.05;

  return (
    <Screen title="История">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "list", label: "Тренировки" },
          { value: "muscles", label: "Мышцы" },
        ]}
      />

      {tab === "list" ? (
        weeks.length ? (
          weeks.map(([wk, list]) => (
            <div key={wk}>
              <div className="group-label row" style={{ justifyContent: "space-between" }}>
                <span>
                  {fmt(wk, "d MMM")} – {fmt(shiftKey(wk, 6), "d MMM")}
                </span>
                <span className="num" style={{ textTransform: "none" }}>
                  {list.length} трен. · {fmtNum(list.reduce((s, w) => s + w.volume, 0) / 1000, 1)} т
                </span>
              </div>
              <div className="list">
                {list.map((w) => (
                  <WorkoutRowItem key={w.id} w={w} onClick={() => nav.push(<WorkoutDetailScreen id={w.id} />)} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="empty">
            <div className="big">🏋️</div>
            Здесь появятся твои тренировки
          </div>
        )
      ) : (
        <>
          <div style={{ margin: "14px 0 10px" }}>
            <Segmented
              size="sm"
              value={days}
              onChange={setDays}
              options={[
                { value: 7, label: "7 дней" },
                { value: 30, label: "30 дней" },
              ]}
            />
          </div>
          <div className="card">
            <MuscleMap load={load} height={230} />
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">Подходов в неделю</div>
            <div className="card-sub" style={{ marginBottom: 10 }}>
              пунктиром — зона для роста мышц ({ZONE[0]}–{ZONE[1]})
            </div>
            {groups.map((g) => {
              const low = g.sets < ZONE[0];
              return (
                <div key={g.key} className="mload">
                  <span>
                    {g.emoji} {g.title}
                  </span>
                  <div className="mload-bar">
                    <span className="mload-zone" style={{ left: `${(ZONE[0] / scale) * 100}%`, width: `${((ZONE[1] - ZONE[0]) / scale) * 100}%` }} />
                    <i style={{ width: `${Math.min(g.sets / scale, 1) * 100}%`, background: GROUP_COLORS[g.key] }} />
                  </div>
                  <span className="num" style={{ textAlign: "right", fontWeight: 700, color: low ? "var(--text-3)" : undefined }}>
                    {fmtNum(g.sets, g.sets % 1 && g.sets < 10 ? 1 : 0)}
                  </span>
                </div>
              );
            })}
            <p className="faint" style={{ fontSize: 12.5, margin: "10px 0 0", lineHeight: 1.45 }}>
              Основная мышца упражнения = 1 подход, вспомогательная = ½. Для роста большинству мышц хватает 10–20 рабочих подходов в неделю.
            </p>
          </div>
        </>
      )}
    </Screen>
  );
}
