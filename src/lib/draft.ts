// Черновики форм на устройстве: случайно закрыл окно — текст не потерян
import { useEffect, useRef, useState } from "react";

export function useDraft<T>(key: string | null, initial: T): [T, (v: T | ((p: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    if (!key) return initial;
    try {
      const raw = localStorage.getItem(`emli-draft:${key}`);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  const cleared = useRef(false);
  useEffect(() => {
    if (!key || cleared.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(`emli-draft:${key}`, JSON.stringify(value));
      } catch {
        /* хранилище недоступно */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [key, value]);
  const clear = () => {
    cleared.current = true;
    if (key)
      try {
        localStorage.removeItem(`emli-draft:${key}`);
      } catch {
        /* ничего */
      }
  };
  return [value, setValue, clear];
}
