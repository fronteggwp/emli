// Иконка Emli на главном экране телефона (Telegram Bot API 8.0+)
import { useEffect, useState } from "react";
import { can, tg } from "./telegram";

export type HomeStatus = "unsupported" | "unknown" | "added" | "missed";

export function useHomeScreen() {
  const [status, setStatus] = useState<HomeStatus | null>(null);
  useEffect(() => {
    if (!tg || !can("8.0") || !tg.checkHomeScreenStatus) {
      setStatus("unsupported");
      return;
    }
    tg.checkHomeScreenStatus((s) => setStatus(s));
    const added = () => setStatus("added");
    tg.onEvent("homeScreenAdded", added);
    return () => tg?.offEvent("homeScreenAdded", added);
  }, []);
  return { status, add: () => tg?.addToHomeScreen?.() };
}
