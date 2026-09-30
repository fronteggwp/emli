// Что нового в Emli: показываем один раз после обновления. Только новые возможности — исправления ошибок сюда не пишем.
// Новый выпуск — добавить запись В НАЧАЛО списка с новым id (дата выпуска). Первый пункт — главный, тексты короткие.

export type ReleaseAction = "receipt" | "waist" | "photo";
export type ReleaseItem = { emoji: string; title: string; text: string; action?: { label: string; open: ReleaseAction } };
export type Release = { id: string; date: string; items: ReleaseItem[] };

export const RELEASES: Release[] = [
  {
    id: "2026-09-30.2",
    date: "30 сентября",
    items: [
      {
        emoji: "🧾",
        title: "Сканер чеков",
        text: "Сфоткай чек — найду продукты и КБЖУ, а купленное отмечу в списке покупок.",
        action: { label: "Сфоткать чек", open: "receipt" },
      },
      { emoji: "🔎", title: "Фото еды точнее", text: "КБЖУ по продуктам из базы", action: { label: "Открыть", open: "photo" } },
      { emoji: "📏", title: "Замеры талии", text: "График талии рядом с весом", action: { label: "Открыть", open: "waist" } },
    ],
  },
];

export const LATEST = RELEASES[0];
