import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { useCatalog } from "@/data/workouts";
import { EQUIPMENT_RU, MUSCLE_GROUPS, MUSCLE_RU, searchExercises, type Equipment, type Exercise } from "@/lib/exercise";
import { useDebounced } from "@/lib/hooks";
import { haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { ExerciseImage } from "@/ui/ExerciseImage";
import { Tap } from "@/ui/Tap";
import { ExerciseScreen } from "./ExerciseDetail";
import { CustomExerciseSheet } from "@/sheets/CustomExercise";
import "./workouts.css";

const EQUIP_FILTERS: (Equipment | "none")[] = ["barbell", "dumbbell", "body only", "cable", "machine", "kettlebells", "bands", "e-z curl bar"];

/** Каталог упражнений. pick — режим выбора для тренировки/шаблона */
export function ExercisesScreen({ pick = false, single = false, onPick }: { pick?: boolean; single?: boolean; onPick?: (ids: string[]) => void }) {
  const nav = useNav();
  const layer = useLayer();
  const catalog = useCatalog();
  const [q, setQ] = useState("");
  const term = useDebounced(q, 150);
  const [group, setGroup] = useState<string | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [limit, setLimit] = useState(40);
  const sentinel = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    let l = catalog.list;
    if (group) {
      const g = MUSCLE_GROUPS.find((x) => x.key === group)!;
      l = l.filter((e) => e.pm.some((m) => g.muscles.includes(m)));
    }
    if (equip) l = l.filter((e) => e.e === equip);
    return searchExercises(l, term);
  }, [catalog.list, group, equip, term]);

  useEffect(() => setLimit(40), [term, group, equip]);

  // Подгружаем список порциями по мере прокрутки
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((n) => n + 40), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length]);

  const tapRow = (e: Exercise) => {
    if (!pick) {
      nav.push(<ExerciseScreen id={e.id} />);
      return;
    }
    haptic.select();
    if (single) {
      onPick?.([e.id]);
      layer.close();
      return;
    }
    setPicked((p) => (p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id]));
  };

  return (
    <Screen title={pick ? "Выбери упражнения" : "Упражнения"}>
      <div className="search-box" style={{ margin: 0 }}>
        <Search size={19} className="faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Жим, присед, бицепс…" autoCapitalize="none" />
        {q && (
          <button className="icon-btn" onClick={() => setQ("")}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className="chips-row" style={{ margin: "0 -16px", padding: "12px 16px 0" }}>
        {MUSCLE_GROUPS.map((g) => (
          <Tap
            key={g.key}
            className={`chip ${group === g.key ? "on" : ""}`}
            onClick={() => {
              haptic.select();
              setGroup(group === g.key ? null : g.key);
            }}
          >
            {g.emoji} {g.title}
          </Tap>
        ))}
      </div>
      <div className="chips-row" style={{ margin: "0 -16px", padding: "8px 16px 4px" }}>
        {EQUIP_FILTERS.map((e) => (
          <Tap
            key={e}
            className={`chip ${equip === e ? "on" : ""}`}
            style={{ height: 32, fontSize: 13 }}
            onClick={() => {
              haptic.select();
              setEquip(equip === e ? null : e);
            }}
          >
            {EQUIPMENT_RU[e as Equipment]}
          </Tap>
        ))}
      </div>

      <div className="row" style={{ justifyContent: "space-between", margin: "10px 2px 4px" }}>
        <span className="faint" style={{ fontSize: 13 }}>
          {catalog.loading ? "Загружаю…" : `${list.length} упражнений`}
        </span>
        <button className="row" style={{ gap: 4, fontSize: 14, fontWeight: 600, color: "var(--kcal)" }} onClick={() => nav.sheet(<CustomExerciseSheet />)}>
          <Plus size={16} /> Своё
        </button>
      </div>

      {catalog.loading ? (
        <div className="stack">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 60 }} />
          ))}
        </div>
      ) : (
        <div>
          {list.slice(0, limit).map((e) => {
            const on = picked.includes(e.id);
            return (
              <button key={e.id} className="ex-row press" onClick={() => tapRow(e)}>
                <ExerciseImage ex={e} animate={false} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div className="ex-row-name">{e.n}</div>
                  <div className="ex-row-sub">
                    {e.pm.map((m) => MUSCLE_RU[m]).join(", ")}
                    {e.e ? ` · ${EQUIPMENT_RU[e.e]}` : ""}
                    {e.custom ? " · своё" : ""}
                  </div>
                </span>
                {pick && !single && (
                  <span className={`pick-check ${on ? "on" : ""}`}>{on && <Check size={15} strokeWidth={3} color="#fff" />}</span>
                )}
              </button>
            );
          })}
          <div ref={sentinel} style={{ height: 1 }} />
          {!list.length && <div className="empty">Ничего не нашлось. Создай своё упражнение — кнопка «Своё» выше.</div>}
        </div>
      )}

      {pick && !single && picked.length > 0 && (
        <div className="pick-bar">
          <Tap
            className="btn btn-accent btn-block"
            onClick={() => {
              haptic.success();
              onPick?.(picked);
              layer.close();
            }}
          >
            Добавить {picked.length} {picked.length === 1 ? "упражнение" : picked.length < 5 ? "упражнения" : "упражнений"}
          </Tap>
        </div>
      )}
    </Screen>
  );
}
