import { useId } from "react";
import { motion } from "motion/react";

/** Логотип Emli: кольцо-прогресс с разрывом */
export function Logo({ size = 64, animated = false }: { size?: number; animated?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      initial={animated ? { rotate: -120, scale: 0.8, opacity: 0 } : false}
      animate={{ rotate: 0, scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 160, damping: 18 }}
    >
      <defs>
        <linearGradient id={`lg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c8cff" />
          <stop offset="55%" stopColor="#b388ff" />
          <stop offset="100%" stopColor="#ff7a5c" />
        </linearGradient>
      </defs>
      <motion.circle
        cx="32"
        cy="32"
        r="22"
        fill="none"
        stroke={`url(#lg${id})`}
        strokeWidth="11"
        strokeLinecap="round"
        style={{ rotate: -90, originX: "50%", originY: "50%" }}
        initial={animated ? { pathLength: 0 } : { pathLength: 0.78 }}
        animate={animated ? { pathLength: [0, 0.78, 0.78] } : { pathLength: 0.78 }}
        transition={animated ? { duration: 1.6, times: [0, 0.6, 1], ease: [0.16, 1, 0.3, 1] } : undefined}
      />
      <motion.circle
        cx="18"
        cy="15"
        r="5.5"
        fill="#ff7a5c"
        initial={animated ? { scale: 0 } : false}
        animate={{ scale: 1 }}
        transition={{ delay: animated ? 0.8 : 0, type: "spring", stiffness: 400, damping: 14 }}
      />
    </motion.svg>
  );
}
