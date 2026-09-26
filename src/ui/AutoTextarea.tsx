import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/** Поле, которое растёт по мере ввода (до maxRows строк) */
export function AutoTextarea({ maxRows = 6, value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows + 20)}px`;
  }, [value, maxRows]);
  return <textarea ref={ref} rows={1} value={value} {...props} />;
}
