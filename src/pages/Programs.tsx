import { useMemo, useState } from "react";
import { useNav } from "@/nav/Nav";
import { useSettings } from "@/data/api";
import { GOAL_RU, PLACE_RU, PROGRAMS, type Program } from "@/data/programs";
import { LEVEL_RU } from "@/lib/exercise";
import { haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { ProgramScreen } from "./Program";
import "./workouts.css";

type Filter = { level?: Program["level"]; goal?: Program["goal"]; place?: "gym" | "home"; days?: "2-3" | "4" | "5+" };

/** Все программы сеткой с фильтрами */
export function ProgramsScreen() {
  const [f, setF] = useState<Filter>({});
  const active = useSettings().data?.active_program;

  const list = useMemo(
    () =>
      PROGRAMS.filter(
        (p) =>
          (!f.level || p.level === f.level) &&
          (!f.goal || p.goal === f.goal) &&
          (!f.place || (f.place === "home" ? p.place !== "gym" : p.place !== "home")) &&
          (!f.days || (f.days === "2-3" ? p.perWeek <= 3 : f.days === "4" ? p.perWeek === 4 : p.perWeek >= 5)),
      ),
    [f],
  );
  const famous = list.filter((p) => p.author && !p.key.startsWith("strength"));
  const rest = list.filter((p) => !famous.includes(p));

  const chip = <K extends keyof Filter>(key: K, value: Filter[K], label: string) => (
    <Tap
      key={`${key}-${value}`}
      className={`chip ${f[key] === value ? "on" : ""}`}
      style={{ height: 32, fontSize: 13 }}
      onClick={() => {
        haptic.select();
        setF((x) => ({ ...x, [key]: x[key] === value ? undefined : value }));
      }}
    >
      {label}
    </Tap>
  );

  return (
    <Screen title="Программы">
      <div className="chips-row" style={{ margin: "0 -16px", padding: "0 16px" }}>
        {chip("level", "beginner", LEVEL_RU.beginner)}
        {chip("level", "intermediate", LEVEL_RU.intermediate)}
        {chip("level", "expert", LEVEL_RU.expert)}
        {chip("place", "gym", "🏋️ Зал")}
        {chip("place", "home", "🏠 Дом / улица")}
      </div>
      <div className="chips-row" style={{ margin: "0 -16px", padding: "8px 16px 0" }}>
        {chip("goal", "muscle", GOAL_RU.muscle)}
        {chip("goal", "strength", GOAL_RU.strength)}
        {chip("goal", "fat", GOAL_RU.fat)}
        {chip("goal", "tone", GOAL_RU.tone)}
        {chip("days", "2-3", "2–3 дня")}
        {chip("days", "4", "4 дня")}
        {chip("days", "5+", "5–6 дней")}
      </div>

      {famous.length > 0 && (
        <>
          <div className="section-title">Легендарные</div>
          <div className="program-grid">
            {famous.map((p) => (
              <ProgramTile key={p.key} p={p} active={active === p.key} />
            ))}
          </div>
        </>
      )}
      {rest.length > 0 && (
        <>
          <div className="section-title">От Emli</div>
          <div className="program-grid">
            {rest.map((p) => (
              <ProgramTile key={p.key} p={p} active={active === p.key} />
            ))}
          </div>
        </>
      )}
      {!list.length && <div className="empty">Под такие фильтры программ нет — сними часть фильтров</div>}
    </Screen>
  );
}

export function ProgramTile({ p, active }: { p: Program; active?: boolean }) {
  const nav = useNav();
  return (
    <Tap
      className="program-tile"
      scale={0.97}
      style={{ ["--c1" as string]: p.colors[0], ["--c2" as string]: p.colors[1] }}
      onClick={() => nav.push(<ProgramScreen programKey={p.key} />)}
    >
      <span className="emoji">{p.emoji}</span>
      <div className="pt">{p.title}</div>
      {p.author && <div className="pa">{p.author}</div>}
      <div className="tags">
        <span className="tag">{p.perWeek}×/нед</span>
        <span className="tag">{GOAL_RU[p.goal]}</span>
        {p.place !== "gym" && <span className="tag">{PLACE_RU[p.place]}</span>}
        {active && <span className="tag">✓ твоя</span>}
      </div>
    </Tap>
  );
}
