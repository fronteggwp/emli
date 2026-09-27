import { useMemo, useState } from "react";
import { Search, Trophy } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useBests, useCatalog } from "@/data/workouts";
import { norm } from "@/lib/exercise";
import { fmt } from "@/lib/dates";
import { Screen } from "@/ui/Screen";
import { ExerciseImage } from "@/ui/ExerciseImage";
import { ExerciseScreen } from "./ExerciseDetail";
import "./workouts.css";

const fmtW = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** Личные рекорды по всем упражнениям, которые ты делал */
export function RecordsScreen() {
  const nav = useNav();
  const catalog = useCatalog();
  const bests = useBests();
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const rows = [...(bests.data?.values() ?? [])]
      .map((b) => ({ b, ex: catalog.byId.get(b.exercise) }))
      .filter((r) => r.ex)
      .sort((a, b) => b.b.last_done.localeCompare(a.b.last_done));
    const n = norm(q);
    return n ? rows.filter((r) => norm(r.ex!.n).includes(n)) : rows;
  }, [bests.data, catalog.byId, q]);

  return (
    <Screen title="Рекорды">
      {(bests.data?.size ?? 0) > 6 && (
        <div className="search-box" style={{ margin: "0 0 12px" }}>
          <Search size={19} className="faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти упражнение" />
        </div>
      )}
      {list.length ? (
        <div className="list">
          {list.map(({ b, ex }) => (
            <button key={b.exercise} className="day-ex press" style={{ padding: "12px 14px" }} onClick={() => nav.push(<ExerciseScreen id={b.exercise} />)}>
              <ExerciseImage ex={ex!} animate={false} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 15, lineHeight: 1.25 }}>{ex!.n}</div>
                <div className="faint" style={{ fontSize: 12.5 }}>
                  {b.sets} подх. · последний раз {fmt(b.last_done.slice(0, 10), "d MMM")}
                </div>
              </span>
              <span style={{ textAlign: "right" }}>
                {b.best_e1rm ? (
                  <>
                    <div className="num" style={{ fontWeight: 800, fontSize: 17 }}>
                      {fmtW(b.best_e1rm)}
                    </div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      1ПМ, кг
                    </div>
                  </>
                ) : (
                  <>
                    <div className="num" style={{ fontWeight: 800, fontSize: 17 }}>
                      {b.best_reps ?? 0}
                    </div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      повт.
                    </div>
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Trophy size={40} style={{ display: "block", margin: "0 auto 10px" }} />
          Рекорды появятся после первых тренировок
        </div>
      )}
      <p className="faint" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.45 }}>
        1ПМ — расчётный разовый максимум по формуле Эпли: сколько ты смог бы поднять на один раз, исходя из лучшего подхода до 12 повторов.
      </p>
    </Screen>
  );
}
