import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Image as ImageIcon, RotateCcw } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { haptic } from "@/lib/telegram";
import type { Meal } from "@/lib/types";
import { readLabel } from "@/data/off";
import { photoToDataUrl } from "@/data/engage";
import { CreateFoodSheet } from "./CreateFood";
import "./photo.css";
import "./sheets.css";

type Stage = "pick" | "reading" | "error";
const STEPS = ["Ищу таблицу пищевой ценности…", "Читаю калории и БЖУ…", "Проверяю, сходятся ли цифры…"];

/**
 * Фото этикетки → КБЖУ на 100 г. Для товаров, которых нет ни в одной базе:
 * ИИ читает таблицу, человек проверяет цифры, товар попадает в общую базу Emli.
 */
export function LabelScanSheet({ barcode, name, brand, meal, onDone }: { barcode?: string; name?: string | null; brand?: string | null; meal?: Meal; onDone?: () => void }) {
  const nav = useNav();
  const layer = useLayer();
  const [stage, setStage] = useState<Stage>("pick");
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [step, setStep] = useState(0);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  useEffect(() => () => void run.current++, []);
  useEffect(() => {
    if (stage !== "reading") return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1300);
    return () => clearInterval(t);
  }, [stage]);

  const onFile = async (file?: File) => {
    if (!file) return;
    const my = ++run.current;
    haptic.tap();
    try {
      const url = await photoToDataUrl(file);
      if (my !== run.current) return;
      setPhoto(url);
      setStage("reading");
      const lab = await readLabel(url, name ?? undefined);
      if (my !== run.current) return;
      if (!lab) {
        haptic.warning();
        setErr("no_label");
        setStage("error");
        return;
      }
      haptic.success();
      layer.close();
      nav.sheet(
        <CreateFoodSheet
          food={{
            name: name ?? lab.name ?? "",
            brand: brand ?? lab.brand,
            barcode: barcode ?? null,
            category: null,
            kcal: lab.kcal,
            protein: lab.protein,
            fat: lab.fat,
            carbs: lab.carbs,
            serving_g: lab.serving_g,
            serving_name: lab.serving_g ? "порция" : null,
            source: "user",
            origin: { source: "label", net_g: lab.net_g, liquid: lab.liquid },
          }}
          barcode={barcode}
          meal={meal}
          onDone={onDone}
          fromLabel
        />,
      );
    } catch (e) {
      if (my !== run.current) return;
      haptic.error();
      setErr(e instanceof Error ? e.message : "failed");
      setStage("error");
    }
  };

  return (
    <>
      <SheetHeader title="Этикетка" />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />
      <div className="sheet-body pf">
        <AnimatePresence mode="wait">
          {stage === "pick" && (
            <motion.div key="pick" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="lbl-art">
                <div className="lbl-card">
                  <b>Пищевая ценность</b>
                  <span>на 100 г</span>
                  <i />
                  <div>
                    Белки <em>12,0 г</em>
                  </div>
                  <div>
                    Жиры <em>9,0 г</em>
                  </div>
                  <div>
                    Углеводы <em>54,0 г</em>
                  </div>
                  <div>
                    Энерг. ценность <em>345 ккал</em>
                  </div>
                  <motion.span className="lbl-scan" animate={{ y: [0, 118, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
                </div>
              </div>
              <div className="pf-title" style={{ textAlign: "center" }}>
                Сфоткай таблицу КБЖУ
              </div>
              <p className="pf-sub" style={{ textAlign: "center" }}>
                {name ? (
                  <>
                    «{name}» есть в каталоге, но без КБЖУ. ИИ прочитает цифры с упаковки — ты проверишь, и товар появится у всех.
                  </>
                ) : (
                  "ИИ прочитает калории и БЖУ с упаковки — ты проверишь, и товар появится в общей базе для всех."
                )}
              </p>
              <Tap className="btn btn-accent btn-block" style={{ marginTop: 16 }} onClick={() => camera.current?.click()}>
                <Camera size={19} /> Сфотографировать
              </Tap>
              <Tap className="btn btn-block" style={{ marginTop: 8 }} onClick={() => gallery.current?.click()}>
                <ImageIcon size={19} /> Выбрать из галереи
              </Tap>
              <div className="lbl-tips">
                <div>📐 Таблица целиком и ровно, без бликов</div>
                <div>🔎 Цифры должны читаться — подойди ближе</div>
                <div>🔄 Если на упаковке «на порцию» — пересчитаю на 100 г</div>
              </div>
            </motion.div>
          )}
          {stage === "reading" && photo && (
            <motion.div key="reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="pf-photo scanning">
                <img src={photo} alt="" />
                <span className="pf-scan" />
                <span className="pf-grid" />
                <span className="pf-corner tl" />
                <span className="pf-corner tr" />
                <span className="pf-corner bl" />
                <span className="pf-corner br" />
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={step} className="lbl-step" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  {STEPS[step]}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
          {stage === "error" && (
            <motion.div key="error" className="pf-error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div style={{ fontSize: 46 }}>{err === "limit" ? "⏳" : "🔍"}</div>
              <b>{err === "no_label" ? "Не вижу таблицу КБЖУ" : err === "limit" ? "Лимит на сегодня исчерпан" : err === "network" ? "Нет связи" : "Не получилось прочитать"}</b>
              <p className="pf-sub">
                {err === "no_label" ? "Сфоткай ближе именно таблицу «Пищевая ценность», без бликов." : err === "limit" ? "Введи цифры вручную — это займёт минуту." : "Попробуй ещё раз."}
              </p>
              {err !== "limit" && (
                <Tap className="btn btn-accent btn-block" onClick={() => camera.current?.click()}>
                  <RotateCcw size={18} /> Сфоткать ещё раз
                </Tap>
              )}
              <Tap
                className="btn btn-block"
                style={{ marginTop: 8 }}
                onClick={() => {
                  layer.close();
                  nav.sheet(<CreateFoodSheet name={name ?? undefined} barcode={barcode} meal={meal} onDone={onDone} />);
                }}
              >
                Ввести вручную
              </Tap>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
