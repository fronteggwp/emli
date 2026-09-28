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
import "./sheets.css";
import "./photo.css";

type Mode = "quick" | "hint";
type Stage = "pick" | "compose" | "analyzing" | "result" | "error";
type Row = AiFoodItem & { key: string };

const STATUSES = ["Смотрю на тарелку…", "Разбираю, что где лежит…", "Оцениваю граммовку…", "Ищу продукты в базе Emli…", "Сверяю КБЖУ…"];
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

  const analyze = async (image: string, h: string) => {
    const id = ++run.current;
    setStage("analyzing");
    haptic.soft();
    try {
      const r = await recognizeFood(image, h.trim() || undefined);
      if (id !== run.current) return;
      if (!r.items.length) {
        setError("empty");
        setStage("error");
        haptic.warning();
        return;
      }
      setResult(r);
      setRows(r.items.map((it, i) => ({ ...it, key: `${id}-${i}` })));
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
      const img = await photoToDataUrl(f);
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

  const total = useMemo(
    () => rows.reduce((a, r) => ({ kcal: a.kcal + r.kcal, protein: a.protein + r.protein, fat: a.fat + r.fat, carbs: a.carbs + r.carbs }), { kcal: 0, protein: 0, fat: 0, carbs: 0 }),
    [rows],
  );

  const setGrams = (key: string, g: number) => setRows((l) => l.map((r) => (r.key === key ? { ...scale(r, Math.max(1, Math.min(3000, Math.round(g)))), key } : r)));
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
    if (!rows.length) return;
    try {
      await log.mutateAsync({
        items: rows.map((r) => ({ food_id: r.food_id, name: sentence(r.name), brand: r.brand ?? null, grams: r.grams, kcal: r.kcal, protein: r.protein, fat: r.fat, carbs: r.carbs })),
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
        title="Еда по фото"
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

      <div className="sheet-body pf">
        <AnimatePresence mode="wait" initial={false}>
          {stage === "pick" && (
            <motion.div key="pick" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <div className="pf-hero">
                <div className="pf-orb">
                  <motion.span className="pf-orb-ring" animate={{ rotate: 360 }} transition={{ duration: 14, repeat: Infinity, ease: "linear" }} />
                  <Icon3D name="lunch" size={96} />
                  <motion.span className="pf-spark s1" animate={{ scale: [0.6, 1.1, 0.6], opacity: [0.4, 1, 0.4] }} transition={{ duration: 2.4, repeat: Infinity }}>
                    ✦
                  </motion.span>
                  <motion.span className="pf-spark s2" animate={{ scale: [1, 0.6, 1], opacity: [1, 0.4, 1] }} transition={{ duration: 2.4, repeat: Infinity }}>
                    ✦
                  </motion.span>
                </div>
                <div className="pf-title">Сфоткай тарелку — посчитаю сам</div>
                <div className="pf-sub">Распознаю продукты и граммовку, найду их в базе Emli и сложу КБЖУ</div>
              </div>

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

              <Tap className="btn btn-block btn-accent pf-main" onClick={() => camera.current?.click()}>
                <Camera size={20} /> Сделать фото
              </Tap>
              <Tap className="btn btn-block" style={{ marginTop: 8 }} onClick={() => gallery.current?.click()}>
                <ImagePlus size={19} /> Выбрать из галереи
              </Tap>

              <div className="pf-tips">
                <div>📐 Снимай сверху — чтобы была видна вся тарелка</div>
                <div>💡 При хорошем свете продукты распознаются точнее</div>
                <div>✍️ Граммы — оценка по фото: проверь и поправь их</div>
              </div>
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
                <Status />
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
              <div className="pf-error-icon">{ERRORS[error].icon}</div>
              <div className="pf-title">{ERRORS[error].title}</div>
              <div className="pf-sub">{ERRORS[error].text}</div>
              {error !== "limit" && photo && (
                <Tap className="btn btn-block btn-accent" style={{ marginTop: 18 }} onClick={() => analyze(photo, hint)}>
                  <RefreshCw size={18} /> Попробовать ещё раз
                </Tap>
              )}
              {error === "empty" && photo && (
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
                  <div className="pf-dish">{result.dish ? sentence(result.dish) : "Твоя тарелка"}</div>
                  {result.comment && <div className="pf-comment">{result.comment}</div>}
                </div>
              </div>

              <motion.div className="pf-total" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <div className="pf-total-kcal">
                  <b className="num">
                    <NumberTicker value={Math.round(total.kcal)} duration={0.5} />
                  </b>
                  <span>ккал</span>
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

              <div className="group-label row" style={{ justifyContent: "space-between" }}>
                <span>Что на тарелке · {rows.length}</span>
                <span className="faint" style={{ textTransform: "none", letterSpacing: 0 }}>
                  граммы можно поправить
                </span>
              </div>
              <div className="pf-items">
                <AnimatePresence initial>
                  {rows.map((r, i) => (
                    <ItemRow key={r.key} r={r} index={i} onGrams={(g) => setGrams(r.key, g)} onRemove={() => remove(r.key)} />
                  ))}
                </AnimatePresence>
              </div>
              <Tap className="pf-add" onClick={addManual}>
                <Plus size={17} /> Добавить пропущенный продукт
              </Tap>

              <AnimatePresence initial={false}>
                {refine ? (
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
                <Tap className="btn btn-block btn-accent pf-main" disabled={!rows.length || log.isPending} onClick={save}>
                  {log.isPending ? "Добавляю…" : `Добавить в «${MEALS[meal].name}» · ${fmtNum(total.kcal)} ккал`}
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
function Status() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, STATUSES.length - 1)), 1100);
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
          {STATUSES[i]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function ItemRow({ r, index, onGrams, onRemove }: { r: Row; index: number; onGrams: (g: number) => void; onRemove: () => void }) {
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
      className="pf-item"
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: 0.15 + index * 0.06, type: "spring", stiffness: 380, damping: 30 } }}
      exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0, transition: { duration: 0.22 } }}
    >
      <div className="pf-item-main">
        <div className="pf-item-name">{sentence(r.name)}</div>
        <div className="pf-item-sub">
          {r.source === "ai" ? (
            <span className="pf-src ai">
              <Sparkles size={11} /> оценка ИИ
            </span>
          ) : (
            <span className="pf-src db">
              <Check size={11} strokeWidth={3} /> {r.source === "product" ? (r.brand ?? "база товаров") : r.source === "recipe" ? "рецепт Emli" : "база Emli"}
            </span>
          )}
          {r.separate && <span className="pf-src side">рядом</span>}
          {low && <span className="pf-src warn">проверь</span>}
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
