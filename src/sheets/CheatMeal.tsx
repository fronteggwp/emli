import { useMemo, useState } from "react";
import { Check, Trash } from "lucide-react";
import { useLayer } from "@/nav/Nav";
import { useDayTargets, useDeletePlan, useSavePlan } from "@/data/api";
import { CHEAT_PRESETS, applyDelta, cutShare, saveDays, type CheatPlan } from "@/lib/cheat";
import { daysBetween, fmt, shiftKey, todayKey } from "@/lib/dates";
import { fmtNum } from "@/lib/nutrition";
import { confirmDialog, haptic } from "@/lib/telegram";
import { SheetHeader } from "@/ui/Screen";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "./cheat.css";

/** Планирование читмила: в выбранный день ешь больше, лишнее снимаем с соседних дней */
export function CheatMealSheet({ day: day0, plan }: { day?: string; plan?: CheatPlan }) {
  const layer = useLayer();
  const toast = useToast();
  const targets = useDayTargets();
  const save = useSavePlan();
  const del = useDeletePlan();
  const today = todayKey();

  const [day, setDay] = useState(plan?.day ?? (day0 && day0 >= today ? day0 : shiftKey(today, 3)));
  const [extra, setExtra] = useState(plan?.extra_kcal ?? 800);
  const [mode, setMode] = useState<"before" | "after">(plan?.mode ?? "before");
  const [spread, setSpread] = useState(plan?.spread_days ?? 3);
  const [title, setTitle] = useState(plan?.title ?? "");

  // «До» можно взять только будущие дни: сегодня уже частично прошёл, но его тоже считаем
  const beforeAvail = Math.min(7, daysBetween(today, day));
  const effMode = mode === "before" && beforeAvail < 1 ? "after" : mode;
  const maxSpread = effMode === "before" ? beforeAvail : 7;
  const effSpread = Math.max(1, Math.min(spread, maxSpread));

  // Норма дня без этого плана (другие читмилы учитываем)
  const baseFor = (d: string) => {
    const t = targets.forDay(d);
    const own = t.adjust.filter((a) => a.plan.id === plan?.id || a.plan.day === day).reduce((s, a) => s + a.delta, 0);
    return applyDelta(t, -own);
  };

  const draft = { day, spread_days: effSpread, mode: effMode };
  const affected = saveDays(draft);
  const perDay = Math.round(extra / effSpread);
  const cheatBase = baseFor(day);
  const share = cutShare(extra, effSpread, cheatBase.calories);
  const tooHard = share > 0.25;

  const bars = useMemo(() => {
    const days = [...affected, day].sort();
    return days.map((d) => {
      const base = baseFor(d).calories;
      const now = d === day ? base + extra : base - perDay;
      return { d, base, now, cheat: d === day };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affected.join(), day, extra, perDay, targets]);
  const top = Math.max(...bars.map((b) => Math.max(b.base, b.now))) * 1.05;

  const days14 = Array.from({ length: 21 }, (_, i) => shiftKey(today, i));

  const submit = async () => {
    haptic.success();
    await save.mutateAsync({ id: plan?.id, day, extra_kcal: extra, spread_days: effSpread, mode: effMode, title: title.trim() || null });
    toast(`Читмил ${fmt(day, "d MMMM")} запланирован 🍕`, <Check size={18} color="var(--good)" />);
    layer.close();
  };

  return (
    <>
      <SheetHeader title={plan ? "Читмил" : "Запланировать читмил"} />
      <div className="sheet-body">
        <div className="cheat-hero">
          <div className="cheat-emoji">{CHEAT_PRESETS.slice().reverse().find((p) => extra >= p.kcal)?.emoji ?? "🍟"}</div>
          <div className="muted" style={{ fontSize: 14 }}>
            {fmt(day, "EEEE, d MMMM")}
          </div>
          <div className="cheat-big num">
            +<NumberTicker value={extra} duration={0.3} /> <span>ккал</span>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            в этот день можно съесть {fmtNum(cheatBase.calories + extra)} ккал
          </div>
        </div>

        <div className="group-label">День</div>
        <div className="chips-row" style={{ padding: "4px 0 0", margin: "0 -16px", paddingLeft: 16, paddingRight: 16 }}>
          {days14.map((d) => (
            <Tap
              key={d}
              className={`cheat-day ${d === day ? "on" : ""}`}
              onClick={() => {
                haptic.select();
                setDay(d);
              }}
            >
              <span>{fmt(d, "EEEEEE")}</span>
              <b className="num">{fmt(d, "d")}</b>
              {targets.plans.some((p) => p.day === d && p.id !== plan?.id) && <i>🍕</i>}
            </Tap>
          ))}
        </div>

        <div className="group-label">Сколько сверху</div>
        <input
          type="range"
          className="cheat-range"
          min={200}
          max={2000}
          step={50}
          value={extra}
          style={{ ["--p" as string]: `${((extra - 200) / 1800) * 100}%` }}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v !== extra) haptic.select();
            setExtra(v);
          }}
        />
        <div className="chips-row" style={{ padding: "10px 0 0" }}>
          {CHEAT_PRESETS.map((p) => (
            <Tap
              key={p.kcal}
              className={`chip ${extra === p.kcal ? "on" : ""}`}
              onClick={() => {
                haptic.select();
                setExtra(p.kcal);
                if (!title) setTitle(p.title);
              }}
            >
              {p.emoji} {p.title} +{p.kcal}
            </Tap>
          ))}
        </div>

        <div className="group-label">Откуда взять калории</div>
        <div className="row" style={{ gap: 8 }}>
          <Tap
            className={`chip ${effMode === "before" ? "on" : ""}`}
            disabled={beforeAvail < 1}
            onClick={() => {
              haptic.select();
              setMode("before");
            }}
          >
            Съесть меньше до
          </Tap>
          <Tap
            className={`chip ${effMode === "after" ? "on" : ""}`}
            onClick={() => {
              haptic.select();
              setMode("after");
            }}
          >
            Отбить после
          </Tap>
        </div>
        <div className="chips-row" style={{ padding: "10px 0 0" }}>
          {Array.from({ length: maxSpread }, (_, i) => i + 1).map((n) => (
            <Tap
              key={n}
              className={`chip ${effSpread === n ? "on" : ""}`}
              onClick={() => {
                haptic.select();
                setSpread(n);
              }}
            >
              {n} {n === 1 ? "день" : n < 5 ? "дня" : "дней"}
            </Tap>
          ))}
        </div>

        <div className="card cheat-preview">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div className="card-title">Как изменятся нормы</div>
            <span className="faint" style={{ fontSize: 12 }}>
              ккал в день
            </span>
          </div>
          <div className="cheat-bars">
            {bars.map((b) => (
              <div key={b.d} className={`cheat-bar ${b.cheat ? "is-cheat" : ""}`}>
                <div className="num cheat-bar-v">{fmtNum(b.now)}</div>
                <div className="cheat-bar-track">
                  <div className="cheat-bar-base" style={{ height: `${(b.base / top) * 100}%` }} />
                  <div className="cheat-bar-now" style={{ height: `${(b.now / top) * 100}%` }} />
                </div>
                <div className="cheat-bar-l">{b.cheat ? "🍕" : fmt(b.d, "EEEEEE")}</div>
                <div className="faint num" style={{ fontSize: 11 }}>
                  {fmt(b.d, "d.MM")}
                </div>
              </div>
            ))}
          </div>
          <div className="cheat-summary">
            <span>
              {effMode === "before" ? "До читмила" : "После читмила"}: <b className="num">−{fmtNum(perDay)}</b> ккал/день
            </span>
            <span style={{ color: tooHard ? "var(--fat)" : "var(--good)" }}>{tooHard ? "⚠︎ резковато" : "✓ неделя в балансе"}</span>
          </div>
          {tooHard && (
            <div className="faint" style={{ fontSize: 13, marginTop: 8 }}>
              Урезаем больше 25% нормы — лучше растянуть на большее число дней или взять поменьше.
            </div>
          )}
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>Повод (необязательно)</label>
          <input className="input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="День рождения, суши с друзьями…" />
        </div>
      </div>
      <div className="sheet-foot row">
        {plan && (
          <Tap
            className="icon-btn btn-danger"
            style={{ width: 54, height: 54 }}
            onClick={async () => {
              if (!(await confirmDialog("Отменить читмил? Нормы вернутся к обычным."))) return;
              haptic.rigid();
              del.mutate(plan.id);
              toast("Читмил отменён");
              layer.close();
            }}
          >
            <Trash size={20} />
          </Tap>
        )}
        <Tap className="btn btn-block cheat-btn" disabled={save.isPending} onClick={submit}>
          {plan ? "Сохранить" : "Запланировать"} 🍕
        </Tap>
      </div>
    </>
  );
}
