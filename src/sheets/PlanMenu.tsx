import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { LogOut, Settings2, Sparkles, Trash2, Users } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { useUid } from "@/lib/auth";
import { confirmDialog, haptic } from "@/lib/telegram";
import { fmt, todayKey } from "@/lib/dates";
import { useDeletePlan, useDishes, useRemoveMember, useUpdatePlan, planDays, type MealPlan } from "@/data/mealplan";
import { generate } from "@/data/planGen";
import { PlanBuilding, PlanSetupSheet, useGoal } from "./PlanSetup";
import { PlanShareSheet } from "./PlanShare";
import { MealPlanScreen } from "@/pages/MealPlan";
import "./mealplan.css";

/** Меню «⋯» плана */
export function PlanMenuSheet({ plan, own }: { plan: MealPlan; own: boolean }) {
  const nav = useNav();
  const layer = useLayer();
  const toast = useToast();
  const uid = useUid();
  const del = useDeletePlan();
  const leave = useRemoveMember(plan.id);
  const kept = plan.items.filter((i) => i.eaten || i.locked).length;

  const act = (fn: () => void) => () => {
    haptic.tap();
    layer.close();
    setTimeout(fn, 200);
  };

  if (!own) {
    return (
      <>
        <SheetHeader title="План" />
        <div className="sheet-body">
          <div className="card list" style={{ padding: 0 }}>
            <Tap
              className="list-item"
              style={{ color: "var(--danger)" }}
              onClick={async () => {
                if (!(await confirmDialog("Выйти из общего плана? Меню и список покупок пропадут у тебя."))) return;
                leave.mutate(uid);
                toast("Ты вышел из плана");
                layer.close();
                nav.pop();
              }}
            >
              <LogOut size={19} /> Выйти из плана
            </Tap>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SheetHeader title="План питания" />
      <div className="sheet-body">
        <div className="card list" style={{ padding: 0 }}>
          <Tap className="list-item" onClick={act(() => nav.sheet(<PlanRegenSheet plan={plan} />, { full: true }))}>
            <Sparkles size={19} color="var(--kcal)" />
            <span style={{ flex: 1 }}>
              Пересобрать меню
              <div className="muted" style={{ fontSize: 12.5 }}>
                С сегодняшнего дня{kept ? ` · съеденное и закреплённое (${kept}) останется` : ""}
              </div>
            </span>
          </Tap>
          <Tap className="list-item" onClick={act(() => nav.sheet(<PlanShareSheet plan={plan} own />))}>
            <Users size={19} />
            <span style={{ flex: 1 }}>
              Семья и общий список
              <div className="muted" style={{ fontSize: 12.5 }}>
                Меню и покупки видны тем, кого позовёшь
              </div>
            </span>
          </Tap>
          <Tap
            className="list-item"
            onClick={act(() =>
              nav.sheet(
                <PlanSetupSheet
                  onDone={(p) => {
                    nav.pop();
                    setTimeout(() => nav.push(<MealPlanScreen id={p.id} />), 250);
                  }}
                />,
                { full: true },
              ),
            )}
          >
            <Settings2 size={19} />
            <span style={{ flex: 1 }}>
              Новый план с другими настройками
              <div className="muted" style={{ fontSize: 12.5 }}>
                Текущий уйдёт в «Прошлые планы»
              </div>
            </span>
          </Tap>
          <Tap
            className="list-item"
            style={{ color: "var(--danger)" }}
            onClick={async () => {
              if (!(await confirmDialog("Удалить план? Записи в дневнике останутся."))) return;
              haptic.rigid();
              del.mutate(plan.id);
              toast("План удалён");
              layer.close();
              nav.pop();
            }}
          >
            <Trash2 size={19} /> Удалить план
          </Tap>
        </div>
      </div>
    </>
  );
}

/** Пересборка всего плана (с сегодня) или одного дня — с той же анимацией, что и создание */
export function PlanRegenSheet({ plan, only }: { plan: MealPlan; only?: string[] }) {
  const layer = useLayer();
  const toast = useToast();
  const { map } = useDishes();
  const goal = useGoal();
  const update = useUpdatePlan(plan.id);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  const run = async (offline = false) => {
    if (!map) return;
    setErr(null);
    const today = todayKey();
    const days = planDays(plan);
    const target = only ?? days.filter((d) => d >= today);
    // Остаётся: прошедшие и другие дни, съеденное, закреплённое
    const keep = plan.items.filter((i) => !target.includes(i.day) || i.eaten || i.locked);
    try {
      const res = await generate({ prefs: plan.prefs, days, dishes: map, goal, keep, only: target }, offline);
      await update.mutateAsync({ items: res.items, note: only ? plan.note : res.note ?? plan.note, prefs: { ...plan.prefs, skips: res.skips } });
      setDone(true);
      haptic.success();
      setTimeout(() => {
        layer.close();
        toast(only ? `${fmt(only[0], "EEEE")}: новое меню` : "Меню обновлено");
      }, 800);
    } catch (e) {
      haptic.error();
      setErr(e instanceof Error ? e.message : "failed");
    }
  };
  useEffect(() => {
    if (started.current || !map) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return (
    <>
      <SheetHeader title="" />
      <div className="sheet-body mp-setup">
        {!err ? (
          <PlanBuilding done={done} title={only ? `Пересобираю ${fmt(only[0], "EEEE")}` : "Пересобираю меню"} />
        ) : (
          <motion.div className="mp-error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mp-error-ico">😕</div>
            <b>{err === "limit" ? "Лимит на сегодня исчерпан" : err === "network" ? "Нет связи" : "ИИ сейчас не ответил"}</b>
            <p>Могу пересобрать без ИИ — по калориям и разнообразию.</p>
            {err !== "limit" && (
              <Tap className="btn btn-accent btn-block" onClick={() => run(false)}>
                <Sparkles size={18} /> Ещё раз
              </Tap>
            )}
            <Tap className="btn btn-block" style={{ marginTop: 8 }} onClick={() => run(true)}>
              Пересобрать без ИИ
            </Tap>
          </motion.div>
        )}
      </div>
    </>
  );
}
