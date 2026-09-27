// Звуки интерфейса: синтезируются на лету (Web Audio), без файлов. Тихие и короткие —
// как у системных приложений. Уважают беззвучный режим iPhone (audioSession = ambient).

const KEY = "emli-sound";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let last = 0;

export function soundOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ничего */
  }
}

function ac() {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    // Звуки не должны перебивать музыку и играть в беззвучном режиме
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "ambient";
  } catch {
    /* старый браузер */
  }
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  return ctx;
}

/** Первое касание разблокирует звук (требование iOS) */
export function initSound() {
  const unlock = () => {
    const c = ac();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("touchend", unlock, { passive: true });
}

type Tone = { f: number; to?: number; d: number; at?: number; g?: number; type?: OscillatorType; attack?: number };

function play(tones: Tone[], minGap = 0) {
  if (!soundOn()) return;
  const c = ac();
  if (!c || !master || c.state !== "running") return;
  const now = performance.now();
  if (minGap && now - last < minGap) return;
  last = now;
  const t0 = c.currentTime + 0.005;
  for (const t of tones) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = t.type ?? "sine";
    const start = t0 + (t.at ?? 0);
    o.frequency.setValueAtTime(t.f, start);
    if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, start + t.d * 0.8);
    const peak = t.g ?? 0.1;
    const attack = t.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t.d);
    o.connect(g).connect(master);
    o.start(start);
    o.stop(start + t.d + 0.02);
  }
}

// Ноты
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568;

export const sfx = {
  /** Переключатели, чипы, вкладки — едва слышный щелчок */
  tick: () => play([{ f: 2400, d: 0.03, g: 0.035, type: "triangle" }], 35),
  /** Обычное нажатие */
  tap: () => play([{ f: 1300, to: 900, d: 0.045, g: 0.05, type: "triangle" }], 35),
  /** Открылась шторка / появилось что-то новое */
  pop: () => play([{ f: 420, to: 880, d: 0.09, g: 0.09 }], 60),
  /** Удаление, свайп */
  swipe: () => play([{ f: 700, to: 260, d: 0.12, g: 0.07, type: "triangle" }], 60),
  /** Тяжёлое действие */
  thump: () => play([{ f: 150, to: 80, d: 0.12, g: 0.16 }], 60),
  /** Готово: запись добавлена, сохранено */
  success: () =>
    play(
      [
        { f: E6, d: 0.12, g: 0.07 },
        { f: G6 * 1.335, d: 0.22, at: 0.075, g: 0.06 },
      ],
      80,
    ),
  /** Подход выполнен — короткий «дзынь» */
  set: () =>
    play(
      [
        { f: A5 * 1.5, d: 0.09, g: 0.07, type: "triangle" },
        { f: A5 * 2, d: 0.16, at: 0.05, g: 0.05 },
      ],
      60,
    ),
  /** Что-то не так */
  error: () =>
    play(
      [
        { f: 330, to: 260, d: 0.14, g: 0.08, type: "triangle" },
        { f: 260, to: 200, d: 0.18, at: 0.1, g: 0.08, type: "triangle" },
      ],
      120,
    ),
  /** Отдых закончился — мягкий колокольчик */
  bell: () =>
    play([
      { f: A5, d: 0.9, g: 0.12, attack: 0.003 },
      { f: A5 * 2.76, d: 0.5, g: 0.03 },
      { f: E6, d: 0.9, at: 0.18, g: 0.09 },
      { f: E6 * 2.76, d: 0.4, at: 0.18, g: 0.02 },
    ]),
  /** Достижение, рекорд — восходящее арпеджио с блеском */
  fanfare: () =>
    play([
      { f: C5, d: 0.35, g: 0.08, type: "triangle" },
      { f: E5, d: 0.35, at: 0.09, g: 0.08, type: "triangle" },
      { f: G5, d: 0.35, at: 0.18, g: 0.08, type: "triangle" },
      { f: C6, d: 0.8, at: 0.27, g: 0.1 },
      { f: E6, d: 0.7, at: 0.36, g: 0.05 },
      { f: G6, d: 0.6, at: 0.45, g: 0.035 },
    ]),
  /** Тренировка завершена */
  celebrate: () =>
    play([
      { f: G5, d: 0.25, g: 0.08, type: "triangle" },
      { f: C6, d: 0.25, at: 0.1, g: 0.08, type: "triangle" },
      { f: E6, d: 0.25, at: 0.2, g: 0.08, type: "triangle" },
      { f: G6, d: 0.9, at: 0.3, g: 0.09 },
      { f: C6, d: 0.9, at: 0.3, g: 0.06 },
    ]),
};
