import { useMemo } from "react";
import { useInsights } from "@/data/insights";
import { shiftKey, todayKey } from "@/lib/dates";
import { estimateTdee, fmtNum } from "@/lib/nutrition";
import { Screen } from "@/ui/Screen";
import { LineChart, useMounted } from "@/ui/Charts";
import { NumberTicker } from "@/ui/NumberTicker";
import { Bar } from "@/ui/Rings";
import "./stats.css";

export function ExpenditureScreen() {
  const ins = useInsights();
  const mounted = useMounted(320);

  const points = useMemo(() => {
    const y = shiftKey(todayKey(), -1);
    return Array.from({ length: 30 }, (_, i) => {
      const d = shiftKey(y, i - 29);
      return { day: d, value: estimateTdee(ins.totals, ins.trend, ins.formula, d).value };
    });
  }, [ins.totals, ins.trend, ins.formula]);

  const conf = Math.round(ins.tdee.confidence * 100);

  return (
    <Screen title="Расход энергии">
      <div className="card" style={{ background: "radial-gradient(120% 100% at 0% 0%, rgba(255,122,92,.16), transparent 60%), var(--card)" }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Ты тратишь в день примерно
        </div>
        <div className="row" style={{ alignItems: "baseline", gap: 6, marginTop: 4 }}>
          <span className="big-stat num">
            <NumberTicker value={ins.tdee.value} />
          </span>
          <span className="muted" style={{ fontSize: 18 }}>
            ккал
          </span>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="row muted" style={{ fontSize: 13, justifyContent: "space-between", marginBottom: 6 }}>
            <span>Точность оценки</span>
            <span className="num">{conf}%</span>
          </div>
          <Bar value={conf} max={100} color="var(--protein)" height={6} />
        </div>
        <div style={{ marginTop: 22 }}>
          {mounted && <LineChart points={points} height={180} color="var(--protein)" unit="ккал" digits={0} />}
        </div>
      </div>

      <div className="kv" style={{ marginTop: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <div className="k">По формуле</div>
          <div className="v num">{fmtNum(ins.formula)}</div>
        </div>
        <div>
          <div className="k">По твоим данным</div>
          <div className="v num">{ins.tdee.observed != null ? fmtNum(ins.tdee.observed) : "—"}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>
          Как это работает
        </div>
        <p className="explain" style={{ margin: 0 }}>
          Сначала расход считается по формуле Миффлина — Сан-Жеора из твоего роста, веса, возраста и активности. Дальше Emli сравнивает, <b>сколько ты съел</b> и <b>как изменился тренд веса</b> за последние 3 недели, и уточняет оценку под твой организм.
        </p>
        <p className="explain" style={{ margin: "10px 0 0" }}>
          Чем честнее и регулярнее записи еды и взвешивания, тем точнее цифра. Хватит 2–3 недель, чтобы оценка стала надёжной.
        </p>
      </div>
    </Screen>
  );
}
