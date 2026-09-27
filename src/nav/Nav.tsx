import { sfx } from "@/lib/sound";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { haptic, tg } from "@/lib/telegram";
import "./nav.css";

export type Tab = "diary" | "workouts" | "stats" | "community";
type SheetOpts = { full?: boolean };
type Layer = { id: number; kind: "screen" | "sheet"; node: ReactNode; opts: SheetOpts; closing: boolean };

type NavApi = {
  tab: Tab;
  setTab: (t: Tab) => void;
  push: (node: ReactNode) => void;
  sheet: (node: ReactNode, opts?: SheetOpts) => void;
  pop: () => void;
  closeAll: () => void;
  depth: number;
};

const NavCtx = createContext<NavApi | null>(null);
const LayerCtx = createContext<{ close: () => void; covered: boolean } | null>(null);

export const useNav = () => useContext(NavCtx)!;
/** Закрыть текущий экран/шторку изнутри неё самой */
export const useLayer = () => useContext(LayerCtx) ?? { close: () => {}, covered: false };

/*
 * Анимации — на CSS-переходах (transform/opacity): их считает композитор,
 * поэтому они не дёргаются, даже когда React рендерит содержимое.
 * Кривая как у системных шторок iOS.
 */
const DURATION = 480;

export function NavProvider({ tabs }: { tabs: (tab: Tab) => ReactNode }) {
  const [tab, setTabState] = useState<Tab>("diary");
  const [layers, setLayers] = useState<Layer[]>([]);
  const seq = useRef(0);

  const add = useCallback((kind: Layer["kind"], node: ReactNode, opts: SheetOpts = {}) => {
    setLayers((l) => [...l, { id: ++seq.current, kind, node, opts, closing: false }]);
  }, []);
  const push = useCallback(
    (node: ReactNode) => {
      sfx.tick();
      add("screen", node);
    },
    [add],
  );
  const sheet = useCallback(
    (node: ReactNode, opts?: SheetOpts) => {
      sfx.pop();
      add("sheet", node, opts);
    },
    [add],
  );
  const closeId = useCallback((id: number) => setLayers((l) => l.map((x) => (x.id === id ? { ...x, closing: true } : x))), []);
  const remove = useCallback((id: number) => setLayers((l) => l.filter((x) => x.id !== id)), []);
  const pop = useCallback(
    () =>
      setLayers((l) => {
        const idx = l.map((x) => x.closing).lastIndexOf(false);
        return idx < 0 ? l : l.map((x, i) => (i === idx ? { ...x, closing: true } : x));
      }),
    [],
  );
  const closeAll = useCallback(() => setLayers((l) => l.map((x) => ({ ...x, closing: true }))), []);
  const setTab = useCallback((t: Tab) => {
    setLayers((l) => l.map((x) => ({ ...x, closing: true })));
    setTabState(t);
  }, []);

  const open = layers.filter((l) => !l.closing);

  // Системная кнопка «Назад» в Telegram
  useEffect(() => {
    if (!tg) return;
    if (open.length) tg.BackButton.show();
    else tg.BackButton.hide();
    tg.BackButton.onClick(pop);
    return () => tg!.BackButton.offClick(pop);
  }, [open.length, pop]);

  const api = useMemo<NavApi>(
    () => ({ tab, setTab, push, sheet, pop, closeAll, depth: open.length }),
    [tab, setTab, push, sheet, pop, closeAll, open.length],
  );

  const screenOpen = open.some((l) => l.kind === "screen");

  return (
    <NavCtx.Provider value={api}>
      <div className={`nav-base ${screenOpen ? "covered" : ""}`}>{tabs(tab)}</div>
      {layers.map((l, i) => {
        const covered = layers.slice(i + 1).some((x) => x.kind === "screen" && !x.closing);
        const ctx = { close: () => closeId(l.id), covered };
        const Comp = l.kind === "screen" ? ScreenLayer : SheetLayer;
        return (
          <Comp
            key={l.id}
            z={10 + i * 2}
            full={!!l.opts.full}
            covered={covered}
            closing={l.closing}
            onClose={ctx.close}
            onExited={() => remove(l.id)}
          >
            <LayerCtx.Provider value={ctx}>{l.node}</LayerCtx.Provider>
          </Comp>
        );
      })}
    </NavCtx.Provider>
  );
}

type LayerProps = {
  children: ReactNode;
  z: number;
  full: boolean;
  covered: boolean;
  closing: boolean;
  onClose: () => void;
  onExited: () => void;
};

/** Появление: монтируем в закрытом положении и на следующем кадре включаем «open» */
function useEnterExit(closing: boolean, onExited: () => void) {
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, []);
  useEffect(() => {
    if (!closing) return;
    setShown(false);
    const t = setTimeout(onExited, DURATION + 40);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);
  return shown;
}

type Drag = { start: number; last: number; lastT: number; v: number; size: number; pointer: number };

function ScreenLayer({ children, z, covered, closing, onClose, onExited }: LayerProps) {
  const shown = useEnterExit(closing, onExited);
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  // Свайп от левого края — назад, как в iOS
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.clientX > 24 || closing) return;
    drag.current = { start: e.clientX, last: e.clientX, lastT: e.timeStamp, v: 0, size: el.current!.offsetWidth, pointer: e.pointerId };
    el.current!.setPointerCapture(e.pointerId);
    el.current!.style.transition = "none";
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.max(0, e.clientX - d.start);
    d.v = (e.clientX - d.last) / Math.max(e.timeStamp - d.lastT, 1);
    d.last = e.clientX;
    d.lastT = e.timeStamp;
    el.current!.style.transform = `translate3d(${dx}px,0,0)`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const node = el.current!;
    node.style.transition = "";
    if (d.last - d.start > d.size * 0.35 || d.v > 0.5) {
      node.style.transform = "translate3d(100%,0,0)";
      haptic.soft();
      onClose();
    } else node.style.transform = "";
  };

  const state = !shown ? "enter" : covered ? "covered" : "open";
  return (
    <div
      ref={el}
      className={`nav-screen ${state}`}
      style={{ zIndex: z }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </div>
  );
}

function SheetLayer({ children, z, full, closing, onClose, onExited }: LayerProps) {
  const shown = useEnterExit(closing, onExited);
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (closing || !(e.target as HTMLElement).closest("[data-sheet-drag]")) return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    const p = panel.current!;
    drag.current = { start: e.clientY, last: e.clientY, lastT: e.timeStamp, v: 0, size: p.offsetHeight, pointer: e.pointerId };
    p.setPointerCapture(e.pointerId);
    p.style.transition = "none";
    backdrop.current!.style.transition = "none";
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    let dy = e.clientY - d.start;
    if (dy < 0) dy = -Math.sqrt(-dy) * 2; // «резинка» вверх
    d.v = (e.clientY - d.last) / Math.max(e.timeStamp - d.lastT, 1);
    d.last = e.clientY;
    d.lastT = e.timeStamp;
    panel.current!.style.transform = `translate3d(0,${dy}px,0)`;
    backdrop.current!.style.opacity = String(Math.max(0, 1 - Math.max(dy, 0) / d.size));
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const p = panel.current!;
    const b = backdrop.current!;
    p.style.transition = "";
    b.style.transition = "";
    if (d.last - d.start > Math.min(140, d.size * 0.3) || d.v > 0.6) {
      p.style.transform = "translate3d(0,105%,0)";
      b.style.opacity = "0";
      onClose();
    } else {
      p.style.transform = "";
      b.style.opacity = "";
    }
  };

  return (
    <div className={`nav-sheet-wrap ${shown ? "open" : ""}`} style={{ zIndex: z }}>
      <div ref={backdrop} className="nav-backdrop" onClick={onClose} />
      <div
        ref={panel}
        className={`nav-sheet ${full ? "full" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="nav-sheet-grab" data-sheet-drag>
          <span />
        </div>
        {children}
      </div>
    </div>
  );
}
