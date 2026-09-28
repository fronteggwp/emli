import { useEffect, useState, type ReactNode } from "react";
import { Bell, Copy, Download, LogOut, Smartphone, Trash } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useSaveSettings, useSettings } from "@/data/api";
import { WaistScreen } from "./Waist";
import { BOT_USERNAME } from "@/data/social";
import { deleteAccount, exportData, hm, useReminders, useSaveReminders, type Reminders } from "@/data/engage";
import { forgetSession, revokeThisDevice } from "@/lib/auth";
import { isStandalone } from "./Welcome";
import { useHomeScreen } from "@/lib/homescreen";
import { confirmDialog, haptic, hapticsOn, inTelegram, setHapticsOn, tg, vibrate } from "@/lib/telegram";
import { getThemePref, setThemePref, type ThemePref } from "@/lib/theme";
import { Screen } from "@/ui/Screen";
import { Switch } from "@/ui/Switch";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { WEEKDAYS_SHORT } from "@/lib/dates";
import "./engage.css";

export function SettingsScreen() {
  return (
    <Screen title="Настройки">
      <ThemePicker />
      <FeelBlock />
      <BodyBlock />
      <RemindersBlock />
      <HomeBlock />
      <DataBlock />
      <div className="faint" style={{ textAlign: "center", fontSize: 12, marginTop: 28 }}>
        Emli · сделано с ❤️
      </div>
      {!inTelegram && <ScreenInfo />}
    </Screen>
  );
}

// ───────────── Замеры тела

function BodyBlock() {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const save = useSaveSettings();
  const on = !!settings.data?.track_waist;
  return (
    <>
      <div className="section-title">Замеры тела</div>
      <Switch
        on={on}
        onChange={(v) => {
          haptic.select();
          save.mutate({ track_waist: v });
          toast(v ? "Талия появится в «Прогрессе» и в меню «+»" : "Замеры талии скрыты — история сохранится");
        }}
        label="Следить за талией"
        hint="Замеры раз в неделю: видно, что уходит именно жир, даже когда весы стоят"
      />
      {on && (
        <Tap className="btn btn-block btn-sm" style={{ marginTop: 8 }} onClick={() => nav.push(<WaistScreen />)}>
          📏 Открыть замеры талии
        </Tap>
      )}
    </>
  );
}

// ───────────── Тема

const THEMES: { id: ThemePref; name: string; bg: string; card: string; text: string }[] = [
  { id: "dark", name: "Тёмная", bg: "#0b0b0e", card: "#1e1e25", text: "#f4f4f6" },
  { id: "light", name: "Светлая", bg: "#f2f2f7", card: "#ffffff", text: "#111116" },
  { id: "auto", name: "Как в Telegram", bg: "linear-gradient(135deg, #0b0b0e 50%, #f2f2f7 50%)", card: "#8a8a96", text: "#fff" },
];

function ThemePicker() {
  const [pref, setPref] = useState(getThemePref());
  return (
    <>
      <div className="section-title" style={{ marginTop: 8 }}>
        Оформление
      </div>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <Tap
            key={t.id}
            className={`theme-card ${pref === t.id ? "on" : ""}`}
            scale={0.96}
            onClick={() => {
              haptic.select();
              setPref(t.id);
              setThemePref(t.id);
            }}
          >
            <span className="theme-prev" style={{ background: t.bg }}>
              <i style={{ background: t.card }} />
              <i style={{ background: t.card, width: "60%" }} />
              <b style={{ background: "linear-gradient(135deg, #7c8cff, #b388ff)" }} />
            </span>
            <span className="theme-name">{t.name}</span>
          </Tap>
        ))}
      </div>
    </>
  );
}

// ───────────── Напоминания

function RemindersBlock() {
  const r = useReminders();
  const save = useSaveReminders();
  const settings = useSettings();
  const d = r.data;
  const set = (patch: Partial<Reminders>) => save.mutate(patch);
  if (!d) return null;
  const on = d.enabled;
  const hasProgram = !!settings.data?.active_program;

  return (
    <>
      <div className="section-title">Напоминания</div>
      <Switch on={on} onChange={(v) => set({ enabled: v })} label="Сообщения от бота" hint="Напоминания, итоги недели, а также лайки, комментарии и сообщения. Выключишь — бот писать не будет" />
      <div className={`rem-list ${on ? "" : "off"}`}>
        <RemRow
          emoji="🍽"
          title="Приёмы пищи"
          hint="Если приём не записан, а обычно ты его ведёшь"
          on={d.meals}
          onToggle={(v) => set({ meals: v })}
        >
          <div className="rem-times">
            {["Завтрак", "Обед", "Ужин"].map((name, i) => (
              <TimeChip
                key={name}
                label={name}
                value={hm(d.meal_times[i])}
                onChange={(v) => {
                  const next = [...d.meal_times];
                  next[i] = v;
                  set({ meal_times: next });
                }}
              />
            ))}
          </div>
        </RemRow>

        <RemRow
          emoji="💪"
          title="Тренировки"
          hint={hasProgram ? "В дни тренировок, если ещё не начал" : "Выбери дни — напомню, если не потренируешься"}
          on={d.workout}
          onToggle={(v) => set({ workout: v })}
        >
          <div className="rem-days">
            {WEEKDAYS_SHORT.map((w, i) => {
              const day = i + 1;
              const sel = d.workout_days.includes(day);
              return (
                <Tap
                  key={w}
                  className={`rem-day ${sel ? "on" : ""}`}
                  scale={0.9}
                  onClick={() => {
                    haptic.select();
                    set({ workout_days: sel ? d.workout_days.filter((x) => x !== day) : [...d.workout_days, day].sort() });
                  }}
                >
                  {w}
                </Tap>
              );
            })}
          </div>
          <div className="rem-times">
            <TimeChip label="Во сколько" value={hm(d.workout_time)} onChange={(v) => set({ workout_time: v })} />
          </div>
        </RemRow>

        <RemRow emoji="⚖️" title="Взвешивание" hint="Утром, если вес ещё не записан" on={d.weigh} onToggle={(v) => set({ weigh: v })}>
          <div className="rem-times">
            <TimeChip label="Во сколько" value={hm(d.weigh_time)} onChange={(v) => set({ weigh_time: v })} />
          </div>
        </RemRow>

        <RemRow emoji="🔥" title="Серия под угрозой" hint="Вечером, если за день ни одной записи" on={d.streak} onToggle={(v) => set({ streak: v })}>
          <div className="rem-times">
            <TimeChip label="Во сколько" value={hm(d.streak_time)} onChange={(v) => set({ streak_time: v })} />
          </div>
        </RemRow>

        <RemRow emoji="📊" title="Итоги недели" hint="Каждое воскресенье в 19:00: питание, вес, тренировки и совет" on={d.weekly} onToggle={(v) => set({ weekly: v })} />
      </div>
      <button
        className="rem-bot press"
        onClick={() => (tg ? tg.openTelegramLink(`https://t.me/${BOT_USERNAME}`) : (location.href = `tg://resolve?domain=${BOT_USERNAME}`))}
      >
        <Bell size={16} /> Не приходят сообщения? Открой @{BOT_USERNAME} и нажми «Запустить»
      </button>
    </>
  );
}

function RemRow({
  emoji,
  title,
  hint,
  on,
  onToggle,
  children,
}: {
  emoji: string;
  title: string;
  hint: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="rem-row">
      <button
        className="rem-head press"
        onClick={() => {
          haptic.select();
          onToggle(!on);
        }}
      >
        <span className="rem-emoji">{emoji}</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div className="rem-title">{title}</div>
          <div className="rem-hint">{hint}</div>
        </span>
        <span className={`switch ${on ? "on" : ""}`}>
          <i />
        </span>
      </button>
      {children && <div className={`rem-body ${on ? "" : "hide"}`}>{children}</div>}
    </div>
  );
}

function TimeChip({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="time-chip">
      <span>{label}</span>
      <input
        type="time"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v && v !== value && onChange(v)}
      />
    </label>
  );
}

// ───────────── Главный экран

const APP_LINK = "https://fronteggwp.github.io/emli/";

function HomeBlock() {
  const home = useHomeScreen();
  const toast = useToast();
  const tgHome = !!home.status && home.status !== "unsupported";
  const copy = async () => {
    haptic.success();
    try {
      await navigator.clipboard.writeText(APP_LINK);
      toast("Ссылка скопирована — открой её в Safari");
    } catch {
      toast(APP_LINK);
    }
  };
  if (!inTelegram) {
    return (
      <>
        <div className="section-title">Приложение</div>
        <div className="list">
          <button
            className="list-item press"
            onClick={async () => {
              if (!(await confirmDialog("Выйти из Emli на этом устройстве? Данные останутся в аккаунте."))) return;
              await revokeThisDevice();
              forgetSession();
              location.reload();
            }}
          >
            <span className="li-icon">
              <LogOut size={21} />
            </span>
            <span style={{ flex: 1 }}>
              <div className="li-title">Выйти на этом устройстве</div>
              <div className="li-sub">{isStandalone() ? "Приложение на главном экране" : "Браузер"}</div>
            </span>
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="section-title">Приложение</div>
      <div className="list">
        <button className="list-item press" onClick={copy}>
          <span className="li-icon">
            <Copy size={21} />
          </span>
          <span style={{ flex: 1 }}>
            <div className="li-title">Emli без Telegram</div>
            <div className="li-sub">Скопируй ссылку, открой в Safari → «Поделиться» → «На экран „Домой"». Откроется сразу, без Telegram</div>
          </span>
        </button>
        {tgHome && (
        <button className="list-item press" onClick={() => home.status !== "added" && home.add()}>
          <span className="li-icon">
            <Smartphone size={21} />
          </span>
          <span style={{ flex: 1 }}>
            <div className="li-title">Иконка Telegram-версии</div>
            <div className="li-sub">{home.status === "added" ? "Уже добавлена ✓" : "Открывай Emli в одно касание, как обычное приложение"}</div>
          </span>
          {home.status !== "added" && <span className="chip on" style={{ height: 30, fontSize: 13 }}>Добавить</span>}
        </button>
        )}
      </div>
    </>
  );
}

// ───────────── Данные

function DataBlock() {
  const toast = useToast();
  const nav = useNav();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);

  const onExport = async () => {
    setBusy("export");
    try {
      const r = await exportData();
      if (r.ok) {
        haptic.success();
        toast("Все файлы отправлены в чат с ботом 📦");
      } else if (r.sent) toast(`Дошли не все файлы (${r.sent} из ${r.total}) — попробуй ещё раз`);
      else toast("Не получилось — открой бота и нажми «Запустить»");
    } catch {
      toast("Не получилось, попробуй позже");
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    haptic.warning();
    if (!(await confirmDialog("Удалить аккаунт? Дневник, вес, тренировки, записи и переписки удалятся навсегда."))) return;
    if (!(await confirmDialog("Точно? Восстановить данные будет нельзя."))) return;
    setBusy("delete");
    try {
      await deleteAccount();
      forgetSession();
      nav.closeAll();
      document.body.innerHTML =
        '<div style="height:100vh;display:grid;place-items:center;text-align:center;padding:24px;font-family:var(--font);color:var(--text)"><div><div style="font-size:56px">👋</div><div style="font-size:20px;font-weight:700;margin-top:12px">Аккаунт удалён</div><div style="opacity:.6;margin-top:6px">Спасибо, что был с Emli</div></div></div>';
      setTimeout(() => tg?.close?.(), 2500);
    } catch {
      setBusy(null);
      toast("Не получилось удалить, попробуй позже");
    }
  };

  return (
    <>
      <div className="section-title">Данные</div>
      <div className="list">
        <button className="list-item press" onClick={onExport} disabled={!!busy}>
          <span className="li-icon">
            <Download size={21} />
          </span>
          <span style={{ flex: 1 }}>
            <div className="li-title">{busy === "export" ? "Готовлю файлы…" : "Выгрузить мои данные"}</div>
            <div className="li-sub">Дневник и вес в Excel (CSV) + полный архив — придут в чат с ботом</div>
          </span>
        </button>
        <button className="list-item press" onClick={onDelete} disabled={!!busy}>
          <span className="li-icon" style={{ color: "var(--danger)" }}>
            <Trash size={21} />
          </span>
          <span style={{ flex: 1 }}>
            <div className="li-title" style={{ color: "var(--danger)" }}>
              {busy === "delete" ? "Удаляю…" : "Удалить аккаунт"}
            </div>
            <div className="li-sub">Навсегда удалит все данные</div>
          </span>
        </button>
      </div>
    </>
  );
}

/** Служебная строка про размеры экрана — помогает разобраться с отображением на телефоне */
function ScreenInfo() {
  const root = document.getElementById("root")?.getBoundingClientRect();
  const cs = getComputedStyle(document.documentElement);
  const info = [
    `st ${(navigator as Navigator & { standalone?: boolean }).standalone ? 1 : 0}/${matchMedia("(display-mode: standalone)").matches ? 1 : 0}`,
    `scr ${screen.width}×${screen.height}`,
    `win ${window.innerWidth}×${window.innerHeight}`,
    `vv ${Math.round(window.visualViewport?.height ?? 0)}`,
    `root ${Math.round(root?.top ?? 0)}+${Math.round(root?.height ?? 0)}`,
    `vvh ${cs.getPropertyValue("--vvh").trim() || "-"}`,
  ].join(" · ");
  return (
    <div className="faint" style={{ textAlign: "center", fontSize: 10, marginTop: 6, fontFamily: "monospace" }}>
      {info}
    </div>
  );
}

// ───────────── Звуки и вибрация

function FeelBlock() {
  const [buzz, setBuzz] = useState(hapticsOn());
  return (
    <div className="stack" style={{ gap: 8, marginTop: 12 }}>
      <Switch
        on={buzz}
        onChange={(v) => {
          setHapticsOn(v);
          setBuzz(v);
          if (v) vibrate("success");
        }}
        label="Вибрация"
        hint="Лёгкий отклик на касания"
      />
    </div>
  );
}
