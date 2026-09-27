import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, Minus, Plus, Sparkles, WifiOff } from "lucide-react";
import { useLayer } from "@/nav/Nav";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { Icon3D, MEAL_ICON, type Icon3DName } from "@/ui/Icon3D";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { Segmented } from "@/ui/Segmented";
import { haptic } from "@/lib/telegram";
import { fmt, fromKey, shiftKey, todayKey } from "@/lib/dates";
import { MEALS, fmtNum } from "@/lib/nutrition";
import { EXCLUDE, STYLES, mealsShare, type CookMode, type PlanPrefs } from "@/lib/mealplan";
import type { Meal } from "@/lib/types";
import { useDayTargets } from "@/data/api";
import { useCreatePlan, useDishes, useMyPlans, type MealPlan } from "@/data/mealplan";
import { candidates, generate } from "@/data/planGen";
import "./mealplan.css";

const COOK: { id: CookMode; icon: string; title: string; desc: string }[] = [
  { id: "daily", icon: "🔥", title: "Каждый день", desc: "Всё свежее, остатки ужина — на обед" },
  { id: "every2", icon: "🍲", title: "Через день", desc: "Одно блюдо на 2 дня" },
  { id: "batch", icon: "📦", title: "Заготовки", desc: "2–3 раза в неделю, блюдо на 2–3 дня" },
];
const WISH_CHIPS = ["Люблю курицу", "Не люблю рыбу", "Без супов", "Больше овощей", "В пятницу ужин в гостях", "Дома есть гречка"];

export function defaultPrefs(last?: PlanPrefs | null): PlanPrefs {
  return {
    days: last?.days ?? 7,
    start: todayKey(),
    meals: last?.meals ?? [0, 1, 2, 3],
    people: last?.people ?? 1,
    cook: last?.cook ?? "every2",
    time: last?.time ?? 30,
    exclude: last?.exclude ?? [],
    style: last?.style ?? [],
    wishes: "",
  };
}

/** Норма на день плана для ИИ и порций */
export function useGoal() {
  const t = useDayTargets();
  return (day: string) => {
    const d = t.forDay(day);
    return { kcal: d.calories, protein: d.protein };
  };
}

type Stage = 0 | 1 | 2 | "building" | "error";

export function PlanSetupSheet({ onDone }: { onDone: (plan: MealPlan) => void }) {
  const layer = useLayer();
  const plans = useMyPlans();
  const last = plans.data?.[0]?.prefs;
  const [prefs, setPrefs] = useState<PlanPrefs>(() => defaultPrefs(last));
  const touched = useRef(false);
  // Настройки прошлого плана подтянулись позже — подставляем, пока человек ничего не трогал
  useEffect(() => {
    if (last && !touched.current) setPrefs(defaultPrefs(last));
  }, [last]);
  const set = (patch: Partial<PlanPrefs>) => {
    touched.current = true;
    setPrefs((p) => ({ ...p, ...patch }));
  };
  const [stage, setStage] = useState<Stage>(0);
  const [dir, setDir] = useState(1);
  const [err, setErr] = useState<string>("");
  const { map: dishes } = useDishes();
  const goal = useGoal();
  const create = useCreatePlan();
  const run = useRef(0);
  const [done, setDone] = useState(false);
  // Готовое меню, которое не удалось сохранить — повторяем только сохранение, без нового запроса к ИИ
  const ready = useRef<Awaited<ReturnType<typeof generate>> | null>(null);

  const days = useMemo(() => Array.from({ length: prefs.days }, (_, i) => shiftKey(prefs.start, i)), [prefs.days, prefs.start]);
  const share = mealsShare(prefs.meals);
  const avg = days.reduce((a, d) => a + goal(d).kcal, 0) / Math.max(days.length, 1);
  const avgP = days.reduce((a, d) => a + goal(d).protein, 0) / Math.max(days.length, 1);
  const pool = dishes ? candidates(dishes, prefs).length : 0;

  const go = (s: Stage) => {
    ready.current = null;
    haptic.select();
    setDir(typeof s === "number" && typeof stage === "number" && s < stage ? -1 : 1);
    setStage(s);
  };

  const build = async (offline = false) => {
    if (!dishes) return;
    const my = ++run.current;
    setStage("building");
    setDone(false);
    try {
      const res = ready.current ?? (await generate({ prefs, days, dishes, goal }, offline));
      if (my !== run.current) return;
      ready.current = res;
      const plan = await create.mutateAsync({ start_day: prefs.start, days: prefs.days, prefs: { ...prefs, skips: res.skips }, items: res.items, note: res.note }).catch(() => {
        throw new Error("save");
      });
      ready.current = null;
      if (my !== run.current) return;
      setDone(true);
      haptic.success();
      setTimeout(() => {
        layer.close();
        onDone(plan);
      }, 900);
    } catch (e) {
      if (my !== run.current) return;
      haptic.error();
      setErr(e instanceof Error ? e.message : "failed");
      setStage("error");
    }
  };
  useEffect(() => () => void run.current++, []);

  const starts = useMemo(() => {
    const t = todayKey();
    const out = [
      { day: t, label: "Сегодня" },
      { day: shiftKey(t, 1), label: "Завтра" },
    ];
    const dow = fromKey(t).getDay();
    const toMon = dow === 1 ? 7 : (8 - dow) % 7;
    if (toMon > 1) out.push({ day: shiftKey(t, toMon), label: `С пн, ${fmt(shiftKey(t, toMon), "d MMM")}` });
    return out;
  }, []);

  const step = typeof stage === "number" ? stage : null;
  const canNext = step === 0 ? prefs.meals.length > 0 : true;

  return (
    <>
      <SheetHeader
        title={step !== null ? "Новый план питания" : stage === "error" ? "План питания" : ""}
        left={
          step && step > 0 ? (
            <button className="icon-btn" onClick={() => go((step - 1) as Stage)} aria-label="Назад">
              <ChevronLeft size={20} />
            </button>
          ) : undefined
        }
      />
      {step !== null && (
        <div className="mp-steps" aria-hidden>
          {[0, 1, 2].map((i) => (
            <i key={i} className={i <= step ? "on" : ""} />
          ))}
        </div>
      )}
      <div className="sheet-body mp-setup">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          {step === 0 && (
            <Slide key="s0" dir={dir}>
              <StepHead icon="calendar" title="На сколько дней?" sub="Составлю меню, посчитаю порции под твою норму и соберу список покупок" />
              <div className="mp-days">
                {[3, 5, 7].map((n) => (
                  <Tap key={n} className={`mp-daycard ${prefs.days === n ? "on" : ""}`} onClick={() => (haptic.select(), set({ days: n }))}>
                    <b className="num">{n}</b>
                    <span>{n === 7 ? "дней · неделя" : n === 5 ? "дней · будни" : "дня · попробовать"}</span>
                  </Tap>
                ))}
              </div>
              <div className="mp-label">Начинаем</div>
              <div className="chips-row">
                {starts.map((s) => (
                  <Tap key={s.day} className={`chip ${prefs.start === s.day ? "on" : ""}`} onClick={() => (haptic.select(), set({ start: s.day }))}>
                    {s.label}
                  </Tap>
                ))}
              </div>
              <div className="mp-label">Какие приёмы планируем</div>
              <div className="mp-meals">
                {MEALS.map((m) => {
                  const id = m.id as Meal;
                  const on = prefs.meals.includes(id);
                  return (
                    <Tap
                      key={id}
                      className={`mp-meal ${on ? "on" : ""}`}
                      onClick={() => {
                        haptic.select();
                        set({ meals: on ? prefs.meals.filter((x) => x !== id) : [...prefs.meals, id].sort() });
                      }}
                    >
                      <Icon3D name={MEAL_ICON[id]} size={40} />
                      <span>{m.name}</span>
                      <i className="mp-check">{on && <Check size={13} strokeWidth={3} />}</i>
                    </Tap>
                  );
                })}
              </div>
              {prefs.meals.length > 0 && prefs.meals.length < 4 && (
                <div className="mp-hint">
                  Остальные приёмы — сам. План займёт ≈ {Math.round(share * 100)}% дневной нормы
                </div>
              )}
            </Slide>
          )}
          {step === 1 && (
            <Slide key="s1" dir={dir}>
              <StepHead icon="main-dishes" title="Как ты готовишь?" sub="Подстрою меню под твой ритм — чтобы не стоять у плиты каждый день" />
              <div className="stack" style={{ gap: 8 }}>
                {COOK.map((c) => (
                  <Tap key={c.id} className={`mp-option ${prefs.cook === c.id ? "on" : ""}`} scale={0.98} onClick={() => (haptic.select(), set({ cook: c.id }))}>
                    <span className="mp-option-ico">{c.icon}</span>
                    <span className="mp-option-text">
                      <b>{c.title}</b>
                      <small>{c.desc}</small>
                    </span>
                    <i className="mp-radio" />
                  </Tap>
                ))}
              </div>
              <div className="mp-label">Время у плиты в будни</div>
              <Segmented
                options={[
                  { value: 15, label: "15 мин" },
                  { value: 30, label: "30 мин" },
                  { value: 60, label: "час" },
                  { value: 0, label: "не важно" },
                ]}
                value={prefs.time}
                onChange={(v) => set({ time: v })}
              />
              <div className="mp-label">На сколько человек готовим</div>
              <div className="mp-people">
                <Tap className="icon-btn" disabled={prefs.people <= 1} onClick={() => (haptic.select(), set({ people: Math.max(1, prefs.people - 1) }))} aria-label="Меньше">
                  <Minus size={18} />
                </Tap>
                <div className="mp-people-mid">
                  <div className="mp-people-row">
                    <AnimatePresence initial={false}>
                      {Array.from({ length: prefs.people }, (_, i) => (
                        <motion.span key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="mp-person">
                          {i === 0 ? "🙂" : ["🧑", "👩", "🧒", "👧", "👴"][(i - 1) % 5]}
                        </motion.span>
                      ))}
                    </AnimatePresence>
                  </div>
                  <b>{prefs.people === 1 ? "Только я" : `${prefs.people} человека`.replace("5 человека", "5 человек").replace("6 человека", "6 человек")}</b>
                </div>
                <Tap className="icon-btn" disabled={prefs.people >= 6} onClick={() => (haptic.select(), set({ people: Math.min(6, prefs.people + 1) }))} aria-label="Больше">
                  <Plus size={18} />
                </Tap>
              </div>
              {prefs.people > 1 && (
                <div className="mp-hint">Порции в плане — под твою норму, остальным — по обычной порции. Список покупок — на всех</div>
              )}
            </Slide>
          )}
          {step === 2 && (
            <Slide key="s2" dir={dir}>
              <StepHead icon="favorite-foods" title="Что учесть?" sub="Ограничения соблюдаю строго, пожелания — как главный ориентир" />
              <div className="mp-label">Не ешь</div>
              <div className="mp-chips">
                {EXCLUDE.map((e) => {
                  const on = prefs.exclude.includes(e.id);
                  return (
                    <Tap
                      key={e.id}
                      className={`chip ${on ? "on" : ""}`}
                      onClick={() => (haptic.select(), set({ exclude: on ? prefs.exclude.filter((x) => x !== e.id) : [...prefs.exclude, e.id] }))}
                    >
                      {e.label}
                    </Tap>
                  );
                })}
              </div>
              <div className="mp-label">Стиль меню</div>
              <div className="mp-chips">
                {STYLES.map((s) => {
                  const on = prefs.style.includes(s.id);
                  return (
                    <Tap
                      key={s.id}
                      className={`chip ${on ? "on" : ""}`}
                      onClick={() => (haptic.select(), set({ style: on ? prefs.style.filter((x) => x !== s.id) : [...prefs.style, s.id] }))}
                    >
                      {s.label}
                    </Tap>
                  );
                })}
              </div>
              <div className="mp-label">Пожелания своими словами</div>
              <AutoTextarea
                className="input mp-wishes"
                placeholder="Например: люблю курицу и творог, в пятницу ужин в гостях, дома есть гречка и рис"
                value={prefs.wishes}
                maxLength={400}
                onChange={(e) => set({ wishes: e.target.value })}
              />
              <div className="chips-row" style={{ marginTop: 8 }}>
                {WISH_CHIPS.map((w) => (
                  <Tap
                    key={w}
                    className="chip mp-wish-chip"
                    onClick={() => {
                      haptic.select();
                      set({ wishes: prefs.wishes.trim() ? `${prefs.wishes.trim().replace(/[.,]$/, "")}, ${w.toLowerCase()}` : w });
                    }}
                  >
                    + {w}
                  </Tap>
                ))}
              </div>
              {dishes && pool < 12 && (
                <div className="mp-hint warn">Под такие ограничения подходит всего {pool} блюд — меню может повторяться. Добавь свои рецепты или ослабь фильтры</div>
              )}
            </Slide>
          )}
          {stage === "building" && (
            <motion.div key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PlanBuilding done={done} days={prefs.days} />
            </motion.div>
          )}
          {stage === "error" && (
            <motion.div key="e" className="mp-error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="mp-error-ico">{err === "network" ? <WifiOff size={30} /> : "😕"}</div>
              <b>
                {err === "limit"
                  ? "На сегодня лимит планов исчерпан"
                  : err === "network"
                    ? "Нет связи"
                    : err === "few_dishes"
                      ? "Слишком мало подходящих блюд"
                      : err === "save"
                        ? "Меню готово, но не сохранилось"
                        : "ИИ сейчас не ответил"}
              </b>
              <p>
                {err === "few_dishes"
                  ? "Ослабь ограничения или добавь свои рецепты."
                  : err === "save"
                    ? "Проверь интернет и попробуй сохранить ещё раз — меню не потеряется."
                  : "Могу составить план сам — по калориям, приёмам и разнообразию, но без учёта пожеланий текстом."}
              </p>
              {err !== "few_dishes" && err !== "limit" && (
                <Tap className="btn btn-accent btn-block" onClick={() => build(false)}>
                  <Sparkles size={18} /> {err === "save" ? "Сохранить ещё раз" : "Попробовать ещё раз"}
                </Tap>
              )}
              {err !== "few_dishes" && err !== "save" && (
                <Tap className="btn btn-block" style={{ marginTop: 8 }} onClick={() => build(true)}>
                  Составить без ИИ
                </Tap>
              )}
              <Tap className="btn btn-block" style={{ marginTop: 8, background: "transparent" }} onClick={() => go(2)}>
                Изменить настройки
              </Tap>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {step !== null && (
        <div className="sheet-foot mp-foot">
          <div className="mp-summary">
            <span>
              {prefs.days} {prefs.days === 7 ? "дней" : prefs.days === 5 ? "дней" : "дня"} · с {fmt(prefs.start, "d MMM")}
            </span>
            <span className="num">
              ≈ {fmtNum(Math.round((avg * share) / 10) * 10)} ккал · белок {fmtNum(Math.round(avgP * share))} г в день
            </span>
          </div>
          {step < 2 ? (
            <Tap className="btn btn-primary btn-block" disabled={!canNext} onClick={() => go((step + 1) as Stage)}>
              Дальше
            </Tap>
          ) : (
            <Tap className="btn btn-accent btn-block mp-go" disabled={!dishes || pool < 3} onClick={() => (haptic.medium(), build(false))}>
              <Sparkles size={18} /> Составить план
            </Tap>
          )}
        </div>
      )}
    </>
  );
}

function Slide({ children, dir }: { children: React.ReactNode; dir: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 * dir }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 * dir }}
      transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

function StepHead({ icon, title, sub }: { icon: Icon3DName; title: string; sub: string }) {
  return (
    <div className="mp-stephead">
      <motion.span initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}>
        <Icon3D name={icon} size={64} />
      </motion.span>
      <div>
        <h3>{title}</h3>
        <p>{sub}</p>
      </div>
    </div>
  );
}

const ORBIT: Icon3DName[] = ["breakfast", "salads", "soup", "main-dishes", "side-dishes", "snacks"];
const STEPS = ["Подбираю блюда под твои вкусы", "Раскладываю по дням и заготовкам", "Подгоняю порции под норму", "Собираю список покупок"];

/** Экран сборки плана: иконки блюд кружатся вокруг плана, шаги отмечаются по очереди */
export function PlanBuilding({ done, days, title = "Составляю план" }: { done: boolean; days?: number; title?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (done) return setN(STEPS.length);
    // Последний шаг ждёт ответа: ИИ думает 5–15 секунд
    const t = setInterval(() => setN((x) => Math.min(x + 1, STEPS.length - 1)), 2600);
    return () => clearInterval(t);
  }, [done]);
  return (
    <div className="mp-build">
      <div className="mp-orbit">
        <motion.div className="mp-orbit-ring" animate={{ rotate: 360 }} transition={{ duration: 14, ease: "linear", repeat: Infinity }}>
          {ORBIT.map((ic, i) => (
            <span key={ic} className="mp-orbit-item" style={{ ["--a" as string]: `${(360 / ORBIT.length) * i}deg` }}>
              <motion.span animate={{ rotate: -360 }} transition={{ duration: 14, ease: "linear", repeat: Infinity }} style={{ display: "block" }}>
                <Icon3D name={ic} size={38} />
              </motion.span>
            </span>
          ))}
        </motion.div>
        <motion.div
          className="mp-orbit-core"
          animate={done ? { scale: [1, 1.18, 1] } : { scale: [1, 1.06, 1] }}
          transition={done ? { duration: 0.6 } : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Icon3D name="meal-plan" size={78} />
          <AnimatePresence>
            {done && (
              <motion.i className="mp-orbit-done" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 14 }}>
                <Check size={18} strokeWidth={3} />
              </motion.i>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
      <h3 className="mp-build-title">{done ? "План готов!" : title}</h3>
      <p className="mp-build-sub">{done ? "Открываю меню…" : days ? `Меню на ${days} ${days === 7 || days === 5 ? "дней" : "дня"} — обычно 10–20 секунд` : "Обычно 10–20 секунд"}</p>
      <div className="mp-build-steps">
        {STEPS.map((s, i) => (
          <motion.div
            key={s}
            className={`mp-build-step ${i < n ? "ok" : i === n ? "now" : ""}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: i <= n ? 1 : 0.35, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <i>{i < n ? <Check size={13} strokeWidth={3} /> : i === n ? <span className="mp-spin" /> : null}</i>
            {s}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
