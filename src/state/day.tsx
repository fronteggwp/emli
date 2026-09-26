import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { todayKey } from "@/lib/dates";

const Ctx = createContext<{ day: string; setDay: (d: string) => void }>({ day: todayKey(), setDay: () => {} });

export const useDay = () => useContext(Ctx);

export function DayProvider({ children }: { children: ReactNode }) {
  const [day, setDay] = useState(todayKey());
  // Если приложение висело открытым через полночь — переключаемся на новый день
  useEffect(() => {
    let current = todayKey();
    const id = setInterval(() => {
      const now = todayKey();
      if (now !== current) {
        setDay((d) => (d === current ? now : d));
        current = now;
      }
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return <Ctx.Provider value={{ day, setDay }}>{children}</Ctx.Provider>;
}
