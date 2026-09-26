import { motion, type HTMLMotionProps } from "motion/react";

/** Кнопка с «пружинным» нажатием */
export function Tap({ scale = 0.96, ...props }: HTMLMotionProps<"button"> & { scale?: number }) {
  return <motion.button whileTap={{ scale }} transition={{ type: "spring", stiffness: 700, damping: 30 }} {...props} />;
}
