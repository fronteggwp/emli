import { Play } from "lucide-react";
import { useNav, type Tab } from "@/nav/Nav";
import { fmtDuration, useNow, useWorkoutDraft } from "@/state/workout";
import { haptic } from "@/lib/telegram";
import { ActiveWorkoutScreen } from "@/pages/ActiveWorkout";
import "@/pages/workouts.css";

/** Плашка «идёт тренировка» над меню: можно уйти в дневник и вернуться к подходам */
export function ActiveBar({ tab }: { tab: Tab }) {
  const wd = useWorkoutDraft();
  const nav = useNav();
  const now = useNow(!!wd.draft);
  if (!wd.draft || tab === "workouts") return null;
  const d = wd.draft;
  const done = d.exercises.reduce((s, e) => s + e.sets.filter((x) => x.done).length, 0);
  const restLeft = wd.rest ? Math.ceil((wd.rest.endAt - now) / 1000) : 0;
  return (
    <button
      className="active-bar tap"
      style={{ ["--tap-scale" as string]: 0.98 }}
      onClick={() => {
        haptic.tap();
        nav.push(<ActiveWorkoutScreen />);
      }}
    >
      <span className="pulse" />
      <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
        <div style={{ fontSize: 12.5, opacity: 0.9 }} className="num">
          {fmtDuration((now - new Date(d.startedAt).getTime()) / 1000)} · {done} подх.
          {restLeft > 0 ? ` · отдых ${fmtDuration(restLeft)}` : ""}
        </div>
      </span>
      <span className="icon-btn" style={{ width: 36, height: 36, background: "rgba(255,255,255,.22)", color: "#fff" }}>
        <Play size={16} fill="#fff" />
      </span>
    </button>
  );
}
