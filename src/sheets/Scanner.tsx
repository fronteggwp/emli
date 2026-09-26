import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { CameraOff, Search } from "lucide-react";
import { useDay } from "@/state/day";
import { useLayer, useNav } from "@/nav/Nav";
import { findFoodByBarcode } from "@/data/api";
import { offByBarcode } from "@/data/off";
import { mealByTime } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { Meal } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { FoodDetailSheet } from "./FoodDetail";
import { CreateFoodSheet } from "./CreateFood";
import "./sheets.css";

type Detector = { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> };
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

async function makeDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
  if (Native) return new Native({ formats: FORMATS });
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: FORMATS as never });
}

export function ScannerSheet({ meal: meal0, onDone }: { meal?: Meal; onDone?: () => void }) {
  const { day } = useDay();
  const nav = useNav();
  const layer = useLayer();
  const meal = meal0 ?? (mealByTime() as Meal);
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "looking" | "denied" | "notfound">("starting");
  const [code, setCode] = useState("");
  const busy = useRef(false);

  const finish = () => {
    layer.close();
    onDone?.();
  };

  const lookup = async (barcode: string) => {
    if (busy.current) return;
    busy.current = true;
    setStatus("looking");
    setCode(barcode);
    try {
      const mine = await findFoodByBarcode(barcode);
      const food = mine ?? (await offByBarcode(barcode));
      if (food) {
        haptic.success();
        layer.close();
        nav.sheet(<FoodDetailSheet food={food} meal={meal} day={day} onDone={onDone} />);
        return;
      }
      haptic.warning();
      setStatus("notfound");
    } catch {
      setStatus("notfound");
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setStatus("scanning");
        const detector = await makeDetector();
        const tick = async () => {
          if (stopped) return;
          if (!busy.current && v.readyState >= 2) {
            try {
              const found = await detector.detect(v);
              if (found[0]?.rawValue) {
                await lookup(found[0].rawValue);
              }
            } catch {
              /* кадр не распознан */
            }
          }
          timer = window.setTimeout(tick, 180);
        };
        tick();
      } catch {
        setStatus("denied");
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <SheetHeader title="Штрихкод" />
      <div className="sheet-body">
        {status !== "denied" ? (
          <div className="scanner">
            <video ref={video} playsInline muted />
            <div className="scanner-frame" />
            {status === "scanning" && (
              <motion.div
                className="scanner-line"
                initial={{ top: "36%" }}
                animate={{ top: ["36%", "58%", "36%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </div>
        ) : (
          <div className="empty">
            <CameraOff size={40} style={{ margin: "0 auto 10px", display: "block" }} />
            Нет доступа к камере. Разреши доступ в настройках Telegram или введи код вручную.
          </div>
        )}

        <div className="muted" style={{ textAlign: "center", fontSize: 14, marginTop: 14, minHeight: 20 }}>
          {status === "starting" && "Включаю камеру…"}
          {status === "scanning" && "Наведи камеру на штрихкод"}
          {status === "looking" && `Ищу ${code}…`}
          {status === "notfound" && `Продукт ${code} не найден`}
        </div>

        {status === "notfound" && (
          <Tap
            className="btn btn-accent btn-block"
            style={{ marginTop: 12 }}
            onClick={() => {
              layer.close();
              nav.sheet(<CreateFoodSheet barcode={code} meal={meal} onDone={onDone} />);
            }}
          >
            Создать продукт с этим кодом
          </Tap>
        )}

        <div className="group-label">Или введи цифры под штрихкодом</div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length >= 6) lookup(code);
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
        <button className="faint" style={{ marginTop: 18, fontSize: 14, width: "100%" }} onClick={finish}>
          Отмена
        </button>
      </div>
    </>
  );
}
