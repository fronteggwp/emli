export type Macros = { kcal: number; protein: number; fat: number; carbs: number };

export type Profile = {
  id: string;
  tg_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_private: boolean;
  created_at: string;
};

export type Sex = "male" | "female";

export type Settings = {
  user_id: string;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  activity: number | null;
  onboarded: boolean;
};

export type Food = Macros & {
  id: string;
  owner_id: string | null;
  name: string;
  brand: string | null;
  barcode: string | null;
  category: string | null;
  serving_g: number | null;
  serving_name: string | null;
  source: "system" | "off" | "user";
};

/** Продукт, который ещё не сохранён в базе (например, из Open Food Facts) */
export type FoodDraft = Omit<Food, "id" | "owner_id"> & { id?: string; owner_id?: string | null };

export type Meal = 0 | 1 | 2 | 3;

export type Entry = Macros & {
  id: string;
  user_id: string;
  day: string;
  meal: Meal;
  food_id: string | null;
  name: string;
  brand: string | null;
  grams: number | null;
  created_at: string;
};

export type Weight = { day: string; weight_kg: number; body_fat: number | null };

export type GoalKind = "lose" | "maintain" | "gain";

export type Goal = {
  id: string;
  kind: GoalKind;
  start_date: string;
  start_weight: number;
  target_weight: number | null;
  rate_kg_week: number;
  created_at: string;
};

export type Targets = {
  id: string;
  start_date: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  tdee: number | null;
  created_at: string;
};

export type DayTotal = Macros & { day: string; entries: number };

export type RecentFood = Macros & {
  food_id: string | null;
  name: string;
  brand: string | null;
  grams: number | null;
  last_used: string;
};
