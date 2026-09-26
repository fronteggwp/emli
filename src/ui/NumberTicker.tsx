import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";

/** Число, которое плавно «докручивается» до нового значения */
export function NumberTicker({
  value,
  digits = 0,
  duration = 0.9,
  className = "num",
}: {
  value: number;
  digits?: number;
  duration?: number;
  className?: string;
}) {
  const first = useRef(true);
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) =>
    v.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  );
  useEffect(() => {
    const c = animate(mv, value, { duration: first.current ? duration * 1.2 : duration, ease: [0.16, 1, 0.3, 1] });
    first.current = false;
    return () => c.stop();
  }, [value, duration, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}
