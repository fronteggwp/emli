import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { sfx } from "@/lib/sound";
import { vibrate } from "@/lib/telegram";
import "./celebration.css";

type Item = { id: number; emoji: string; title: string; desc: string; colors: [string, string]; label?: string };
let seq = 0;
const listeners = new Set<(i: Item) => void>();

/** Показать праздничный экран: достижение, рекорд, цель */
export function celebrate(i: Omit<Item, "id">) {
  const item = { ...i, id: ++seq };
  listeners.forEach((l) => l(item));
}

const COLORS = ["#7c8cff", "#b388ff", "#ff7a5c", "#ffc247", "#4fd18b", "#ff5e9e"];

export function CelebrationHost() {
  const [queue, setQueue] = useState<Item[]>([]);
  const cur = queue[0];

  useEffect(() => {
    const on = (i: Item) => setQueue((q) => [...q, i]);
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);

  useEffect(() => {
    if (!cur) return;
    vibrate("success");
    sfx.fanfare();
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 3800);
    return () => clearTimeout(t);
  }, [cur]);

  return (
    <AnimatePresence>
      {cur && (
        <motion.div
          key={cur.id}
          className="celebrate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          onClick={() => setQueue((q) => q.slice(1))}
        >
          <div className="celebrate-confetti">
            {Array.from({ length: 36 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${(i * 37) % 100}%`,
                  background: COLORS[i % COLORS.length],
                  animationDelay: `${(i % 9) * 0.06}s`,
                  ["--dx" as string]: `${((i * 53) % 160) - 80}px`,
                  ["--rot" as string]: `${((i * 97) % 720) - 360}deg`,
                }}
              />
            ))}
          </div>
          <motion.div
            className="celebrate-card"
            initial={{ scale: 0.6, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
          >
            <div className="celebrate-rays" style={{ ["--c1" as string]: cur.colors[0] }} />
            <motion.div
              className="celebrate-medal"
              style={{ background: `radial-gradient(70% 70% at 30% 25%, rgba(255,255,255,.5), transparent 60%), linear-gradient(135deg, ${cur.colors[0]}, ${cur.colors[1]})` }}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
            >
              {cur.emoji}
            </motion.div>
            <motion.div className="celebrate-label" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              {cur.label ?? "Новое достижение"}
            </motion.div>
            <motion.div className="celebrate-title" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
              {cur.title}
            </motion.div>
            <motion.div className="celebrate-desc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              {cur.desc}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Для проверки в режиме разработки: window.__celebrate({...})
if (import.meta.env.DEV) (window as unknown as { __celebrate: typeof celebrate }).__celebrate = celebrate;
