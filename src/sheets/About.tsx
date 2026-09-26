import { SheetHeader } from "@/ui/Screen";
import { Logo } from "@/ui/Logo";

export function AboutSheet() {
  return (
    <>
      <SheetHeader title="О приложении" />
      <div className="sheet-body">
        <div style={{ display: "grid", placeItems: "center", padding: "8px 0 16px" }}>
          <Logo size={64} />
          <div className="page-title" style={{ fontSize: 22, marginTop: 12 }}>
            Emli
          </div>
          <div className="faint" style={{ fontSize: 13 }}>
            версия 0.1
          </div>
        </div>
        <div className="stack explain">
          <p style={{ margin: 0 }}>
            <b>Калории и БЖУ.</b> Стартовая норма считается по формуле Миффлина — Сан-Жеора с учётом активности и выбранного темпа. Белок — 1,6–1,8 г на кг веса, жиры — 25–35% калорий, остальное — углеводы.
          </p>
          <p style={{ margin: 0 }}>
            <b>Тренд веса.</b> Экспоненциальное сглаживание показаний весов: убирает случайные скачки из‑за воды и еды.
          </p>
          <p style={{ margin: 0 }}>
            <b>Адаптивный расход.</b> Emli сравнивает съеденное с изменением тренда веса и уточняет, сколько ты тратишь на самом деле.
          </p>
          <p style={{ margin: 0 }}>
            <b>Продукты.</b> Базовая база составлена по справочным значениям; упакованные продукты — из открытой базы Open Food Facts. Приложение не заменяет консультацию врача.
          </p>
        </div>
      </div>
    </>
  );
}
