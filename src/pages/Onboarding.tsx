import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile, useSaveGoal, useSaveSettings, useSaveTargets, useSaveWeight } from "@/data/api";
import { fmt, shiftKey, todayKey } from "@/lib/dates";
import { ACTIVITY, RATES, caloriesFor, etaDays, fmtKg, macrosFor, tdeeFrom } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { GoalKind, Sex } from "@/lib/types";
import { Logo } from "@/ui/Logo";
import { Ruler } from "@/ui/Ruler";
import { NumberTicker } from "@/ui/NumberTicker";
import { KindPicker, OptionCard, RatePicker } from "@/ui/GoalParts";
import { Rings } from "@/ui/Rings";
import { Tap } from "@/ui/Tap";
import "./onboarding.css";
import { visual } from "@/ui/Icon3D";

type Step = "hello" | "sex" | "age" | "height" | "weight" | "activity" | "goal" | "target" | "rate" | "result";

export function Onboarding({ onDone }: { onDone: () => void }) {
  const profile = useProfile();
  const qc = useQueryClient();
  const saveSettings = useSaveSettings();
  const saveWeight = useSaveWeight();
  const saveGoal = useSaveGoal();
  const saveTargets = useSaveTargets();

  const [step, setStep] = useState<Step>("hello");
  const [dir, setDir] = useState(1);
  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState(28);
  const [height, setHeight] = useState(175);
  const [weight, setWeight] = useState(80);
  const [activity, setActivity] = useState(1.375);
  const [kind, setKindRaw] = useState<GoalKind>("lose");
  const minor = age < 18;
  // До 18 лет — только поддержание веса
  const setKind = (k: GoalKind) => setKindRaw(minor ? "maintain" : k);
  useEffect(() => {
    if (minor && kind !== "maintain") setKindRaw("maintain");
  }, [minor, kind]);
  const [target, setTarget] = useState(72);
  const [pct, setPct] = useState(0.5);
  const [saving, setSaving] = useState(false);

  const steps: Step[] = ["hello", "sex", "age", "height", "weight", "activity", "goal", ...(kind === "maintain" ? [] : (["target", "rate"] as Step[])), "result"];
  const idx = steps.indexOf(step);
  const progress = idx / (steps.length - 1);

  const tdee = tdeeFrom(sex, weight, height, age, activity);
  const rate = kind === "maintain" ? 0 : ((kind === "lose" ? -1 : 1) * weight * pct) / 100;
  const calories = caloriesFor(tdee, rate, sex);
  const macros = macrosFor(calories, weight, kind, height);
  const eta = etaDays(weight, kind === "maintain" ? null : target, rate);
  const targetOk = kind === "maintain" || (kind === "lose" ? target < weight : target > weight);

  const go = (d: 1 | -1) => {
    const next = steps[idx + d];
    if (!next) return;
    haptic.tap();
    setDir(d);
    if (next === "target" && d === 1 && !targetOk) setTarget(Math.round(kind === "lose" ? weight * 0.9 : weight * 1.08));
    if (next === "rate" && d === 1) setPct(RATES[kind as "lose" | "gain"][1].pct);
    setStep(next);
  };

  const finish = async () => {
    setSaving(true);
    haptic.success();
    try {
      const today = todayKey();
      await saveWeight.mutateAsync({ day: today, weight_kg: weight, body_fat: null });
      await saveGoal.mutateAsync({
        kind,
        start_date: today,
        start_weight: weight,
        target_weight: kind === "maintain" ? null : target,
        rate_kg_week: Math.round(rate * 100) / 100,
      });
      await saveTargets.mutateAsync({ start_date: today, calories, ...macros, tdee });
      await saveSettings.mutateAsync({
        sex,
        birth_date: shiftKey(today, -Math.round(age * 365.25)),
        height_cm: height,
        activity,
        onboarded: true,
      });
      await qc.invalidateQueries();
      onDone();
    } catch (e) {
      haptic.error();
      setSaving(false);
      alert(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  };

  const name = profile.data?.first_name;

  const content: Record<Step, { title: string; sub?: string; body: React.ReactNode; cta?: string; disabled?: boolean }> = {
    hello: {
      title: name ? `Привет, ${name}!` : "Привет!",
      sub: "Emli поможет питаться осознанно и дойти до цели. Ответь на пару вопросов — рассчитаю твою норму калорий и БЖУ.",
      body: (
        <div style={{ display: "grid", placeItems: "center", padding: "30px 0" }}>
          <Logo size={140} animated />
        </div>
      ),
      cta: "Начнём",
    },
    sex: {
      title: "Твой пол",
      sub: "Влияет на расчёт обмена веществ",
      body: (
        <div className="stack" style={{ gap: 10 }}>
          <OptionCard on={sex === "male"} onClick={() => setSex("male")} emoji="👨" title="Мужчина" />
          <OptionCard on={sex === "female"} onClick={() => setSex("female")} emoji="👩" title="Женщина" />
        </div>
      ),
    },
    age: {
      title: "Сколько тебе лет?",
      body: <Picker value={age} unit={plural(age, "год", "года", "лет")} digits={0} ruler={<Ruler min={14} max={90} step={1} value={age} onChange={setAge} majorEvery={5} />} />,
    },
    height: {
      title: "Твой рост",
      body: <Picker value={height} unit="см" digits={0} ruler={<Ruler min={130} max={220} step={1} value={height} onChange={setHeight} majorEvery={10} />} />,
    },
    weight: {
      title: "Сколько весишь сейчас?",
      sub: "Лучше утром, натощак. Потом будешь уточнять в приложении",
      body: (
        <Picker
          value={weight}
          unit="кг"
          digits={1}
          ruler={<Ruler min={35} max={250} step={0.1} value={weight} onChange={setWeight} majorEvery={10} color="var(--weight)" />}
        />
      ),
    },
    activity: {
      title: "Насколько ты активен?",
      sub: "Считай обычную неделю, без учёта редких исключений",
      body: (
        <div className="stack" style={{ gap: 10 }}>
          {ACTIVITY.map((a) => (
            <OptionCard key={a.v} on={activity === a.v} onClick={() => setActivity(a.v)} title={a.title} desc={a.desc} />
          ))}
        </div>
      ),
    },
    goal: {
      title: "Какая цель?",
      body: (
        <>
          {minor ? (
            <div className="ob-note">
              До 18 лет организм растёт, и урезать или добавлять калории по формулам взрослых нельзя. Emli поможет следить за питанием и держать
              вес стабильным, а менять его — только вместе с врачом.
            </div>
          ) : (
            <KindPicker value={kind} onChange={setKind} />
          )}
          <div className="ob-note faint" style={{ marginTop: 14, fontSize: 12.5 }}>
            Расчёты Emli рассчитаны на здоровых взрослых. При беременности, кормлении грудью, болезнях почек, диабете и других состояниях,
            где нужен особый рацион, сначала посоветуйся с врачом.
          </div>
        </>
      ),
    },
    target: {
      title: "Желаемый вес",
      sub: `Сейчас ${fmtKg(weight)} кг`,
      body: (
        <>
          <Picker
            value={target}
            unit="кг"
            digits={1}
            ruler={<Ruler min={35} max={200} step={0.5} value={target} onChange={setTarget} majorEvery={10} color="var(--good)" />}
          />
          <div style={{ textAlign: "center", marginTop: 16, fontSize: 15, color: targetOk ? "var(--text-2)" : "var(--danger)" }}>
            {targetOk
              ? `${kind === "lose" ? "−" : "+"}${fmtKg(Math.abs(target - weight))} кг (${Math.round((Math.abs(target - weight) / weight) * 100)}%)`
              : kind === "lose"
                ? "Цель должна быть меньше текущего веса"
                : "Цель должна быть больше текущего веса"}
          </div>
        </>
      ),
      disabled: !targetOk,
    },
    rate: {
      title: "В каком темпе?",
      sub: "Можно поменять в любой момент",
      body: kind === "maintain" ? null : <RatePicker kind={kind} weight={weight} pct={pct} onChange={setPct} />,
    },
    result: {
      title: "Твой план готов",
      sub: kind === "maintain" ? "Будем держать вес стабильным" : eta ? `Цель ${fmtKg(target)} кг — примерно к ${fmt(shiftKey(todayKey(), eta), "d MMMM yyyy")}` : undefined,
      body: <Result calories={calories} macros={macros} tdee={tdee} />,
      cta: saving ? "Сохраняю…" : "Поехали!",
      disabled: saving,
    },
  };

  const c = content[step];

  return (
    <div
      className={`ob ${step === "hello" ? "ob-hello" : ""}`}
      style={step === "hello" ? { ["--ob-bg" as string]: `url(${visual("backgrounds", "nutrition")})` } : undefined}
    >
      <div className="ob-top">
        <Tap className="icon-btn" style={{ visibility: idx > 0 ? "visible" : "hidden", width: 40, height: 40 }} onClick={() => go(-1)}>
          <ChevronLeft size={22} />
        </Tap>
        <div className="ob-progress">
          <motion.div animate={{ scaleX: progress }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="ob-stage">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div
            key={step}
            className="ob-step"
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d > 0 ? 60 : -60, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d > 0 ? -60 : 60, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <h1 className="ob-title">{c.title}</h1>
            {c.sub && <p className="ob-sub">{c.sub}</p>}
            <div className="ob-body">{c.body}</div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="ob-foot">
        <Tap className="btn btn-accent btn-block" disabled={c.disabled} onClick={() => (step === "result" ? finish() : go(1))}>
          {c.cta ?? "Дальше"}
        </Tap>
      </div>
    </div>
  );
}

function Picker({ value, unit, digits, ruler }: { value: number; unit: string; digits: number; ruler: React.ReactNode }) {
  return (
    <div style={{ paddingTop: 30 }}>
      <div className="big-value" style={{ fontSize: 64, textAlign: "center", fontWeight: 800, letterSpacing: "-0.03em" }}>
        <NumberTicker value={value} digits={digits} duration={0.2} />
        <small style={{ fontSize: 22, color: "var(--text-2)", marginLeft: 8, fontWeight: 600 }}>{unit}</small>
      </div>
      <div style={{ margin: "30px -24px 0" }}>{ruler}</div>
    </div>
  );
}

function Result({ calories, macros, tdee }: { calories: number; macros: { protein: number; fat: number; carbs: number }; tdee: number }) {
  const rows = [
    { l: "Белки", v: macros.protein, c: "var(--protein)" },
    { l: "Жиры", v: macros.fat, c: "var(--fat)" },
    { l: "Углеводы", v: macros.carbs, c: "var(--carbs)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16 }}>
      <Rings
        size={236}
        stroke={11}
        gap={4}
        delay={0.2}
        rings={[
          { value: 1, max: 1, color: "var(--kcal)", color2: "var(--kcal-2)" },
          { value: 1, max: 1, color: "var(--protein)" },
          { value: 1, max: 1, color: "var(--fat)" },
          { value: 1, max: 1, color: "var(--carbs)" },
        ]}
      >
        <div>
          <div className="num" style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em" }}>
            <NumberTicker value={calories} duration={1.4} />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            ккал в день
          </div>
        </div>
      </Rings>
      <div className="kv" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, width: "100%", marginTop: 24 }}>
        {rows.map((r, i) => (
          <motion.div
            key={r.l}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + i * 0.1 }}
            style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 12, textAlign: "center" }}
          >
            <div className="num" style={{ fontSize: 22, fontWeight: 800, color: r.c }}>
              <NumberTicker value={r.v} duration={1.2} />
              <span style={{ fontSize: 13, marginLeft: 2 }}>г</span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {r.l}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="faint" style={{ fontSize: 13, marginTop: 14, textAlign: "center" }}>
        Твой расход ≈ {tdee.toLocaleString("ru-RU")} ккал. Emli будет уточнять его по твоим записям.
      </div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
