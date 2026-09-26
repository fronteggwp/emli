// Распознавание штрихкодов: нативный BarcodeDetector (Android/Chrome) или zxing-wasm.
// Модуль wasm отдаём со своего домена — не зависим от CDN.
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

export type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
let ready: Promise<Detector> | null = null;

type NativeCtor = (new (o: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };

/** Загрузить заранее — чтобы сканер включался мгновенно */
export function loadDetector(): Promise<Detector> {
  if (!ready) {
    ready = (async () => {
      const Native = (window as unknown as { BarcodeDetector?: NativeCtor }).BarcodeDetector;
      if (Native) {
        try {
          const supported = (await Native.getSupportedFormats?.()) ?? [];
          if (supported.includes("ean_13")) return new Native({ formats: FORMATS });
        } catch {
          /* используем wasm */
        }
      }
      const m = await import("barcode-detector/ponyfill");
      m.setZXingModuleOverrides({
        locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
      });
      await m.prepareZXingModule({ fireImmediately: true });
      return new m.BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector;
    })();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}
