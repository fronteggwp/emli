import { Pencil, Sparkles } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useInsights } from "@/data/insights";
import { useGoalHistory, useSaveTargets, useSettings } from "@/data/api";
import { fmt, shiftKey, todayKey } from "@/lib/dates";
import { caloriesFor, fmtKg, fmtNum, macrosFor } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { Rings } from "@/ui/Rings";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { EditGoalSheet } from "@/sheets/EditGoal";
import { EditProgramSheet } from "@/sheets/EditProgram";
import "./stats.css";

const KIND_TITLE = { lose: "Снижение веса", maintain: "Поддержание", gain: "Набор массы" } as const;

export function GoalScreen() {
  const nav = useNav();
  const ins = useInsights();
  const settings = useSettings();
  const history = useGoalHistory();
  const saveTargets = useSaveTargets();
  const toast = useToast();
  const g = ins.goal;
  const t = ins.target;

  const sex = settings.data?.sex ?? "male";
  const rec =
    g && ins.current != null
      ? (() => {
          const calories = caloriesFor(ins.tdee.value, g.rate_kg_week, sex);
          return { calories, ...macrosFor(calories, ins.current, g.kind, settings.data?.height_cm, ins.bodyFat) };
        })()
      : null;
  const recDiff = rec && t ? rec.calories - t.calories : 0;
  const suggest = rec && t && ins.tdee.confidence >= 0.3 && Math.abs(recDiff) >= 50;

  const applyRec = () => {
    if (!rec) return;
    haptic.success();
    saveTargets.mutate({ start_date: todayKey(), ...rec, tdee: ins.tdee.value });
    toast("Программа обновлена");
  };

  const pct = Math.round((ins.progress ?? 0) * 100);
  const left = g?.target_weight != null && ins.current != null ? Math.abs(g.target_weight - ins.current) : null;

  return (
    <Screen title="Цель и программа">
      {g && (
        <div className="card goal-card" style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Rings size={120} stroke={14} rings={[{ value: g.kind === "maintain" ? 1 : (ins.progress ?? 0), max: 1, color: "var(--kcal)", color2: "var(--weight)" }]}>
            <div>
              <div className="num" style={{ fontSize: 24, fontWeight: 800 }}>
                {g.kind === "maintain" ? "✓" : <NumberTicker value={pct} />}
                {g.kind !== "maintain" && <span style={{ fontSize: 14 }}>%</span>}
              </div>
            </div>
          </Rings>
          <div style={{ flex: 1 }}>
            <div className="card-title">{KIND_TITLE[g.kind]}</div>
            {g.kind !== "maintain" && g.target_weight != null ? (
              <>
                <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                  {fmtKg(g.start_weight)} → <b style={{ color: "var(--text)" }}>{fmtKg(g.target_weight)} кг</b>
                </div>
                <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>
                  Осталось {left != null ? fmtKg(left) : "—"} кг
                </div>
                {ins.eta != null && ins.eta > 0 && (
                  <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>
                    ≈ {fmt(shiftKey(todayKey(), ins.eta), "d MMMM yyyy")}
                  </div>
                )}
              </>
            ) : (
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                Держим вес около {ins.current != null ? fmtKg(ins.current) : "—"} кг
              </div>
            )}
            <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
              Темп: {g.rate_kg_week > 0 ? "+" : g.rate_kg_week < 0 ? "−" : ""}
              {fmtKg(Math.abs(g.rate_kg_week))} кг/нед
            </div>
          </div>
        </div>
      )}

      <Tap className="btn btn-block" style={{ marginTop: 12 }} onClick={() => nav.sheet(<EditGoalSheet />, { full: true })}>
        <Pencil size={17} /> Изменить цель
      </Tap>

      <div className="section-title">
        Программа питания
        <button onClick={() => nav.sheet(<EditProgramSheet />)}>Изменить</button>
      </div>
      {t ? (
        <div className="kv" style={{ gridTemplateColumns: "1.3fr 1fr 1fr 1fr" }}>
          <div style={{ background: "linear-gradient(135deg, rgba(124,140,255,.22), rgba(179,136,255,.1))" }}>
            <div className="k">Ккал</div>
            <div className="v num">{fmtNum(t.calories)}</div>
          </div>
          <div>
            <div className="k">Белки</div>
            <div className="v num" style={{ color: "var(--protein)" }}>
              {t.protein}
            </div>
          </div>
          <div>
            <div className="k">Жиры</div>
            <div className="v num" style={{ color: "var(--fat)" }}>
              {t.fat}
            </div>
          </div>
          <div>
            <div className="k">Углев.</div>
            <div className="v num" style={{ color: "var(--carbs)" }}>
              {t.carbs}
            </div>
          </div>
        </div>
      ) : (
        <div className="empty">Программа не задана</div>
      )}
      {t && (
        <div className="faint" style={{ fontSize: 13, margin: "8px 4px 0" }}>
          Действует с {fmt(t.start_date, "d MMMM")}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="icon-btn" style={{ width: 38, height: 38, background: "rgba(124,140,255,.16)", color: "var(--kcal)" }}>
            <Sparkles size={18} />
          </span>
          <div className="card-title">Еженедельная сверка</div>
        </div>
        <p className="explain" style={{ margin: "12px 0 0" }}>
          {ins.tdee.confidence < 0.3 ? (
            <>Пока собираю данные. Записывай еду и вес 1–2 недели — и Emli подстроит программу под твой реальный расход.</>
          ) : suggest ? (
            <>
              Твой расход по данным — <b>{fmtNum(ins.tdee.value)} ккал</b>. Чтобы идти к цели в нужном темпе, лучше{" "}
              {recDiff > 0 ? "увеличить" : "снизить"} калории до <b>{fmtNum(rec!.calories)}</b> ({recDiff > 0 ? "+" : "−"}
              {fmtNum(Math.abs(recDiff))}).
            </>
          ) : (
            <>
              Расход — <b>{fmtNum(ins.tdee.value)} ккал</b>. Программа соответствует цели, менять ничего не нужно 👌
            </>
          )}
        </p>
        {suggest && (
          <Tap className="btn btn-accent btn-block" style={{ marginTop: 14 }} onClick={applyRec}>
            Обновить до {fmtNum(rec!.calories)} ккал
          </Tap>
        )}
      </div>

      {(history.data?.length ?? 0) > 1 && (
        <>
          <div className="section-title">История целей</div>
          <div className="list">
            {history.data!.map((h) => (
              <div key={h.id} className="list-item">
                <span style={{ flex: 1 }}>
                  <div className="li-title">{KIND_TITLE[h.kind]}</div>
                  <div className="li-sub">с {fmt(h.start_date, "d MMMM yyyy")}</div>
                </span>
                <span className="num muted">
                  {fmtKg(h.start_weight)}
                  {h.target_weight != null && h.kind !== "maintain" ? ` → ${fmtKg(h.target_weight)}` : ""} кг
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}
