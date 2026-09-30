import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { cloudGet, cloudSet, haptic } from "@/lib/telegram";
import { LATEST, type Release, type ReleaseAction } from "@/data/releases";
import { PhotoFoodSheet } from "@/sheets/PhotoFood";
import { WaistScreen } from "@/pages/Waist";
import { Tap } from "./Tap";
import "./whatsnew.css";

const KEY = "seen_release";

/**
 * После обновления один раз показывает «Что нового». Отметка «видел» — в облаке Telegram (общая для всех
 * устройств) и в localStorage. Новый пользователь (только что прошёл онбординг) видит всё впервые — ему не показываем.
 */
export function WhatsNewWatcher({ fresh }: { fresh: boolean }) {
  const nav = useNav();
  const uid = useUid();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const key = `${KEY}_${uid.slice(0, 8)}`;
    if (fresh) {
      cloudSet(key, LATEST.id);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const seen = await cloudGet(key);
      if (!alive || seen === LATEST.id) return;
      cloudSet(key, LATEST.id);
      nav.sheet(<WhatsNewSheet release={LATEST} />);
    }, 1200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [fresh, nav, uid]);
  return null;
}

export function WhatsNewSheet({ release }: { release: Release }) {
  const layer = useLayer();
  const nav = useNav();
  const [hero, ...rest] = release.items;

  const open = (a: ReleaseAction) => {
    haptic.medium();
    layer.close();
    setTimeout(() => {
      if (a === "receipt") nav.sheet(<PhotoFoodSheet mode="receipt" />, { full: true });
      else if (a === "photo") nav.sheet(<PhotoFoodSheet mode="quick" />, { full: true });
      else if (a === "waist") nav.push(<WaistScreen />);
    }, 250);
  };

  return (
    <div className="wn">
      <div className="wn-glow" />
      <motion.div className="wn-badge" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Sparkles size={13} /> Новое в Emli · {release.date}
      </motion.div>

      <motion.div className="wn-hero" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.12, type: "spring", stiffness: 260, damping: 24 }}>
        <motion.div
          className="wn-hero-emoji"
          initial={{ rotate: -12, scale: 0.6 }}
          animate={{ rotate: [-12, 6, 0], scale: [0.6, 1.1, 1], y: [0, 0, 0] }}
          transition={{ delay: 0.2, duration: 0.7, ease: "easeOut" }}
        >
          <motion.span animate={{ y: [0, -5, 0] }} transition={{ delay: 1, duration: 3, repeat: Infinity, ease: "easeInOut" }}>
            {hero.emoji}
          </motion.span>
        </motion.div>
        <div className="wn-hero-title">{hero.title}</div>
        <div className="wn-hero-text">{hero.text}</div>
        {hero.action && (
          <Tap className="btn btn-accent btn-block wn-hero-btn" onClick={() => open(hero.action!.open)}>
            {hero.action.label}
          </Tap>
        )}
      </motion.div>

      {rest.length > 0 && (
        <div className="wn-list">
          <div className="wn-list-title">А ещё</div>
          {rest.map((it, i) => (
            <motion.div
              key={it.title}
              className="wn-item"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.08, type: "spring", stiffness: 320, damping: 28 }}
            >
              <span className="wn-item-emoji">{it.emoji}</span>
              <span className="wn-item-body">
                <b>{it.title}</b>
                <span>{it.text}</span>
                {it.action && (
                  <Tap className="wn-item-link" onClick={() => open(it.action!.open)}>
                    {it.action.label} →
                  </Tap>
                )}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      <div className="sheet-foot">
        <Tap className="btn btn-block" onClick={() => (haptic.soft(), layer.close())}>
          Круто, понятно
        </Tap>
      </div>
    </div>
  );
}
