import { useEffect, useRef, useState } from "react";
import { CameraOff, RotateCcw, ScanBarcode, Search } from "lucide-react";
import { useDay } from "@/state/day";
import { useLayer, useNav } from "@/nav/Nav";
import { findFoodByBarcode } from "@/data/api";
import { offByBarcode } from "@/data/off";
import { loadDetector } from "@/lib/barcode";
import { mealByTime } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { Meal } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { FoodDetailSheet } from "./FoodDetail";
import { CreateFoodSheet } from "./CreateFood";
import "./sheets.css";

type Status = "starting" | "scanning" | "looking" | "denied" | "notfound";

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
  // paused — распознавание на паузе, пока ищем продукт; finished — сканер отработал, больше не реагируем
  const paused = useRef(false);
  const finished = useRef(false);

  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const lookup = async (barcode: string) => {
    if (finished.current) return;
    paused.current = true;
    setStatus("looking");
    setCode(barcode);
    try {
      const mine = await findFoodByBarcode(barcode);
      const food = mine ?? (await offByBarcode(barcode));
      if (finished.current) return;
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
      setStatus("notfound");
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
              if (value && !paused.current && !finished.current) {
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
          {status === "looking" && `Ищу ${code}…`}
          {status === "notfound" && `Продукт ${code} не найден`}
        </div>

        {status === "notfound" && (
          <div className="row" style={{ marginTop: 12, gap: 10 }}>
            <Tap className="icon-btn" style={{ width: 54, height: 54 }} onClick={rescan} aria-label="Сканировать снова">
              <RotateCcw size={20} />
            </Tap>
            <Tap
              className="btn btn-accent btn-block"
              onClick={() => {
                finished.current = true;
                layer.close();
                nav.sheet(<CreateFoodSheet barcode={code} meal={meal} onDone={onDone} />);
              }}
            >
              Создать продукт с этим кодом
            </Tap>
          </div>
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
      </div>
    </>
  );
}
