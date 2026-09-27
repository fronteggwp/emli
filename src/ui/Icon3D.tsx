import type { CSSProperties } from "react";

export type Icon3DName =
  | "achievements" | "baking" | "barcode" | "breakfast" | "calendar" | "cheat-day" | "desserts" | "diary" | "dinner" | "drinks"
  | "favorite-foods" | "friends" | "goal" | "lunch" | "main-dishes" | "meal-plan" | "messages" | "personal-record" | "profile"
  | "progress" | "recipes" | "salads" | "side-dishes" | "snacks" | "soup" | "streak" | "water" | "weight" | "workouts";

export const visual = (kind: "icons" | "covers" | "backgrounds", name: string) => `${import.meta.env.BASE_URL}visuals/${kind}/${name}.webp`;

/** Объёмная иконка из набора Emli (прозрачный фон) */
export function Icon3D({ name, size = 32, className = "", style }: { name: Icon3DName; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <img
      src={visual("icons", name)}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      className={`icon3d ${className}`}
      style={{ width: size, height: size, ...style }}
    />
  );
}

/** Иконка приёма пищи */
export const MEAL_ICON: Icon3DName[] = ["breakfast", "lunch", "dinner", "snacks"];

/** Иконка категории рецептов */
export const CATEGORY_ICON: Record<string, Icon3DName> = {
  breakfast: "breakfast",
  main: "main-dishes",
  soup: "soup",
  salad: "salads",
  side: "side-dishes",
  snack: "snacks",
  dessert: "desserts",
  drink: "drinks",
};
