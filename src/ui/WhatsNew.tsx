import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, X } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { cloudGet, cloudSet, haptic } from "@/lib/telegram";
import { LATEST, type Release, type ReleaseAction } from "@/data/releases";
import { PhotoFoodSheet } from "@/sheets/PhotoFood";
import { WaistScreen } from "@/pages/Waist";
import { Tap } from "./Tap";
import "./whatsnew.css";

const KEY = "seen_release";
/** Уже показали в этом запуске — флаг ставим в момент показа, а не при монтировании (StrictMode монтирует дважды) */
let shownThisRun = false;

/**
 * После обновления один раз показывает «Что нового» — небольшое окно по центру. Отметка «видел» — в облаке
 * Telegram (общая для всех устройств) и в localStorage. Новый пользователь (только что прошёл онбординг) видит
 * всё впервые — ему не показываем.
 */
export function WhatsNewWatcher({ fresh }: { fresh: boolean }) {
  const nav = useNav();
  const uid = useUid();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shownThisRun) return;
    const key = `${KEY}_${uid.slice(0, 8)}`;
    if (fresh) {
      shownThisRun = true;
      cloudSet(key, LATEST.id);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const seen = await cloudGet(key);
      if (!alive || shownThisRun || seen === LATEST.id) return;
      shownThisRun = true;
      cloudSet(key, LATEST.id);
      haptic.soft();
      setOpen(true);
    }, 1200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [fresh, uid]);

  const go = (a: ReleaseAction) => {
    haptic.medium();
    setOpen(false);
    setTimeout(() => {
      if (a === "receipt") nav.sheet(<PhotoFoodSheet mode="receipt" />, { full: true });
      else if (a === "photo") nav.sheet(<PhotoFoodSheet mode="quick" />, { full: true });
      else if (a === "waist") nav.push(<WaistScreen />);
    }, 220);
  };

  return createPortal(
    <AnimatePresence>{open && <WhatsNewModal release={LATEST} onClose={() => (haptic.soft(), setOpen(false))} onAction={go} />}</AnimatePresence>,
    document.body,
  );
}

function WhatsNewModal({ release, onClose, onAction }: { release: Release; onClose: () => void; onAction: (a: ReleaseAction) => void }) {
  const [hero, ...rest] = release.items;
  return (
    <motion.div className="wn-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose}>
      <motion.div
        className="wn-card"
        role="dialog"
        aria-label="Что нового"
        initial={{ opacity: 0, scale: 0.86, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 12 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="wn-glow" />
        <button className="wn-close" onClick={onClose} aria-label="Закрыть">
          <X size={22} strokeWidth={2.6} />
        </button>

        <div className="wn-kicker">Новое в Emli</div>
        <motion.div
          className="wn-emoji"
          initial={{ scale: 0.4, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.08, type: "spring", stiffness: 300, damping: 14 }}
        >
          <motion.span animate={{ y: [0, -4, 0] }} transition={{ delay: 0.8, duration: 2.8, repeat: Infinity, ease: "easeInOut" }}>
            {hero.emoji}
          </motion.span>
        </motion.div>
        <div className="wn-title">{hero.title}</div>
        <div className="wn-text">{hero.text}</div>
        {hero.action && (
          <Tap className="btn btn-accent btn-block wn-btn" onClick={() => onAction(hero.action!.open)}>
            {hero.action.label}
          </Tap>
        )}

        {rest.length > 0 && (
          <div className="wn-more">
            {rest.map((it, i) => (
              <motion.button
                key={it.title}
                className="wn-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 + i * 0.06 }}
                onClick={() => it.action && onAction(it.action.open)}
              >
                <span className="wn-row-emoji">{it.emoji}</span>
                <span className="wn-row-body">
                  <b>{it.title}</b>
                  <span>{it.text}</span>
                </span>
                {it.action && <ChevronRight size={16} className="wn-row-go" />}
              </motion.button>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
