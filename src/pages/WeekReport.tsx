import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useSummary, weeklyAdvice, type Summary } from "@/data/engage";
import { fmt, shiftKey, todayKey, weekStart } from "@/lib/dates";
import { fmtNum } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { NumberTicker } from "@/ui/NumberTicker";
import "./engage.css";
import "./week.css";
import "./recipes.css";

export function weekScore(s: Summary) {
  const log = Math.min(s.days_logged / 7, 1);
  const target = s.target_kcal ? (s.days_logged ? s.days_on_target / s.days_logged : 0) : 0.5;
  const gym = Math.min(s.workouts / 3, 1);
  const weigh = Math.min(s.weigh_ins / 4, 1);
  return Math.round(100 * (0.35 * log + 0.3 * target + 0.25 * gym + 0.1 * weigh));
}
const grade = (n: number) => (n >= 85 ? "Огонь 🔥" : n >= 70 ? "Отлично" : n >= 50 ? "Хорошо" : n >= 25 ? "Можно лучше" : "Начало положено");

export function WeekReportScreen() {
  const [start, setStart] = useState(() => weekStart(todayKey()));
  const end = shiftKey(start, 6);
  const q = useSummary(start, end);
  const s = q.data;
  const isCurrent = start === weekStart(todayKey());
  const move = (d: number) => {
    haptic.select();
    setStart((x) => shiftKey(x, d * 7));
  };

  return (
    <Screen title="Итоги недели">
      <div className="wr-nav">
        <Tap className="icon-btn" onClick={() => move(-1)} aria-label="Раньше">
          <ChevronLeft size={20} />
        </Tap>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700 }}>
            {fmt(start, "d MMM")} — {fmt(end, "d MMM")}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {isCurrent ? "эта неделя" : start === shiftKey(weekStart(todayKey()), -7) ? "прошлая неделя" : fmt(start, "yyyy")}
          </div>
        </div>
        <Tap className="icon-btn" onClick={() => move(1)} disabled={isCurrent} style={{ opacity: isCurrent ? 0.3 : 1 }} aria-label="Позже">
          <ChevronRight size={20} />
        </Tap>
      </div>

      {!s ? (
        <div className="skeleton" style={{ height: 420, borderRadius: 28, marginTop: 12 }} />
      ) : (
        <motion.div key={start} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <ScoreCard s={s} />
          <div className="wr-grid">
            <div className="wr-card">
              <div className="wr-label">🍽 Питание</div>
              <div className="wr-days">
                {Array.from({ length: 7 }, (_, i) => (
                  <i key={i} className={i < s.days_logged ? "on" : ""} />
                ))}
              </div>
              <div className="wr-big num">
                {s.days_logged}
                <small>/7 дней</small>
              </div>
              {s.avg_kcal != null && (
                <div className="wr-sub">
                  ≈ {fmtNum(s.avg_kcal)} ккал/день{s.target_kcal ? ` · цель ${fmtNum(s.target_kcal)}` : ""}
                </div>
              )}
              {s.target_kcal != null && s.days_logged > 0 && <div className="wr-sub">в норме ±10%: {s.days_on_target} дн.</div>}
            </div>
            <div className="wr-card">
              <div className="wr-label">🥩 Белок</div>
              <div className="wr-big num" style={{ color: "var(--protein)" }}>
                {s.avg_protein ?? "—"}
                <small> г/день</small>
              </div>
              {s.target_protein ? (
                <>
                  <div className="wr-bar">
                    <i style={{ width: `${Math.min(100, ((s.avg_protein ?? 0) / s.target_protein) * 100)}%`, background: "var(--protein)" }} />
                  </div>
                  <div className="wr-sub">цель {s.target_protein} г</div>
                </>
              ) : null}
            </div>
            <div className="wr-card">
              <div className="wr-label">⚖️ Вес</div>
              <div className="wr-big num" style={{ color: "var(--weight)" }}>
                {s.weight_avg != null ? fmtNum(s.weight_avg, 1) : "—"}
                <small> кг</small>
              </div>
              <div className="wr-sub">
                {s.weight_avg != null && s.weight_prev_avg != null
                  ? (() => {
                      const d = s.weight_avg - s.weight_prev_avg;
                      return Math.abs(d) < 0.05 ? "без изменений" : `${d > 0 ? "+" : "−"}${fmtNum(Math.abs(d), 1)} кг к прошлой`;
                    })()
                  : `${s.weigh_ins} взвеш.`}
              </div>
            </div>
            <div className="wr-card">
              <div className="wr-label">💪 Тренировки</div>
              <div className="wr-big num" style={{ color: "var(--good)" }}>
                {s.workouts}
                {s.workouts_prev > 0 && <small> (было {s.workouts_prev})</small>}
              </div>
              <div className="wr-sub">
                {s.minutes} мин{s.volume ? ` · ${fmtNum(s.volume / 1000, 1)} т` : ""}
              </div>
              {s.prs > 0 && <div className="wr-sub">🏆 рекордов: {s.prs}</div>}
              {s.burned > 0 && <div className="wr-sub">🔥 ≈ {fmtNum(s.burned)} ккал</div>}
            </div>
          </div>
          {s.streak >= 2 && (
            <div className="wr-streak">
              <span>🔥</span>
              <div>
                <b>Серия {s.streak} дн.</b>
                <div className="muted" style={{ fontSize: 13 }}>
                  Столько дней подряд ты ведёшь дневник
                </div>
              </div>
            </div>
          )}
          <div className="rc-tip" style={{ marginTop: 12 }}>
            <span>💡</span>
            <div>{weeklyAdvice(s)}</div>
          </div>
          <div className="faint" style={{ fontSize: 12, textAlign: "center", marginTop: 14 }}>
            Каждое воскресенье в 19:00 бот присылает эти итоги в Telegram
          </div>
        </motion.div>
      )}
    </Screen>
  );
}

function ScoreCard({ s }: { s: Summary }) {
  const score = weekScore(s);
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="wr-score">
      <svg viewBox="0 0 110 110" width={110} height={110}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--card-3)" strokeWidth="10" />
        <motion.circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke="url(#wrg)"
          strokeWidth="10"
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
          initial={{ strokeDasharray: `0 ${c}` }}
          animate={{ strokeDasharray: `${(score / 100) * c} ${c}` }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
        <defs>
          <linearGradient id="wrg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffc247" />
            <stop offset="1" stopColor="#ff5e7e" />
          </linearGradient>
        </defs>
      </svg>
      <div className="wr-score-num num">
        <NumberTicker value={score} />
      </div>
      <div>
        <div className="muted" style={{ fontSize: 13 }}>
          Оценка недели
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{grade(score)}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          дневник, попадание в цель, тренировки и взвешивания
        </div>
      </div>
    </div>
  );
}
