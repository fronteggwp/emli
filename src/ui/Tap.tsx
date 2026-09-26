import type { ButtonHTMLAttributes, CSSProperties } from "react";

/** Кнопка с «пружинным» нажатием на чистом CSS — срабатывает мгновенно, без JS в кадре */
export function Tap({
  scale = 0.96,
  className = "",
  style,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { scale?: number }) {
  return <button type={type} className={`tap ${className}`} style={{ ...style, ["--tap-scale" as string]: scale } as CSSProperties} {...props} />;
}
