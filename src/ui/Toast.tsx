import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

type ToastItem = { id: number; text: string; icon?: ReactNode };
const Ctx = createContext<(text: string, icon?: ReactNode) => void>(() => {});

export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const show = useCallback((text: string, icon?: ReactNode) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-1), { id, text, icon }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 2200);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div
        style={{
          position: "fixed",
          top: "calc(var(--sat) + 10px)",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          zIndex: 1000,
          pointerEvents: "none",
        }}
      >
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 18px",
                borderRadius: 999,
                background: "rgba(40,40,48,.92)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid var(--line-2)",
                boxShadow: "var(--shadow)",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {t.icon}
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
