export type Macros = { kcal: number; protein: number; fat: number; carbs: number };

export type Profile = {
  id: string;
  username: string | null;
  first_name: string;
  last_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_private: boolean;
  show_weight: boolean;
  last_seen: string | null;
  created_at: string;
};

/** Краткие данные автора/собеседника */
export type Person = Pick<Profile, "id" | "username" | "first_name" | "last_name" | "avatar_url"> &
  Partial<Pick<Profile, "bio" | "is_private" | "last_seen">>;

export type Post = {
  id: string;
  author_id: string;
  text: string | null;
  image_url: string | null;
  attachment: PostAttachment | null;
  visibility: "public" | "friends";
  like_count: number;
  comment_count: number;
  created_at: string;
  liked: boolean;
  author: Person;
};

export type PostAttachment =
  | { type: "day"; day: string; kcal: number; protein: number; fat: number; carbs: number; target: number }
  | { type: "weight"; change: number; days: number; current?: number | null }
  | { type: "streak"; days: number }
  | {
      type: "workout";
      name: string;
      duration: number;
      volume: number;
      sets: number;
      kcal: number;
      prs: number;
      muscles: string[];
      /** нагрузка по мышцам 0..1 — для мини-схемы */
      load?: Record<string, number>;
      /** лучшие подходы: название и «80 × 5» */
      top?: { n: string; v: string; pr?: boolean }[];
    };

export type Comment = { id: string; post_id: string; author_id: string; text: string; created_at: string; author?: Person };

export type Notice = {
  id: number;
  actor_id: string;
  kind: "friend_request" | "friend_accept" | "like" | "comment" | "challenge" | "plan";
  post_id: string | null;
  challenge_id?: string | null;
  plan_id?: string | null;
  preview: string | null;
  created_at: string;
  read_at: string | null;
};

export type Conversation = {
  id: string;
  other_id: string;
  last_message: string | null;
  last_message_at: string;
  last_sender: string | null;
  other_read_at: string | null;
  unread: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string | null;
  image_url: string | null;
  created_at: string;
  /** Только на устройстве: отправка не удалась — можно повторить */
  failed?: boolean;
};

export type Friendship = { requester: string; addressee: string; status: "pending" | "accepted"; created_at: string };

export type PublicStats = {
  hidden: boolean;
  streak?: number;
  logged_days?: number;
  friends?: number;
  posts?: number;
  weight_change_30?: number | null;
};

export type Sex = "male" | "female";

export type Settings = {
  user_id: string;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  activity: number | null;
  active_program?: string | null;
  program_started?: string | null;
  last_checkin?: string | null;
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

/** Каких БЖУ нет в источнике (Open Food Facts) — это «неизвестно», а не «0 г» */
export type MissingMacro = "protein" | "fat" | "carbs";

/** Продукт, который ещё не сохранён в базе (например, из Open Food Facts) */
export type FoodDraft = Omit<Food, "id" | "owner_id"> & { id?: string; owner_id?: string | null; missing?: MissingMacro[] };

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
  uses?: number;
};
