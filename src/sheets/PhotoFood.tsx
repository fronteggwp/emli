import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, ChevronLeft, ImagePlus, Minus, PenLine, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { useDay } from "@/state/day";
import { photoToDataUrl, recognizeFood, useLogItems, type AiFoodError, type AiFoodItem, type AiFoodResult, type TemplateItem } from "@/data/engage";
import { MEALS, fmtNum, mealByTime } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { Meal } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { Icon3D } from "@/ui/Icon3D";
import { IngredientPickerSheet } from "./IngredientPicker";
import { dishOfItem, planEnd, useActivePlan, useDishes, useSetMark, useSharedPlans, useShopMarks, type MealPlan } from "@/data/mealplan";
import { shoppingList } from "@/lib/mealplan";
import { todayKey } from "@/lib/dates";
import "./sheets.css";
import "./photo.css";

type Mode = "quick" | "hint" | "receipt";
type Stage = "pick" | "compose" | "analyzing" | "result" | "error";
/** picked — для чека: человек отмечает, что из купленного съел */
type Row = AiFoodItem & { key: string; picked?: boolean };

const STATUSES = ["Смотрю на тарелку…", "Разбираю, что где лежит…", "Оцениваю граммовку…", "Ищу продукты в базе Emli…", "Сверяю КБЖУ…"];
const STATUSES_RECEIPT = ["Читаю чек…", "Расшифровываю сокращения…", "Отбрасываю пакеты и химию…", "Ищу товары в базе…", "Считаю КБЖУ…"];
const ERRORS: Record<AiFoodError | "empty", { icon: string; title: string; text: string }> = {
  empty: { icon: "🤔", title: "Не вижу еды", text: "Попробуй снять тарелку сверху и поближе — или добавь подсказку, что на фото." },
  limit: { icon: "⏳", title: "Лимит на сегодня", text: "Распознавание по фото доступно 40 раз в сутки. Завтра снова можно — а пока добавь еду поиском." },
  bad_image: { icon: "🖼", title: "Не получилось прочитать фото", text: "Попробуй другое фото — лучше обычный снимок с камеры." },
  network: { icon: "📡", title: "Нет связи", text: "Проверь интернет и попробуй ещё раз." },
  failed: { icon: "😵‍💫", title: "ИИ не ответил", text: "Такое бывает — попробуй ещё раз через пару секунд." },
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const scale = (it: AiFoodItem, grams: number): AiFoodItem => {
  const k = grams / 100;
  return { ...it, grams, kcal: Math.round(it.per100[0] * k), protein: r1(it.per100[1] * k), fat: r1(it.per100[2] * k), carbs: r1(it.per100[3] * k) };
};

/** Еда по фото: снимок → ИИ разбирает на продукты → ищет в базе → можно поправить и добавить */
/** «Запечённая Рыба С Лимоном» → «Запечённая рыба с лимоном»; аббревиатуры (КБЖУ) не трогаем */
function sentence(t: string) {
  const w = t.trim().split(/\s+/);
  const titled = w.length > 1 && w.every((x) => /^[А-ЯЁA-Z][а-яёa-z-]*$/.test(x));
  const out = titled ? w.map((x, i) => (i ? x.toLowerCase() : x)).join(" ") : t.trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function PhotoFoodSheet({ meal: meal0, mode: mode0 = "quick" }: { meal?: Meal; mode?: Mode }) {
  const layer = useLayer();
  const nav = useNav();
  const toast = useToast();
  const { day } = useDay();
  const log = useLogItems();
  const [mode, setMode] = useState<Mode>(mode0);
  const isReceipt = mode === "receipt";
  const [stage, setStage] = useState<Stage>("pick");
  const [photo, setPhoto] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [result, setResult] = useState<AiFoodResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<AiFoodError | "empty">("failed");
  const [meal, setMeal] = useState<Meal>(meal0 ?? (mealByTime() as Meal));
  const [refine, setRefine] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  // Чек + меню на неделю: список ещё не купленного — ИИ отметит, что из него куплено по чеку
  const [shop, setShop] = useState<ShopCtx | null>(null);
  const [marked, setMarked] = useState<{ key: string; name: string }[]>([]);
  const setMark = useSetMark(shop?.planId ?? "");

  const analyze = async (image: string, h: string) => {
    const id = ++run.current;
    setStage("analyzing");
    haptic.soft();
    try {
      const r = await recognizeFood(image, h.trim() || undefined, isReceipt ? "receipt" : undefined, isReceipt ? shop?.todo : undefined);
      if (id !== run.current) return;
      if (!r.items.length) {
        setError("empty");
        setStage("error");
        haptic.warning();
        return;
      }
      setResult(r);
      setRows(r.items.map((it, i) => ({ ...it, key: `${id}-${i}`, picked: !isReceipt })));
      // Купленное по чеку — сразу галочкой в списке покупок (общий список видят все участники меню)
      if (isReceipt && shop) {
        const keys = [...new Set(r.items.map((it) => it.shop_key).filter((k): k is string => !!k))];
        const hit = shop.todo.filter((x) => keys.includes(x.key));
        hit.forEach((x) => setMark.mutate({ key: x.key, checked: true }));
        setMarked(hit);
      } else setMarked([]);
      setStage("result");
      setRefine(false);
      haptic.success();
    } catch (e) {
      if (id !== run.current) return;
      setError(((e as Error).message as AiFoodError) || "failed");
      setStage("error");
      haptic.error();
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      // Чек — крупнее: мелкий шрифт кассы на 1024 px не читается
      const img = await photoToDataUrl(f, isReceipt ? 2048 : 1024);
      setPhoto(img);
      if (mode === "hint") setStage("compose");
      else analyze(img, "");
    } catch {
      setError("bad_image");
      setStage("error");
    }
  };

  // Закрыли окно во время анализа — поздний ответ игнорируем
  useEffect(() => () => void (run.current = -1), []);

  // Сменился шаг — окно наверх (иначе после «Пересчитать» остаёмся внизу пустого списка)
  const top = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let el = top.current?.parentElement ?? null;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    el?.scrollTo({ top: 0, behavior: "smooth" });
  }, [stage]);

  const eaten = useMemo(() => rows.filter((r) => r.picked !== false), [rows]);
  const all = useMemo(() => rows.reduce((a, r) => a + r.kcal, 0), [rows]);
  const total = useMemo(
    () => eaten.reduce((a, r) => ({ kcal: a.kcal + r.kcal, protein: a.protein + r.protein, fat: a.fat + r.fat, carbs: a.carbs + r.carbs }), { kcal: 0, protein: 0, fat: 0, carbs: 0 }),
    [eaten],
  );

  const toggle = (key: string) => (haptic.select(), setRows((l) => l.map((r) => (r.key === key ? { ...r, picked: !r.picked } : r))));
  const setGrams = (key: string, g: number) =>
    setRows((l) => l.map((r) => (r.key === key ? { ...scale(r, Math.max(1, Math.min(5000, Math.round(g)))), key, picked: true } : r)));
  const remove = (key: string) => {
    haptic.rigid();
    setRows((l) => l.filter((r) => r.key !== key));
  };
  const addManual = () =>
    nav.sheet(
      <IngredientPickerSheet
        title="Добавить продукт"
        onPick={(it: TemplateItem) => {
          const g = it.grams ?? 100;
          const k = 100 / g;
          setRows((l) => [
            ...l,
            {
              key: `m-${Date.now()}`,
              picked: true,
              name: it.name,
              grams: g,
              confidence: 1,
              source: "food",
              food_id: it.food_id,
              matched: it.name,
              per100: [it.kcal * k, it.protein * k, it.fat * k, it.carbs * k],
              kcal: it.kcal,
              protein: it.protein,
              fat: it.fat,
              carbs: it.carbs,
            },
          ]);
        }}
      />,
      { full: true },
    );

  const save = async () => {
    if (!eaten.length) return;
    try {
      await log.mutateAsync({
        items: eaten.map((r) => ({ food_id: r.food_id, name: sentence(r.name), brand: r.brand ?? null, grams: r.grams, kcal: r.kcal, protein: r.protein, fat: r.fat, carbs: r.carbs })),
        day,
        meal,
      });
      haptic.success();
      toast(`${MEALS[meal].name}: +${fmtNum(total.kcal)} ккал`, <Check size={18} color="var(--good)" />);
      layer.close();
    } catch {
      /* уведомление покажет общий обработчик */
    }
  };

  const reset = () => {
    run.current++;
    setPhoto(null);
    setResult(null);
    setRows([]);
    setStage("pick");
  };

  return (
    <>
      <span ref={top} hidden />
      <SheetHeader
        title={isReceipt ? "Продукты из чека" : "Еда по фото"}
        left={
          stage !== "pick" && stage !== "analyzing" ? (
            <button className="icon-btn" onClick={reset} aria-label="Другое фото">
              <ChevronLeft size={20} />
            </button>
          ) : undefined
        }
      />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />

      {isReceipt && <ReceiptShop onReady={setShop} />}
      <div className="sheet-body pf">
        <AnimatePresence mode="wait" initial={false}>
          {stage === "pick" && (
            <motion.div key="pick" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <div className="pf-kind">
                <Tap className={`pf-kind-opt ${!isReceipt ? "on" : ""}`} onClick={() => (haptic.select(), setMode("quick"))}>
                  🍽 Тарелка
                </Tap>
                <Tap className={`pf-kind-opt ${isReceipt ? "on" : ""}`} onClick={() => (haptic.select(), setMode("receipt"))}>
                  🧾 Чек
                </Tap>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={isReceipt ? "r" : "p"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                  <div className="pf-hero">
                    <div className="pf-orb">
                      <motion.span className="pf-orb-ring" animate={{ rotate: 360 }} transition={{ duration: 14, repeat: Infinity, ease: "linear" }} />
                      {isReceipt ? <span className="pf-orb-emoji">🧾</span> : <Icon3D name="lunch" size={96} />}
                      <motion.span className="pf-spark s1" animate={{ scale: [0.6, 1.1, 0.6], opacity: [0.4, 1, 0.4] }} transition={{ duration: 2.4, repeat: Infinity }}>
                        ✦
                      </motion.span>
                      <motion.span className="pf-spark s2" animate={{ scale: [1, 0.6, 1], opacity: [1, 0.4, 1] }} transition={{ duration: 2.4, repeat: Infinity }}>
                        ✦
                      </motion.span>
                    </div>
                    <div className="pf-title">{isReceipt ? "Сфоткай чек — найду продукты" : "Сфоткай тарелку — посчитаю сам"}</div>
                    <div className="pf-sub">
                      {isReceipt
                        ? "Прочитаю позиции, расшифрую сокращения кассы, найду товары в базе и посчитаю КБЖУ. Останется отметить, что съел"
                        : "Распознаю продукты и граммовку, найду их в базе Emli и сложу КБЖУ"}
                    </div>
                  </div>

                  {!isReceipt && (
                    <div className="pf-modes">
                      <Tap className={`pf-mode ${mode === "quick" ? "on" : ""}`} scale={0.97} onClick={() => (haptic.select(), setMode("quick"))}>
                        <span className="pf-mode-ico">
                          <Camera size={20} />
                        </span>
                        <b>Просто фото</b>
                        <span>Сфоткал — и сразу результат</span>
                      </Tap>
                      <Tap className={`pf-mode ${mode === "hint" ? "on" : ""}`} scale={0.97} onClick={() => (haptic.select(), setMode("hint"))}>
                        <span className="pf-mode-ico">
                          <PenLine size={20} />
                        </span>
                        <b>Фото + подсказка</b>
                        <span>Допиши, что это и сколько — будет точнее</span>
                      </Tap>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              <Tap className="btn btn-block btn-accent pf-main" onClick={() => camera.current?.click()}>
                <Camera size={20} /> {isReceipt ? "Сфоткать чек" : "Сделать фото"}
              </Tap>
              <Tap className="btn btn-block" style={{ marginTop: 8 }} onClick={() => gallery.current?.click()}>
                <ImagePlus size={19} /> Выбрать из галереи
              </Tap>

              {isReceipt ? (
                <div className="pf-tips">
                  <div>📏 Расправь чек и сними его целиком, строки — ровно</div>
                  <div>💡 Без бликов: термобумага на свету выцветает на фото</div>
                  <div>🧺 Длинный чек — сними по частям, каждую отдельно</div>
                </div>
              ) : (
                <div className="pf-tips">
                  <div>📐 Снимай сверху — чтобы была видна вся тарелка</div>
                  <div>💡 При хорошем свете продукты распознаются точнее</div>
                  <div>✍️ Граммы — оценка по фото: проверь и поправь их</div>
                </div>
              )}
            </motion.div>
          )}

          {stage === "compose" && photo && (
            <motion.div key="compose" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <div className="pf-photo">
                <img src={photo} alt="" />
              </div>
              <div className="group-label">Подсказка для ИИ</div>
              <AutoTextarea
                className="input pf-hint"
                value={hint}
                maxRows={5}
                focusDelay={350}
                onChange={(e) => setHint(e.target.value.slice(0, 200))}
                placeholder="Например: 2 котлеты из индейки, гречка ~150 г, соус без майонеза"
              />
              <div className="chips-row" style={{ marginTop: 8 }}>
                {["Порция большая", "Порция маленькая", "Всё на масле", "Без масла", "Это ПП-версия"].map((t) => (
                  <Tap key={t} className="chip" style={{ height: 30, fontSize: 13 }} onClick={() => (haptic.select(), setHint((h) => (h ? `${h}, ${t.toLowerCase()}` : t)))}>
                    + {t}
                  </Tap>
                ))}
              </div>
              <Tap className="btn btn-block btn-accent pf-main" style={{ marginTop: 16 }} onClick={() => analyze(photo, hint)}>
                <Sparkles size={19} /> Распознать
              </Tap>
            </motion.div>
          )}

          {stage === "analyzing" && photo && (
            <motion.div key="analyzing" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <div className="pf-photo scanning">
                <img src={photo} alt="" />
                <span className="pf-scan" />
                <span className="pf-grid" />
                <span className="pf-corner tl" />
                <span className="pf-corner tr" />
                <span className="pf-corner bl" />
                <span className="pf-corner br" />
                <Status list={isReceipt ? STATUSES_RECEIPT : STATUSES} />
              </div>
              {hint.trim() && <div className="pf-hint-note">✍️ {hint.trim()}</div>}
              <div className="pf-skel">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 58, borderRadius: 18, animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </motion.div>
          )}

          {stage === "error" && (
            <motion.div key="error" className="pf-error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {photo && error !== "limit" && (
                <div className="pf-photo small">
                  <img src={photo} alt="" />
                </div>
              )}
              <div className="pf-error-icon">{isReceipt && error === "empty" ? "🧾" : ERRORS[error].icon}</div>
              <div className="pf-title">{isReceipt && error === "empty" ? "Не нашёл продуктов" : ERRORS[error].title}</div>
              <div className="pf-sub">{isReceipt && error === "empty" ? "Похоже, это не чек или в нём нет еды. Сними чек целиком, ровно и без бликов." : ERRORS[error].text}</div>
              {error !== "limit" && photo && (
                <Tap className="btn btn-block btn-accent" style={{ marginTop: 18 }} onClick={() => analyze(photo, hint)}>
                  <RefreshCw size={18} /> Попробовать ещё раз
                </Tap>
              )}
              {error === "empty" && photo && !isReceipt && (
                <Tap className="btn btn-block" style={{ marginTop: 8 }} onClick={() => (setMode("hint"), setStage("compose"))}>
                  <PenLine size={18} /> Добавить подсказку
                </Tap>
              )}
              <Tap className="btn btn-block" style={{ marginTop: 8 }} onClick={reset}>
                <Camera size={18} /> Другое фото
              </Tap>
            </motion.div>
          )}

          {stage === "result" && result && (
            <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <div className="pf-photo result">
                {photo && <img src={photo} alt="" />}
                <span className="pf-photo-shade" />
                <div className="pf-photo-info">
                  <span className="pf-ai-badge">
                    <Sparkles size={12} /> Распознано за {((result.ms.total ?? 0) / 1000).toFixed(1)} с
                  </span>
                  <div className="pf-dish">{result.dish ? sentence(result.dish) : isReceipt ? "Продукты из чека" : "Твоя тарелка"}</div>
                  {result.comment && <div className="pf-comment">{result.comment}</div>}
                </div>
              </div>

              <motion.div className="pf-total" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <div className="pf-total-kcal">
                  <b className="num">
                    <NumberTicker value={Math.round(total.kcal)} duration={0.5} />
                  </b>
                  <span>{isReceipt ? (eaten.length ? "ккал съедено" : "отметь, что съел") : "ккал"}</span>
                  {isReceipt && <em className="num">в чеке ≈ {fmtNum(Math.round(all))}</em>}
                </div>
                <div className="pf-total-macros">
                  {(
                    [
                      ["Белки", total.protein, "var(--protein)"],
                      ["Жиры", total.fat, "var(--fat)"],
                      ["Углеводы", total.carbs, "var(--carbs)"],
                    ] as const
                  ).map(([l, v, c]) => (
                    <div key={l}>
                      <b className="num" style={{ color: c }}>
                        <NumberTicker value={Math.round(v)} duration={0.5} />
                      </b>
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              <AnimatePresence initial={false}>
                {isReceipt && marked.length > 0 && (
                  <motion.div className="pf-shop" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} transition={{ delay: 0.2 }}>
                    <div className="pf-shop-head">
                      <span className="pf-shop-ico">🛒</span>
                      <span>
                        <b>Отметил в списке покупок</b>
                        <span>Меню на неделю · {marked.length} из чека</span>
                      </span>
                      <button
                        className="pf-shop-undo"
                        onClick={() => {
                          haptic.tap();
                          marked.forEach((x) => setMark.mutate({ key: x.key, checked: false }));
                          setMarked([]);
                        }}
                      >
                        Отменить
                      </button>
                    </div>
                    <div className="pf-shop-list">
                      {marked.map((x) => (
                        <span key={x.key}>
                          <Check size={11} strokeWidth={3} /> {x.name}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="group-label row" style={{ justifyContent: "space-between" }}>
                <span>
                  {isReceipt ? "Что в чеке" : "Что на тарелке"} · {rows.length}
                </span>
                <span className="faint" style={{ textTransform: "none", letterSpacing: 0 }}>
                  {isReceipt ? "отметь съеденное" : "граммы можно поправить"}
                </span>
              </div>
              <div className="pf-items">
                <AnimatePresence initial>
                  {rows.map((r, i) => (
                    <ItemRow key={r.key} r={r} index={i} pickable={isReceipt} onToggle={() => toggle(r.key)} onGrams={(g) => setGrams(r.key, g)} onRemove={() => remove(r.key)} />
                  ))}
                </AnimatePresence>
              </div>
              <Tap className="pf-add" onClick={addManual}>
                <Plus size={17} /> Добавить пропущенный продукт
              </Tap>

              <AnimatePresence initial={false}>
                {isReceipt ? null : refine ? (
                  <motion.div key="refine" className="pf-refine" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <AutoTextarea
                      className="input pf-hint"
                      value={hint}
                      maxRows={4}
                      focusDelay={200}
                      onChange={(e) => setHint(e.target.value.slice(0, 200))}
                      placeholder="Что не так? Например: это индейка, а не курица; риса ~100 г"
                    />
                    <Tap className="btn btn-block" style={{ marginTop: 8 }} disabled={!hint.trim()} onClick={() => photo && analyze(photo, hint)}>
                      <Sparkles size={17} /> Пересчитать с подсказкой
                    </Tap>
                  </motion.div>
                ) : (
                  <motion.button key="refine-btn" className="pf-refine-btn" onClick={() => (haptic.tap(), setRefine(true))} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    ✍️ Что-то не так? Подскажи ИИ — пересчитаю
                  </motion.button>
                )}
              </AnimatePresence>

              <div className="chips-row" style={{ margin: "14px -16px 0", padding: "0 16px" }}>
                {MEALS.map((m) => (
                  <Tap key={m.id} className={`chip ${meal === m.id ? "on" : ""}`} onClick={() => (haptic.select(), setMeal(m.id as Meal))}>
                    {m.emoji} {m.name}
                  </Tap>
                ))}
              </div>

              <div className="pf-bar">
                <Tap className="btn btn-block btn-accent pf-main" disabled={!eaten.length || log.isPending} onClick={save}>
                  {log.isPending
                    ? "Добавляю…"
                    : isReceipt && !eaten.length
                      ? "Отметь, что съел"
                      : `Добавить в «${MEALS[meal].name}» · ${fmtNum(total.kcal)} ккал`}
                </Tap>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/** Сменяющиеся статусы анализа */
function Status({ list }: { list: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, list.length - 1)), 1100);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="pf-status">
      <span className="pf-dots">
        <i />
        <i />
        <i />
      </span>
      <AnimatePresence mode="wait">
        <motion.span key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {list[i]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function ItemRow({ r, index, pickable, onToggle, onGrams, onRemove }: { r: Row; index: number; pickable?: boolean; onToggle?: () => void; onGrams: (g: number) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(r.grams));
  const step = r.grams >= 100 ? 10 : 5;
  const bump = (d: number) => {
    haptic.select();
    onGrams(r.grams + d * step);
  };
  const low = r.confidence < 0.5;
  return (
    <motion.div
      layout
      className={`pf-item ${pickable ? "pickable" : ""} ${pickable && !r.picked ? "off" : ""}`}
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: 0.15 + index * 0.06, type: "spring", stiffness: 380, damping: 30 } }}
      exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0, transition: { duration: 0.22 } }}
    >
      {pickable && (
        <button className={`pf-pick ${r.picked ? "on" : ""}`} onClick={onToggle} aria-label={r.picked ? "Не ел" : "Съел"}>
          <Check size={14} strokeWidth={3} />
        </button>
      )}
      <div className="pf-item-main" onClick={pickable ? onToggle : undefined}>
        <div className="pf-item-name">{sentence(r.name)}</div>
        {r.line && <div className="pf-item-line">{r.line}</div>}
        <div className="pf-item-sub">
          {r.source === "ai" ? (
            <span className="pf-src ai">
              <Sparkles size={11} /> оценка ИИ
            </span>
          ) : (
            <span className="pf-src db" title={r.matched ?? undefined}>
              <Check size={11} strokeWidth={3} />
              <span className="pf-src-name">{r.matched ? `${r.matched}${r.brand ? ` · ${r.brand}` : ""}` : r.source === "recipe" ? "рецепт Emli" : "база Emli"}</span>
            </span>
          )}
          {r.separate && <span className="pf-src side">рядом</span>}
          {low && <span className="pf-src warn">{r.weight_known === false ? "вес примерный" : "проверь"}</span>}
          <span className="num">
            {fmtNum(r.kcal)} ккал · Б {fmtNum(r.protein)} Ж {fmtNum(r.fat)} У {fmtNum(r.carbs)}
          </span>
        </div>
      </div>
      <div className="pf-grams">
        <button className="pf-g-btn" onClick={() => bump(-1)} aria-label="Меньше">
          <Minus size={14} />
        </button>
        {editing ? (
          <input
            className="pf-g-input num"
            inputMode="numeric"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onBlur={() => {
              setEditing(false);
              if (Number(draft) > 0) onGrams(Number(draft));
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button className="pf-g-val num" onClick={() => (setDraft(String(r.grams)), setEditing(true))}>
            {r.grams}
            <small>г</small>
          </button>
        )}
        <button className="pf-g-btn" onClick={() => bump(1)} aria-label="Больше">
          <Plus size={14} />
        </button>
      </div>
      <button className="pf-x" onClick={onRemove} aria-label="Убрать">
        <X size={14} />
      </button>
    </motion.div>
  );
}

// ───────────────────────── Чек и список покупок меню на неделю

type ShopCtx = { planId: string; todo: { key: string; name: string }[] };

/** Активное меню: своё, а если своего нет — общее, к которому присоединился */
function ReceiptShop({ onReady }: { onReady: (c: ShopCtx | null) => void }) {
  const { plan } = useActivePlan();
  const shared = useSharedPlans();
  const today = todayKey();
  const p = plan ?? shared.data?.find((x) => x.status === "joined" && !x.plan.archived && planEnd(x.plan) >= today)?.plan ?? null;
  return p ? <ReceiptShopLines plan={p} onReady={onReady} /> : null;
}

/** Что из списка покупок ещё не куплено — с этим сверяем чек */
function ReceiptShopLines({ plan, onReady }: { plan: MealPlan; onReady: (c: ShopCtx | null) => void }) {
  const { map, dict } = useDishes();
  const marks = useShopMarks(plan.id);
  const todo = useMemo(() => {
    if (!map || !dict || !marks.data) return null;
    const byKey = new Map(marks.data.map((m) => [m.key, m]));
    const lines = shoppingList(plan.items, (it) => dishOfItem(map, it), dict, plan.prefs.people)
      .filter((l) => l.dept !== "pantry" && !byKey.get(l.key)?.checked && !byKey.get(l.key)?.have)
      .map((l) => ({ key: l.key, name: l.name }));
    const custom = marks.data.filter((m) => m.custom && !m.checked).map((m) => ({ key: m.key, name: m.custom!.name }));
    return [...lines, ...custom];
  }, [map, dict, marks.data, plan.items, plan.prefs.people]);
  const sig = todo?.map((x) => x.key).join("|");
  useEffect(() => {
    if (todo) onReady(todo.length ? { planId: plan.id, todo } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, plan.id]);
  return null;
}
