import { useMemo, useState } from "react";
import { useNav } from "@/nav/Nav";
import { useSettings } from "@/data/api";
import { GOAL_RU, PROGRAMS, type Program } from "@/data/programs";
import { LEVEL_RU } from "@/lib/exercise";
import { haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { MuscleMap } from "@/ui/MuscleMap";
import { useCatalog } from "@/data/workouts";
import { programStats } from "@/data/programStats";
import { Tap } from "@/ui/Tap";
import { ProgramScreen } from "./Program";
import "./workouts.css";
import { visual } from "@/ui/Icon3D";

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
      <div className="cover-banner" style={{ backgroundImage: `url(${visual("covers", "training-programs")})` }}>
        <div className="cover-banner-text">
          <b>Программы тренировок</b>
          <span>Легендарные схемы и программы от Emli</span>
        </div>
      </div>
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
          <div className="stack">
            {famous.map((p) => (
              <ProgramTile key={p.key} p={p} active={active === p.key} />
            ))}
          </div>
        </>
      )}
      {rest.length > 0 && (
        <>
          <div className="section-title">От Emli</div>
          <div className="stack">
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

const LEVEL_DOTS = { beginner: 1, intermediate: 2, expert: 3 } as const;

/** Широкая карточка программы: для кого, нагрузка на мышцы, что внутри */
export function ProgramTile({ p, active }: { p: Program; active?: boolean }) {
  const nav = useNav();
  const catalog = useCatalog();
  const st = useMemo(() => programStats(p, catalog.byId), [p, catalog.byId]);
  return (
    <Tap
      className="pcard"
      scale={0.98}
      style={{ ["--c1" as string]: p.colors[0], ["--c2" as string]: p.colors[1] }}
      onClick={() => nav.push(<ProgramScreen programKey={p.key} />)}
    >
      <div className="pcard-top">
        <span className="pcard-emoji">{p.emoji}</span>
        {active && <span className="pcard-active">✓ Твоя программа</span>}
        <div className="pcard-title">{p.title}</div>
        {p.author && <div className="pcard-author">{p.author}</div>}
        <div className="pcard-for">{p.forWho}</div>
      </div>
      <div className="pcard-body">
        <div className="pcard-meta">
          <span>
            <i className="lvl">
              {[1, 2, 3].map((n) => (
                <b key={n} className={n <= LEVEL_DOTS[p.level] ? "on" : ""} />
              ))}
            </i>
            {LEVEL_RU[p.level]}
          </span>
          <span>📅 {p.perWeek}×/нед</span>
          <span>⏱ ~{p.minutes} мин</span>
          <span>{p.place === "gym" ? "🏋️ Зал" : p.place === "home" ? "🏠 Дом" : "🌳 Где угодно"}</span>
          <span>🎯 {GOAL_RU[p.goal]}</span>
        </div>
        <div className="pcard-focus">
          <div className="pcard-map">
            <MuscleMap load={st.load} height={118} labels={false} color="#ff8a5c" />
          </div>
          <div className="pcard-bars">
            <div className="pcard-label">Акцент нагрузки</div>
            {st.groups.slice(0, 4).map((g) => (
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
        <div className="pcard-ex">
          <span className="pcard-label">Внутри</span> {st.key.join(" · ")}
          {st.exercises > st.key.length ? ` и ещё ${st.exercises - st.key.length}` : ""}
        </div>
      </div>
    </Tap>
  );
}
