import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, PenLine, RotateCcw, ScanBarcode, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDay } from "@/state/day";
import { useLayer, useNav } from "@/nav/Nav";
import { findFoodByBarcode } from "@/data/api";
import { barcodeValid, lookupBarcode, productDraft } from "@/data/off";
import { LabelScanSheet } from "./LabelScan";
import { loadDetector } from "@/lib/barcode";
import { mealByTime } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { Food, FoodDraft, Meal } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { FoodDetailSheet } from "./FoodDetail";
import { CreateFoodSheet } from "./CreateFood";
import "./sheets.css";

type Status = "starting" | "scanning" | "looking" | "denied" | "notfound" | "offline" | "invalid";
const LOOK_STEPS = ["База Emli", "Open Food Facts", "Каталоги штрихкодов", "ИИ читает этикетку"];

export function ScannerSheet({ meal: meal0, onDone }: { meal?: Meal; onDone?: () => void }) {
  const { day } = useDay();
  const nav = useNav();
  const layer = useLayer();
  const meal = meal0 ?? (mealByTime() as Meal);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [live, setLive] = useState(false);
  const [code, setCode] = useState("");
  // Нашли только название (без КБЖУ) — показываем его и предлагаем сфоткать этикетку
  const [known, setKnown] = useState<{ name: string; brand: string | null } | null>(null);
  const [lookStep, setLookStep] = useState(0);
  useEffect(() => {
    if (status !== "looking") return;
    setLookStep(0);
    const t = setInterval(() => setLookStep((x) => Math.min(x + 1, LOOK_STEPS.length - 1)), 900);
    return () => clearInterval(t);
  }, [status]);
  // paused — распознавание на паузе, пока ищем продукт; finished — сканер отработал, больше не реагируем
  const paused = useRef(false);
  const finished = useRef(false);
  // Окно закрыли, пока шёл поиск — поздний ответ не должен открыть карточку поверх другого экрана
  const closed = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const lookup = async (barcode: string) => {
    if (finished.current) return;
    paused.current = true;
    setCode(barcode);
    setKnown(null);
    if (!barcodeValid(barcode)) {
      haptic.warning();
      setStatus("invalid");
      return;
    }
    setStatus("looking");
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    try {
      const mine = await findFoodByBarcode(barcode);
      let food: Food | FoodDraft | null = mine;
      if (!food) {
        const r = await lookupBarcode(barcode);
        if (r.product && (r.status === "found" || r.status === "estimate")) food = productDraft(r.product);
        if (!food && r.product?.name) setKnown({ name: r.product.name, brand: r.product.brand });
      }
      if (finished.current || closed.current || ac.signal.aborted) return;
      if (food) {
        finished.current = true;
        stopCamera();
        haptic.success();
        layer.close();
        nav.sheet(<FoodDetailSheet food={food} meal={meal} day={day} onDone={onDone} />);
        return;
      }
      haptic.warning();
      setStatus("notfound");
    } catch {
      if (closed.current || ac.signal.aborted) return;
      haptic.error();
      // Ошибка сети — это не «продукт не найден»
      setStatus("offline");
    }
  };

  const rescan = () => {
    haptic.tap();
    setCode("");
    setStatus(stream.current ? "scanning" : "starting");
    paused.current = false;
  };

  useEffect(() => {
    let timer: number | undefined;
    let alive = true;
    // StrictMode монтирует эффект дважды — после первой «очистки» окно снова открыто
    closed.current = false;
    const detector = loadDetector(); // грузим параллельно с камерой

    // Камеру включаем, когда шторка уже выехала — чтобы анимация не дёргалась
    const start = window.setTimeout(async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play();
        setStatus((st) => (st === "starting" ? "scanning" : st));
        const d = await detector;
        const tick = async () => {
          if (!alive || finished.current) return;
          if (!paused.current && v.readyState >= 2) {
            try {
              const found = await d.detect(v);
              const value = found[0]?.rawValue;
              // Код с неверной контрольной цифрой — ошибка распознавания, ждём следующий кадр
              if (value && barcodeValid(value) && !paused.current && !finished.current) {
                haptic.rigid();
                await lookup(value);
              }
            } catch {
              /* кадр не распознан */
            }
          }
          timer = window.setTimeout(tick, 120);
        };
        tick();
      } catch {
        if (alive) setStatus("denied");
      }
    }, 380);

    return () => {
      alive = false;
      closed.current = true;
      abort.current?.abort();
      window.clearTimeout(start);
      window.clearTimeout(timer);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <SheetHeader title="Штрихкод" />
      <div className="sheet-body">
        {status !== "denied" ? (
          <div className="scanner">
            <video ref={video} playsInline muted autoPlay onPlaying={() => setLive(true)} className={live ? "live" : ""} />
            {!live && (
              <div className="scanner-wait">
                <ScanBarcode size={36} />
                <span>Включаю камеру…</span>
              </div>
            )}
            <div className={`scanner-frame ${status === "looking" ? "found" : ""}`}>
              {live && status === "scanning" && (
                <div className="scanner-sweep">
                  <i />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="empty">
            <CameraOff size={40} style={{ margin: "0 auto 10px", display: "block" }} />
            Нет доступа к камере. Разреши доступ в настройках Telegram или введи код вручную.
          </div>
        )}

        <div className="muted" style={{ textAlign: "center", fontSize: 14, marginTop: 14, minHeight: 20 }}>
          {status === "scanning" && "Наведи камеру на штрихкод"}
          {status === "looking" && (
            <AnimatePresence mode="wait">
              <motion.span key={lookStep} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} style={{ display: "inline-block" }}>
                Ищу {code} · {LOOK_STEPS[lookStep]}…
              </motion.span>
            </AnimatePresence>
          )}
          {status === "offline" && "Нет связи — не удалось проверить продукт"}
          {status === "invalid" && "Похоже, цифры считались с ошибкой — наведи ещё раз или проверь код"}
        </div>

        {status === "invalid" && (
          <Tap className="btn btn-block" style={{ marginTop: 12 }} onClick={rescan}>
            <RotateCcw size={18} /> Сканировать снова
          </Tap>
        )}

        {status === "offline" && (
          <Tap className="btn btn-block" style={{ marginTop: 14 }} onClick={() => lookup(code)}>
            Повторить поиск
          </Tap>
        )}
        {status === "notfound" && (
          <motion.div className="sc-miss" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {known ? (
              <>
                <b>Нашёл товар, но без КБЖУ</b>
                <div className="sc-miss-name">«{known.name}»{known.brand ? ` · ${known.brand}` : ""}</div>
              </>
            ) : (
              <>
                <b>Этого товара пока нет в базах</b>
                <div className="sc-miss-name">Код {code} — ни в Emli, ни в Open Food Facts</div>
              </>
            )}
            <p>Сфоткай таблицу КБЖУ на упаковке — ИИ прочитает цифры, а товар появится в общей базе для всех.</p>
            <Tap
              className="btn btn-accent btn-block"
              onClick={() => {
                finished.current = true;
                stopCamera();
                layer.close();
                nav.sheet(<LabelScanSheet barcode={code} name={known?.name} brand={known?.brand} meal={meal} onDone={onDone} />);
              }}
            >
              <Camera size={19} /> Сфоткать этикетку
            </Tap>
            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              <Tap className="btn" style={{ flex: 1 }} onClick={rescan}>
                <RotateCcw size={17} /> Ещё раз
              </Tap>
              <Tap
                className="btn"
                style={{ flex: 1 }}
                onClick={() => {
                  finished.current = true;
                  stopCamera();
                  layer.close();
                  nav.sheet(<CreateFoodSheet name={known?.name} barcode={code} meal={meal} onDone={onDone} />);
                }}
              >
                <PenLine size={17} /> Вручную
              </Tap>
            </div>
          </motion.div>
        )}

        <div className="group-label">Или введи цифры под штрихкодом</div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length >= 8) lookup(code);
          }}
        >
          <input
            className="input num"
            inputMode="numeric"
            placeholder="4600000000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <Tap className="icon-btn" style={{ width: 52, height: 52 }} type="submit" aria-label="Найти">
            <Search size={20} />
          </Tap>
        </form>
      </div>
    </>
  );
}
