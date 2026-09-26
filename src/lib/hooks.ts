import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Разбор числа из поля ввода: принимает и запятую, и точку */
export const parseNum = (s: string) => {
  const n = parseFloat(s.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};
