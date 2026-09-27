import { Camera, PenLine, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { haptic } from "@/lib/telegram";
import { Icon3D } from "./Icon3D";
import { Tap } from "./Tap";

/** Большая плитка «Еда по фото» с двумя режимами: просто фото и фото + подсказка */
export function PhotoBanner({ onOpen }: { onOpen: (mode: "quick" | "hint") => void }) {
  return (
    <div className="photo-banner">
      <Tap className="photo-banner-main" scale={0.98} onClick={() => (haptic.medium(), onOpen("quick"))}>
        <span className="photo-banner-text">
          <span className="photo-banner-badge">
            <Sparkles size={11} /> ИИ
          </span>
          <b>Сфоткай еду</b>
          <span>Распознаю продукты и граммы, посчитаю КБЖУ</span>
        </span>
        <motion.span className="photo-banner-art" animate={{ y: [0, -4, 0], rotate: [0, -3, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
          <Icon3D name="lunch" size={78} />
          <span className="photo-banner-cam">
            <Camera size={16} />
          </span>
        </motion.span>
      </Tap>
      <Tap className="photo-banner-hint" scale={0.97} onClick={() => (haptic.tap(), onOpen("hint"))}>
        <PenLine size={15} /> Фото + подсказка
      </Tap>
    </div>
  );
}
