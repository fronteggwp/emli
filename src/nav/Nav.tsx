import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import { haptic, tg } from "@/lib/telegram";
import "./nav.css";

export type Tab = "diary" | "stats" | "community" | "profile";
type SheetOpts = { full?: boolean };
type Layer = { id: number; kind: "screen" | "sheet"; node: ReactNode; opts: SheetOpts };

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

const spring = { type: "spring", stiffness: 420, damping: 40, mass: 0.9 } as const;
const sheetSpring = { type: "spring", stiffness: 380, damping: 36, mass: 0.9 } as const;

export function NavProvider({ tabs }: { tabs: (tab: Tab) => ReactNode }) {
  const [tab, setTabState] = useState<Tab>("diary");
  const [layers, setLayers] = useState<Layer[]>([]);
  const seq = useRef(0);

  const push = useCallback((node: ReactNode) => {
    setLayers((l) => [...l, { id: ++seq.current, kind: "screen", node, opts: {} }]);
  }, []);
  const sheet = useCallback((node: ReactNode, opts: SheetOpts = {}) => {
    setLayers((l) => [...l, { id: ++seq.current, kind: "sheet", node, opts }]);
  }, []);
  const pop = useCallback(() => setLayers((l) => l.slice(0, -1)), []);
  const closeAll = useCallback(() => setLayers([]), []);
  const closeId = useCallback((id: number) => setLayers((l) => l.filter((x) => x.id !== id)), []);
  const setTab = useCallback((t: Tab) => {
    setLayers([]);
    setTabState(t);
  }, []);

  // Системная кнопка «Назад» в Telegram
  useEffect(() => {
    if (!tg) return;
    if (layers.length) tg.BackButton.show();
    else tg.BackButton.hide();
    tg.BackButton.onClick(pop);
    return () => tg!.BackButton.offClick(pop);
  }, [layers.length, pop]);

  const api = useMemo<NavApi>(
    () => ({ tab, setTab, push, sheet, pop, closeAll, depth: layers.length }),
    [tab, setTab, push, sheet, pop, closeAll, layers.length],
  );

  const topScreenIdx = layers.map((l) => l.kind).lastIndexOf("screen");

  return (
    <NavCtx.Provider value={api}>
      <motion.div
        className="nav-base"
        animate={{ x: topScreenIdx >= 0 ? "-22%" : 0, opacity: topScreenIdx >= 0 ? 0.6 : 1 }}
        transition={spring}
      >
        {tabs(tab)}
      </motion.div>
      <AnimatePresence>
        {layers.map((l, i) => {
          const coveredByScreen = layers.slice(i + 1).some((x) => x.kind === "screen");
          const ctx = { close: () => closeId(l.id), covered: coveredByScreen };
          return l.kind === "screen" ? (
            <ScreenLayer key={l.id} z={10 + i * 2} covered={coveredByScreen} onClose={ctx.close}>
              <LayerCtx.Provider value={ctx}>{l.node}</LayerCtx.Provider>
            </ScreenLayer>
          ) : (
            <SheetLayer key={l.id} z={10 + i * 2} full={!!l.opts.full} onClose={ctx.close}>
              <LayerCtx.Provider value={ctx}>{l.node}</LayerCtx.Provider>
            </SheetLayer>
          );
        })}
      </AnimatePresence>
    </NavCtx.Provider>
  );
}

function ScreenLayer({ children, z, covered, onClose }: { children: ReactNode; z: number; covered: boolean; onClose: () => void }) {
  const controls = useDragControls();
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.clientX < 28) controls.start(e);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 110 || info.velocity.x > 600) {
      haptic.soft();
      onClose();
    }
  };
  return (
    <motion.div
      className="nav-screen"
      style={{ zIndex: z }}
      initial={{ x: "100%" }}
      animate={{ x: covered ? "-22%" : 0 }}
      exit={{ x: "100%", transition: { ...spring, stiffness: 480 } }}
      transition={spring}
      drag="x"
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.9 }}
      onDragEnd={onDragEnd}
      onPointerDown={onPointerDown}
    >
      {children}
    </motion.div>
  );
}

function SheetLayer({ children, z, full, onClose }: { children: ReactNode; z: number; full: boolean; onClose: () => void }) {
  const controls = useDragControls();
  const onPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-sheet-drag]")) controls.start(e);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 700) onClose();
  };
  return (
    <div className="nav-sheet-wrap" style={{ zIndex: z }}>
      <motion.div
        className="nav-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />
      <motion.div
        className={`nav-sheet ${full ? "full" : ""}`}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={sheetSpring}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.9 }}
        onDragEnd={onDragEnd}
        onPointerDown={onPointerDown}
      >
        <div className="nav-sheet-grab" data-sheet-drag>
          <span />
        </div>
        {children}
      </motion.div>
    </div>
  );
}
