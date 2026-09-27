// Готовые программы тренировок. Упражнения — id из каталога (free-exercise-db).
import { FAMOUS } from "./famousPrograms";

// reps: диапазон повторов («8-12»), «макс» — до отказа, «30-45 с» — на время.

export type ProgramExercise = { ex: string; sets: number; reps: string; rest: number; note?: string };
export type ProgramDay = { title: string; focus: string; exercises: ProgramExercise[] };
export type Program = {
  key: string;
  title: string;
  subtitle: string;
  description: string;
  level: "beginner" | "intermediate" | "expert";
  goal: "muscle" | "strength" | "fat" | "tone";
  place: "gym" | "home" | "any";
  perWeek: number;
  minutes: number;
  emoji: string;
  colors: [string, string];
  schedule: string;
  days: ProgramDay[];
  tips: string[];
  /** Для знаменитых программ: автор, первоисточник и правила прогрессии */
  author?: string;
  source?: string;
  progression?: string[];
};

const X = (ex: string, sets: number, reps: string, rest = 90, note?: string): ProgramExercise => ({ ex, sets, reps, rest, note });

const BASIC: Program[] = [
  {
    key: "start-fullbody",
    title: "Старт: всё тело",
    subtitle: "Первые 2–3 месяца в зале",
    description:
      "Идеальная программа для новичков: каждое занятие прорабатывает всё тело базовыми движениями. Чередуй тренировки A и B через день — мышцы успевают восстановиться, а техника закрепляется быстрее.",
    level: "beginner",
    goal: "muscle",
    place: "gym",
    perWeek: 3,
    minutes: 50,
    emoji: "🌱",
    colors: ["#4fd18b", "#2aa3a3"],
    schedule: "Пн · Ср · Пт — чередуя A и B",
    days: [
      {
        title: "Тренировка A",
        focus: "Ноги · грудь · спина",
        exercises: [
          X("Barbell_Full_Squat", 3, "8-10", 150, "Начни с пустого грифа и добавляй по 2,5 кг"),
          X("Barbell_Bench_Press_-_Medium_Grip", 3, "8-10", 120),
          X("Seated_Cable_Rows", 3, "10-12", 90),
          X("Dumbbell_Shoulder_Press", 2, "10-12", 90),
          X("Plank", 3, "30-45 с", 60),
        ],
      },
      {
        title: "Тренировка B",
        focus: "Задняя цепь · спина · руки",
        exercises: [
          X("Romanian_Deadlift", 3, "8-10", 150, "Спина прямая, гриф скользит по бёдрам"),
          X("Wide-Grip_Lat_Pulldown", 3, "10-12", 90),
          X("Incline_Dumbbell_Press", 3, "10-12", 90),
          X("Leg_Press", 3, "10-12", 120),
          X("Dumbbell_Bicep_Curl", 2, "12", 60),
          X("Triceps_Pushdown", 2, "12", 60),
        ],
      },
    ],
    tips: [
      "Техника важнее веса: первые 2 недели работай с весами, которые поднимаешь на 2–3 повтора больше, чем нужно",
      "Сделал верх диапазона во всех подходах — в следующий раз добавь вес",
      "Спи 7–9 часов и ешь достаточно белка — рост происходит на отдыхе",
    ],
  },
  {
    key: "strength-5x5",
    title: "StrongLifts 5×5",
    subtitle: "Классика силового тренинга",
    author: "Мехди Хадим",
    source: "https://stronglifts.com/5x5/",
    progression: [
      "Каждую тренировку добавляй 2,5 кг в приседе, жимах и тяге штанги; 5 кг — в становой",
      "Не сделал 5×5 — повтори тот же вес. Три неудачи подряд — сбрось 10% и снова расти",
    ],
    description:
      "Три тяжёлых базовых упражнения за тренировку, 5 подходов по 5 повторов. Каждую тренировку вес растёт на 2,5 кг — простая и очень эффективная схема для роста силы и массы.",
    level: "intermediate",
    goal: "strength",
    place: "gym",
    perWeek: 3,
    minutes: 60,
    emoji: "🏋️",
    colors: ["#ff7a5c", "#ff3d6e"],
    schedule: "Пн · Ср · Пт — чередуя A и B",
    days: [
      {
        title: "Тренировка A",
        focus: "Присед · жим лёжа · тяга",
        exercises: [
          X("Barbell_Squat", 5, "5", 180),
          X("Barbell_Bench_Press_-_Medium_Grip", 5, "5", 180),
          X("Bent_Over_Barbell_Row", 5, "5", 150),
        ],
      },
      {
        title: "Тренировка B",
        focus: "Присед · жим стоя · становая",
        exercises: [
          X("Barbell_Squat", 5, "5", 180),
          X("Standing_Military_Press", 5, "5", 180),
          X("Barbell_Deadlift", 1, "5", 180, "Один тяжёлый рабочий подход после разминки"),
        ],
      },
    ],
    tips: [
      "Разминайся: 2–3 лёгких подхода перед рабочими",
      "Не смог сделать 5×5 три тренировки подряд — снизь вес на 10% и снова расти",
      "Отдыхай между подходами 3–5 минут — это нормально для силовой работы",
    ],
  },
  {
    key: "upper-lower",
    title: "Верх / Низ",
    subtitle: "4 тренировки: сила + объём",
    description:
      "Сбалансированный сплит для тех, кто уже освоил базу. Два дня на верх и два на низ: в первой половине недели — тяжелее и меньше повторов, во второй — объём для роста мышц.",
    level: "intermediate",
    goal: "muscle",
    place: "gym",
    perWeek: 4,
    minutes: 65,
    emoji: "⚖️",
    colors: ["#7c8cff", "#5b4cff"],
    schedule: "Пн верх · Вт низ · Чт верх · Пт низ",
    days: [
      {
        title: "Верх A — сила",
        focus: "Грудь · спина · плечи",
        exercises: [
          X("Barbell_Bench_Press_-_Medium_Grip", 4, "6-8", 150),
          X("Bent_Over_Barbell_Row", 4, "6-8", 150),
          X("Standing_Military_Press", 3, "8", 120),
          X("Pullups", 3, "6-10", 120),
          X("Barbell_Curl", 2, "10", 60),
          X("EZ-Bar_Skullcrusher", 2, "10", 60),
        ],
      },
      {
        title: "Низ A — сила",
        focus: "Квадрицепс · задняя поверхность",
        exercises: [
          X("Barbell_Squat", 4, "6-8", 180),
          X("Romanian_Deadlift", 3, "8-10", 150),
          X("Leg_Press", 3, "10-12", 120),
          X("Lying_Leg_Curls", 3, "12", 75),
          X("Seated_Calf_Raise", 4, "12-15", 60),
          X("Hanging_Leg_Raise", 3, "10-12", 60),
        ],
      },
      {
        title: "Верх B — объём",
        focus: "Верх груди · ширина спины · дельты",
        exercises: [
          X("Incline_Dumbbell_Press", 4, "10-12", 90),
          X("Wide-Grip_Lat_Pulldown", 4, "10-12", 90),
          X("One-Arm_Dumbbell_Row", 3, "10-12", 75),
          X("Side_Lateral_Raise", 3, "12-15", 60),
          X("Face_Pull", 3, "15", 60),
          X("Alternate_Hammer_Curl", 3, "12", 60),
          X("Triceps_Pushdown_-_Rope_Attachment", 3, "12", 60),
        ],
      },
      {
        title: "Низ B — объём",
        focus: "Ягодицы · бицепс бедра · пресс",
        exercises: [
          X("Barbell_Deadlift", 3, "5", 180),
          X("Split_Squat_with_Dumbbells", 3, "10", 90, "На каждую ногу"),
          X("Leg_Extensions", 3, "12-15", 60),
          X("Seated_Leg_Curl", 3, "12", 60),
          X("Barbell_Hip_Thrust", 3, "10", 90),
          X("Cable_Crunch", 3, "15", 60),
        ],
      },
    ],
    tips: ["Во время силовых дней держи 1–2 повтора в запасе", "Если восстановление хромает — убери по одному подходу в каждом упражнении"],
  },
  {
    key: "ppl",
    title: "Push / Pull / Legs",
    subtitle: "Жимы · тяги · ноги",
    description:
      "Популярнейший сплит у опытных атлетов: жимовые мышцы, тяговые и ноги в отдельные дни. Можно заниматься 3 раза в неделю (один круг) или 6 раз (два круга) для максимального роста.",
    level: "intermediate",
    goal: "muscle",
    place: "gym",
    perWeek: 6,
    minutes: 70,
    emoji: "🔥",
    colors: ["#ffb547", "#ff6a3d"],
    schedule: "Push → Pull → Legs → повтор (3 или 6 дней)",
    days: [
      {
        title: "Push — жимы",
        focus: "Грудь · плечи · трицепс",
        exercises: [
          X("Barbell_Bench_Press_-_Medium_Grip", 4, "6-8", 150),
          X("Incline_Dumbbell_Press", 3, "8-10", 120),
          X("Dumbbell_Shoulder_Press", 3, "8-10", 90),
          X("Side_Lateral_Raise", 4, "12-15", 60),
          X("Cable_Crossover", 3, "12-15", 60),
          X("Triceps_Pushdown_-_Rope_Attachment", 3, "10-12", 60),
          X("Cable_Rope_Overhead_Triceps_Extension", 3, "12", 60),
        ],
      },
      {
        title: "Pull — тяги",
        focus: "Спина · задние дельты · бицепс",
        exercises: [
          X("Pullups", 4, "6-10", 120),
          X("Bent_Over_Barbell_Row", 3, "8-10", 120),
          X("Seated_Cable_Rows", 3, "10-12", 90),
          X("Face_Pull", 3, "15", 60),
          X("Barbell_Curl", 3, "8-10", 75),
          X("Alternate_Hammer_Curl", 3, "12", 60),
          X("Barbell_Shrug", 3, "12", 60),
        ],
      },
      {
        title: "Legs — ноги",
        focus: "Квадрицепс · ягодицы · икры",
        exercises: [
          X("Barbell_Squat", 4, "6-8", 180),
          X("Romanian_Deadlift", 3, "8-10", 150),
          X("Leg_Press", 3, "10-12", 120),
          X("Lying_Leg_Curls", 3, "12", 75),
          X("Leg_Extensions", 3, "15", 60),
          X("Seated_Calf_Raise", 4, "12-15", 60),
        ],
      },
    ],
    tips: ["При 6 тренировках в неделю следи за сном и питанием", "Меняй первое упражнение каждые 6–8 недель, чтобы не застаиваться"],
  },
  {
    key: "bro-split",
    title: "Классический сплит",
    subtitle: "Одна группа мышц — один день",
    description:
      "Старый добрый «бодибилдерский» сплит: каждая группа получает свою тренировку с большим объёмом. Отлично подходит, если любишь хорошенько «забить» мышцу.",
    level: "intermediate",
    goal: "muscle",
    place: "gym",
    perWeek: 5,
    minutes: 60,
    emoji: "🦍",
    colors: ["#b388ff", "#ff5e9e"],
    schedule: "Пн грудь · Вт спина · Ср ноги · Чт плечи · Пт руки",
    days: [
      {
        title: "Грудь",
        focus: "Грудь · немного трицепса",
        exercises: [
          X("Barbell_Bench_Press_-_Medium_Grip", 4, "6-10", 150),
          X("Incline_Dumbbell_Press", 4, "8-12", 90),
          X("Dips_-_Chest_Version", 3, "8-12", 90),
          X("Dumbbell_Flyes", 3, "12", 60),
          X("Cable_Crossover", 3, "15", 60),
        ],
      },
      {
        title: "Спина",
        focus: "Ширина и толщина спины",
        exercises: [
          X("Barbell_Deadlift", 3, "5-6", 180),
          X("Pullups", 4, "6-10", 120),
          X("Bent_Over_Barbell_Row", 4, "8-10", 120),
          X("Wide-Grip_Lat_Pulldown", 3, "10-12", 90),
          X("Seated_Cable_Rows", 3, "12", 75),
        ],
      },
      {
        title: "Ноги",
        focus: "Квадрицепс · бицепс бедра · икры",
        exercises: [
          X("Barbell_Squat", 4, "6-10", 180),
          X("Leg_Press", 4, "10-12", 120),
          X("Romanian_Deadlift", 3, "10", 120),
          X("Leg_Extensions", 3, "12-15", 60),
          X("Lying_Leg_Curls", 3, "12-15", 60),
          X("Seated_Calf_Raise", 4, "15", 60),
        ],
      },
      {
        title: "Плечи",
        focus: "Все три пучка дельт · трапеция",
        exercises: [
          X("Standing_Military_Press", 4, "6-10", 150),
          X("Arnold_Dumbbell_Press", 3, "10", 90),
          X("Side_Lateral_Raise", 4, "12-15", 60),
          X("Reverse_Flyes", 3, "15", 60),
          X("Upright_Barbell_Row", 3, "10-12", 75),
          X("Dumbbell_Shrug", 3, "12", 60),
        ],
      },
      {
        title: "Руки",
        focus: "Бицепс · трицепс · предплечья",
        exercises: [
          X("Close-Grip_Barbell_Bench_Press", 3, "8-10", 120),
          X("Barbell_Curl", 3, "8-10", 90),
          X("EZ-Bar_Skullcrusher", 3, "10-12", 75),
          X("Preacher_Curl", 3, "10-12", 75),
          X("Triceps_Pushdown_-_Rope_Attachment", 3, "12-15", 60),
          X("Alternate_Hammer_Curl", 3, "12", 60),
        ],
      },
    ],
    tips: ["Каждую группу нагружаешь раз в неделю — работай интенсивно", "Если спина или ноги отстают, поставь их в начало недели"],
  },
  {
    key: "home-dumbbells",
    title: "Дома с гантелями",
    subtitle: "Нужны только гантели и скамья/пол",
    description:
      "Полноценная тренировка всего тела дома. Разборные гантели и немного свободного места — и ты не хуже, чем в зале. Прогрессируй, добавляя вес или повторы.",
    level: "beginner",
    goal: "tone",
    place: "home",
    perWeek: 3,
    minutes: 40,
    emoji: "🏠",
    colors: ["#5cc8ff", "#4f7dff"],
    schedule: "Через день, чередуя A и B",
    days: [
      {
        title: "Тренировка A",
        focus: "Всё тело",
        exercises: [
          X("Goblet_Squat", 4, "10-12", 90),
          X("Dumbbell_Bench_Press", 4, "10-12", 90, "Можно на полу, если нет скамьи"),
          X("One-Arm_Dumbbell_Row", 4, "10-12", 75),
          X("Dumbbell_Shoulder_Press", 3, "10-12", 75),
          X("Dumbbell_Bicep_Curl", 3, "12", 60),
          X("Plank", 3, "30-60 с", 45),
        ],
      },
      {
        title: "Тренировка B",
        focus: "Всё тело",
        exercises: [
          X("Split_Squat_with_Dumbbells", 3, "10-12", 75, "На каждую ногу"),
          X("Stiff-Legged_Dumbbell_Deadlift", 3, "10-12", 90),
          X("Pushups", 3, "макс", 75),
          X("Bent_Over_Two-Dumbbell_Row", 3, "12", 75),
          X("Side_Lateral_Raise", 3, "15", 60),
          X("Tricep_Dumbbell_Kickback", 3, "12", 60),
          X("Russian_Twist", 3, "20", 45),
        ],
      },
    ],
    tips: ["Нет тяжёлых гантелей — замедляй опускание до 3 секунд", "Ставь рекорды по повторам: +1 повтор — это тоже прогресс"],
  },
  {
    key: "calisthenics",
    title: "Свой вес",
    subtitle: "Турник, брусья и пол",
    description:
      "Калистеника: сила и рельеф без железа. Всё, что нужно, — турник и брусья во дворе или дома. Когда станет легко — добавляй повторы, замедляй темп и переходи к сложным вариантам.",
    level: "beginner",
    goal: "tone",
    place: "any",
    perWeek: 3,
    minutes: 40,
    emoji: "🤸",
    colors: ["#ffc247", "#ff8a3d"],
    schedule: "Через день, чередуя A и B",
    days: [
      {
        title: "Тренировка A",
        focus: "Жимы · тяги · ноги",
        exercises: [
          X("Pushups", 4, "8-15", 75),
          X("Pullups", 4, "4-8", 120, "Не получается — подтягивания с резинкой"),
          X("Bodyweight_Squat", 4, "20", 60),
          X("Dips_-_Triceps_Version", 3, "8-12", 90),
          X("Hanging_Leg_Raise", 3, "8-12", 60),
          X("Plank", 3, "45-60 с", 45),
        ],
      },
      {
        title: "Тренировка B",
        focus: "Тяги · плечи · выносливость",
        exercises: [
          X("Inverted_Row", 4, "8-12", 75),
          X("Push-Ups_With_Feet_Elevated", 3, "8-12", 75),
          X("Bodyweight_Walking_Lunge", 3, "12", 60, "На каждую ногу"),
          X("Chin-Up", 3, "макс", 120),
          X("Butt_Lift_Bridge", 3, "15", 45),
          X("Mountain_Climbers", 3, "30 с", 45),
        ],
      },
    ],
    tips: ["Держи корпус напряжённым в каждом движении", "20+ отжиманий — пора переходить к отжиманиям с ногами на возвышении"],
  },
  {
    key: "glutes",
    title: "Ягодицы и ноги",
    subtitle: "Форма и сила нижней части тела",
    description:
      "Программа с акцентом на ягодичные мышцы: тяжёлые мосты, тяги и выпады плюс изоляция на отводящие. Три тренировки в неделю дают заметный результат уже через 6–8 недель.",
    level: "beginner",
    goal: "tone",
    place: "gym",
    perWeek: 3,
    minutes: 50,
    emoji: "🍑",
    colors: ["#ff8fb1", "#ff5e7e"],
    schedule: "Пн · Ср · Пт, чередуя A и B",
    days: [
      {
        title: "Тренировка A",
        focus: "Ягодицы · задняя поверхность",
        exercises: [
          X("Barbell_Hip_Thrust", 4, "8-12", 120, "Задержка 1 секунда в верхней точке"),
          X("Romanian_Deadlift", 3, "10", 120),
          X("Split_Squat_with_Dumbbells", 3, "10", 90, "Длинный шаг — больше работы ягодиц"),
          X("Thigh_Abductor", 3, "15-20", 60),
          X("Glute_Kickback", 3, "15", 60),
          X("Lying_Leg_Curls", 3, "12", 60),
        ],
      },
      {
        title: "Тренировка B",
        focus: "Ноги · ягодицы",
        exercises: [
          X("Goblet_Squat", 4, "10-12", 90),
          X("Barbell_Glute_Bridge", 3, "12", 90),
          X("Dumbbell_Step_Ups", 3, "10", 75, "На каждую ногу"),
          X("One-Legged_Cable_Kickback", 3, "15", 60),
          X("Pull_Through", 3, "12-15", 60),
          X("Thigh_Adductor", 3, "15", 60),
        ],
      },
    ],
    tips: ["Чувствуй ягодицы в каждом повторе — сожми их в верхней точке", "Прогрессируй в хип-трасте: это главный показатель роста"],
  },
  {
    key: "fatburn",
    title: "Жиросжигающая круговая",
    subtitle: "Много движения, мало отдыха",
    description:
      "Круговая тренировка: упражнения идут одно за другим с минимальным отдыхом. Пульс держится высоким, сжигается много калорий, а мышцы сохраняют тонус. Отлично дополняет дефицит калорий.",
    level: "beginner",
    goal: "fat",
    place: "any",
    perWeek: 3,
    minutes: 35,
    emoji: "⚡",
    colors: ["#ff5e7e", "#ffb547"],
    schedule: "3 раза в неделю, 3 круга",
    days: [
      {
        title: "Круг A",
        focus: "Всё тело · кардио",
        exercises: [
          X("Goblet_Squat", 3, "15", 30),
          X("Pushups", 3, "10-15", 30),
          X("One-Arm_Kettlebell_Swings", 3, "15", 30),
          X("Mountain_Climbers", 3, "30 с", 30),
          X("Dumbbell_Lunges", 3, "12", 30),
          X("Rope_Jumping", 3, "60 с", 60),
        ],
      },
      {
        title: "Круг B",
        focus: "Всё тело · кардио",
        exercises: [
          X("Dumbbell_Step_Ups", 3, "12", 30),
          X("Inverted_Row", 3, "10-12", 30),
          X("Freehand_Jump_Squat", 3, "12", 30),
          X("Star_Jump", 3, "15", 30),
          X("Plank", 3, "40 с", 30),
          X("Battling_Ropes", 3, "30 с", 60),
        ],
      },
    ],
    tips: ["Делай упражнения подряд, отдых — после целого круга", "Не гонись за весом: главное — темп и чистая техника"],
  },
  {
    key: "core",
    title: "Пресс и кор",
    subtitle: "15 минут в конце тренировки",
    description:
      "Короткий блок на мышцы пресса и стабилизаторы корпуса. Добавляй его в конце основной тренировки 2–3 раза в неделю. Сильный кор — это здоровая спина и рекорды в базовых упражнениях.",
    level: "beginner",
    goal: "tone",
    place: "any",
    perWeek: 3,
    minutes: 15,
    emoji: "🧱",
    colors: ["#4fd18b", "#7c8cff"],
    schedule: "2–3 раза в неделю после тренировки",
    days: [
      {
        title: "Кор",
        focus: "Прямая и косые мышцы · стабилизация",
        exercises: [
          X("Crunches", 3, "15-20", 30),
          X("Hanging_Leg_Raise", 3, "10-12", 45),
          X("Russian_Twist", 3, "20", 30),
          X("Plank", 3, "45-60 с", 30),
          X("Dead_Bug", 3, "12", 30),
          X("Side_Bridge", 2, "30 с", 30, "На каждую сторону"),
        ],
      },
    ],
    tips: ["Кубики видно при низком проценте жира — пресс тренируем, а живот убирает дефицит калорий"],
  },
  {
    key: "arms",
    title: "Руки и плечи",
    subtitle: "Спецпрограмма на объём рук",
    description:
      "Дополнительные 2 тренировки в неделю для тех, кто хочет большие руки и широкие плечи. Добавь к своей основной программе или используй как отдельные дни.",
    level: "intermediate",
    goal: "muscle",
    place: "gym",
    perWeek: 2,
    minutes: 45,
    emoji: "💪",
    colors: ["#7c8cff", "#ff7a5c"],
    schedule: "2 раза в неделю",
    days: [
      {
        title: "Руки A",
        focus: "Бицепс · трицепс",
        exercises: [
          X("Barbell_Curl", 4, "8-10", 75),
          X("Close-Grip_Barbell_Bench_Press", 4, "8-10", 90),
          X("Alternate_Incline_Dumbbell_Curl", 3, "10-12", 60),
          X("Cable_Rope_Overhead_Triceps_Extension", 3, "12", 60),
          X("Cable_Hammer_Curls_-_Rope_Attachment", 3, "12-15", 45),
          X("Triceps_Pushdown", 3, "15", 45),
        ],
      },
      {
        title: "Плечи + руки B",
        focus: "Дельты · суперсеты на руки",
        exercises: [
          X("Dumbbell_Shoulder_Press", 4, "8-10", 90),
          X("Side_Lateral_Raise", 4, "12-15", 45),
          X("Reverse_Flyes", 3, "15", 45),
          X("Preacher_Curl", 3, "10-12", 60),
          X("EZ-Bar_Skullcrusher", 3, "10-12", 60),
          X("Concentration_Curls", 2, "12", 45),
        ],
      },
    ],
    tips: ["Руки растут от тяжёлой базы — не бросай жимы и тяги ради изоляции"],
  },
];

export const PROGRAMS: Program[] = [...FAMOUS, ...BASIC];

export const GOAL_RU = { muscle: "Масса", strength: "Сила", fat: "Жиросжигание", tone: "Тонус" } as const;
export const PLACE_RU = { gym: "Зал", home: "Дом", any: "Где угодно" } as const;

export const programByKey = (key: string | null | undefined) => PROGRAMS.find((p) => p.key === key);

/** Разбор целевых повторов: «8-12» → [8, 12], «5» → [5, 5], «30-45 с» → секунды */
export function parseReps(reps: string): { min: number; max: number; timed: boolean; toFailure: boolean } {
  const timed = /с$/.test(reps.trim());
  const toFailure = reps.includes("макс");
  const nums = reps.match(/\d+/g)?.map(Number) ?? [];
  return { min: nums[0] ?? 0, max: nums[1] ?? nums[0] ?? 0, timed, toFailure };
}
