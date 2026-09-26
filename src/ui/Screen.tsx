import type { ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
import { useLayer } from "@/nav/Nav";
import { inTelegram } from "@/lib/telegram";

/** Полноэкранный вложенный экран со своей шапкой */
export function Screen({ title, right, children }: { title?: ReactNode; right?: ReactNode; children: ReactNode }) {
  const { close } = useLayer();
  return (
    <div className="screen-scroll">
      <div className="screen-head">
        {!inTelegram ? (
          <button className="icon-btn" onClick={close} aria-label="Назад">
            <ChevronLeft size={22} />
          </button>
        ) : (
          <div style={{ width: 40 }} />
        )}
        <h1>{title}</h1>
        {right ?? <div style={{ width: 40 }} />}
      </div>
      <div className="screen-body">{children}</div>
    </div>
  );
}

/** Шапка шторки: заголовок и крестик; за неё можно тянуть шторку вниз */
export function SheetHeader({ title, left, right }: { title?: ReactNode; left?: ReactNode; right?: ReactNode }) {
  const { close } = useLayer();
  return (
    <div className="sheet-head" data-sheet-drag>
      {left ?? (
        <button className="icon-btn" onClick={close} aria-label="Закрыть">
          <X size={20} />
        </button>
      )}
      <h2>{title}</h2>
      {right ?? <div style={{ width: 38 }} />}
    </div>
  );
}
