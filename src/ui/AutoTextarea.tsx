import { useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/**
 * Поле, которое растёт по мере ввода (до maxRows строк).
 * focusDelay — поставить фокус после анимации шторки, без прокрутки страницы (иначе iOS всё сдвигает).
 */
export function AutoTextarea({
  maxRows = 6,
  value,
  focusDelay,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number; focusDelay?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows + 20)}px`;
  }, [value, maxRows]);
  useEffect(() => {
    if (focusDelay == null) return;
    const t = setTimeout(() => ref.current?.focus({ preventScroll: true }), focusDelay);
    return () => clearTimeout(t);
  }, [focusDelay]);
  return <textarea ref={ref} rows={1} value={value} {...props} />;
}
