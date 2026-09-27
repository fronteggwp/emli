import { useMemo, useState } from "react";
import { Check, LogOut, Plus, UserPlus, X } from "lucide-react";
import { motion } from "motion/react";
import { useLayer, useNav } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { useChallengeActions, useChallengeBoard, useMyChallenges, type ChallengeMetric, type ChallengeRow } from "@/data/engage";
import { fullName, useFriendships, usePeople } from "@/data/social";
import { METRICS } from "@/lib/achievements";
import { daysBetween, fmt, shiftKey, todayKey, weekStart } from "@/lib/dates";
import { confirmDialog, haptic } from "@/lib/telegram";
import { Screen, SheetHeader } from "@/ui/Screen";
import { Avatar } from "@/ui/Avatar";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { PersonScreen } from "./Person";
import "./engage.css";
import "./challenges.css";

const COLORS: Record<ChallengeMetric, [string, string]> = {
  workouts: ["#22b573", "#1d8f9a"],
  volume: ["#ff7a5c", "#e8475f"],
  sets: ["#7c8cff", "#5b4fd6"],
  minutes: ["#5cc8ff", "#3a7bd5"],
  logged_days: ["#ffb35c", "#ff7a5c"],
  weigh_ins: ["#b388ff", "#6b5cff"],
};

function period(c: Pick<ChallengeRow, "start_date" | "end_date">) {
  const today = todayKey();
  if (today < c.start_date) {
    const d = daysBetween(today, c.start_date);
    return { state: "soon" as const, text: d === 1 ? "начнётся завтра" : `начнётся через ${d} ${dn(d)}`, progress: 0 };
  }
  if (today > c.end_date) return { state: "done" as const, text: "завершён", progress: 1 };
  const total = daysBetween(c.start_date, c.end_date) + 1;
  const left = daysBetween(today, c.end_date);
  return {
    state: "live" as const,
    text: left === 0 ? "последний день!" : `ещё ${left} ${dn(left)}`,
    progress: (total - left - 1 + 0.5) / total,
  };
}
const dn = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "день" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "дня" : "дней");

export function ChallengesScreen() {
  const nav = useNav();
  const list = useMyChallenges();
  const rows = list.data ?? [];
  const invites = rows.filter((c) => c.status === "invited" && c.end_date >= todayKey());
  const active = rows.filter((c) => c.status === "joined" && c.end_date >= todayKey());
  const done = rows.filter((c) => c.status === "joined" && c.end_date < todayKey());

  return (
    <Screen
      title="Челленджи"
      right={
        <Tap className="icon-btn" onClick={() => nav.sheet(<NewChallengeSheet />, { full: true })} aria-label="Новый челлендж">
          <Plus size={20} />
        </Tap>
      }
    >
      {invites.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 4 }}>
            Приглашения
          </div>
          <div className="stack">
            {invites.map((c) => (
              <ChallengeCard key={c.id} c={c} />
            ))}
          </div>
        </>
      )}
      {active.length > 0 && (
        <>
          <div className="section-title" style={invites.length ? undefined : { marginTop: 4 }}>
            Идут сейчас
          </div>
          <div className="stack">
            {active.map((c) => (
              <ChallengeCard key={c.id} c={c} />
            ))}
          </div>
        </>
      )}
      {!list.isLoading && !invites.length && !active.length && (
        <div className="ch-empty">
          <div style={{ fontSize: 64 }}>🏆</div>
          <div className="ch-empty-t">Соревнуйся с друзьями</div>
          <div className="muted">
            Кто сделает больше тренировок за неделю? Кто ни разу не пропустит дневник? Создай челлендж и позови друзей.
          </div>
          <Tap className="btn btn-accent" style={{ marginTop: 16 }} onClick={() => nav.sheet(<NewChallengeSheet />, { full: true })}>
            <Plus size={18} /> Новый челлендж
          </Tap>
        </div>
      )}
      {list.isLoading && <div className="skeleton" style={{ height: 150, borderRadius: 24 }} />}
      {done.length > 0 && (
        <>
          <div className="section-title">Завершённые</div>
          <div className="stack">
            {done.map((c) => (
              <ChallengeCard key={c.id} c={c} />
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}

function ChallengeCard({ c }: { c: ChallengeRow }) {
  const nav = useNav();
  const actions = useChallengeActions();
  const p = period(c);
  const m = METRICS[c.metric];
  const [c1, c2] = COLORS[c.metric];
  const invited = c.status === "invited";
  return (
    <Tap className="ch-card" scale={0.98} style={{ ["--c1" as string]: c1, ["--c2" as string]: c2 }} onClick={() => nav.push(<ChallengeScreen id={c.id} />)}>
      <div className="ch-card-top">
        <span className="ch-emoji">{c.emoji}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <div className="ch-title">{c.title}</div>
          <div className="ch-sub">
            {m.emoji} {m.name} · {p.text}
          </div>
        </span>
        {!invited && c.my_place != null && (
          <span className="ch-place">
            <b className="num">{c.my_place === 1 ? "🥇" : c.my_place === 2 ? "🥈" : c.my_place === 3 ? "🥉" : `#${c.my_place}`}</b>
            <span>из {c.members}</span>
          </span>
        )}
      </div>
      <div className="ch-time">
        <i style={{ width: `${p.progress * 100}%` }} />
      </div>
      {invited ? (
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <span
            role="button"
            className="btn btn-sm ch-accept tap"
            onClick={(e) => {
              e.stopPropagation();
              haptic.success();
              actions.respond.mutate({ id: c.id, accept: true });
            }}
          >
            <Check size={16} strokeWidth={3} /> Участвую
          </span>
          <span
            role="button"
            className="btn btn-sm tap ch-decline"
            onClick={(e) => {
              e.stopPropagation();
              haptic.tap();
              actions.respond.mutate({ id: c.id, accept: false });
            }}
          >
            Не сейчас
          </span>
        </div>
      ) : (
        <div className="ch-foot">
          <span>
            Ты: <b className="num">{m.fmt(c.my_value ?? 0)}</b> {m.short}
          </span>
          {c.leader_name && c.my_place !== 1 && (
            <span>
              Лидер: {c.leader_name} · <b className="num">{m.fmt(c.leader_value ?? 0)}</b>
            </span>
          )}
        </div>
      )}
    </Tap>
  );
}

export function ChallengeScreen({ id }: { id: string }) {
  const nav = useNav();
  const layer = useLayer();
  const uid = useUid();
  const list = useMyChallenges();
  const board = useChallengeBoard(id);
  const actions = useChallengeActions();
  const c = list.data?.find((x) => x.id === id);
  if (!c)
    return (
      <Screen title="Челлендж">
        {list.isLoading ? <div className="skeleton" style={{ height: 220, borderRadius: 28 }} /> : <div className="empty">Челлендж не найден или ты из него вышел</div>}
      </Screen>
    );
  const p = period(c);
  const m = METRICS[c.metric];
  const [c1, c2] = COLORS[c.metric];
  const rows = board.data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.value));
  const podium = rows.slice(0, 3);

  const leave = async () => {
    if (!(await confirmDialog("Выйти из челленджа?"))) return;
    actions.leave.mutate(c.id);
    layer.close();
  };

  return (
    <Screen
      title=""
      right={
        c.status === "joined" ? (
          <Tap className="icon-btn" onClick={leave} aria-label="Выйти">
            <LogOut size={18} />
          </Tap>
        ) : undefined
      }
    >
      <div className="ch-hero" style={{ ["--c1" as string]: c1, ["--c2" as string]: c2 }}>
        <div className="ch-hero-emoji">{c.emoji}</div>
        <div className="ch-hero-title">{c.title}</div>
        <div className="ch-hero-sub">
          {m.emoji} {m.name}
        </div>
        <div className="ch-hero-dates">
          {fmt(c.start_date, "d MMM")} — {fmt(c.end_date, "d MMM")} · {p.text}
        </div>
        <div className="ch-time light">
          <i style={{ width: `${p.progress * 100}%` }} />
        </div>
      </div>

      {c.status === "invited" && (
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <Tap className="btn btn-block ch-accept" onClick={() => (haptic.success(), actions.respond.mutate({ id: c.id, accept: true }))}>
            <Check size={18} strokeWidth={3} /> Участвую
          </Tap>
          <Tap className="btn" onClick={() => (actions.respond.mutate({ id: c.id, accept: false }), layer.close())}>
            <X size={18} />
          </Tap>
        </div>
      )}

      {podium.length > 1 && (
        <div className="podium">
          {[podium[1], podium[0], podium[2]].map((r, i) =>
            r ? (
              <motion.button
                key={r.user_id}
                className={`podium-col p${r.place}`}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 260, damping: 22 }}
                onClick={() => nav.push(<PersonScreen id={r.user_id} />)}
              >
                <Avatar url={r.avatar_url} name={r.first_name} size={r.place === 1 ? 64 : 52} ring={r.place === 1} />
                <div className="podium-name">{r.user_id === uid ? "Ты" : r.first_name}</div>
                <div className="podium-val num">{m.fmt(r.value)}</div>
                <div className="podium-block">{r.place === 1 ? "🥇" : r.place === 2 ? "🥈" : "🥉"}</div>
              </motion.button>
            ) : (
              <div key={i} />
            ),
          )}
        </div>
      )}

      <div className="section-title">
        Таблица
        <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
          {m.short}
        </span>
      </div>
      <div className="list">
        {rows.map((r) => (
          <button key={r.user_id} className={`ch-row press ${r.user_id === uid ? "me" : ""}`} onClick={() => nav.push(<PersonScreen id={r.user_id} />)}>
            <span className="ch-rank num">{r.place}</span>
            <Avatar url={r.avatar_url} name={r.first_name} size={38} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <div className="ch-row-name">{r.user_id === uid ? "Ты" : fullName(r)}</div>
              <div className="ch-bar">
                <motion.i initial={{ width: 0 }} animate={{ width: `${(r.value / max) * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
              </div>
            </span>
            <b className="num ch-row-val">{m.fmt(r.value)}</b>
          </button>
        ))}
        {!rows.length && <div className="empty">Пока никто не присоединился</div>}
      </div>

      {c.status === "joined" && p.state !== "done" && (
        <Tap className="btn btn-block" style={{ marginTop: 14 }} onClick={() => nav.sheet(<InviteSheet id={c.id} exclude={rows.map((r) => r.user_id)} />, { full: true })}>
          <UserPlus size={18} /> Позвать ещё друзей
        </Tap>
      )}
      <div className="faint" style={{ fontSize: 12, textAlign: "center", marginTop: 14 }}>
        Результаты считаются автоматически по дневнику и тренировкам
      </div>
    </Screen>
  );
}

// ───────────── Выбор друзей

function FriendPicker({ selected, onToggle, exclude = [] }: { selected: Set<string>; onToggle: (id: string) => void; exclude?: string[] }) {
  const fs = useFriendships();
  const ids = fs.friends.filter((id) => !exclude.includes(id));
  const people = usePeople(ids);
  if (!ids.length) return <div className="empty">Добавь друзей, чтобы позвать их в челлендж</div>;
  return (
    <div className="list">
      {ids.map((id) => {
        const p = people.get(id);
        const on = selected.has(id);
        return (
          <button key={id} className="ch-row press" onClick={() => (haptic.select(), onToggle(id))}>
            <Avatar url={p?.avatar_url} name={p?.first_name ?? ""} size={38} />
            <span style={{ flex: 1, minWidth: 0 }} className="ch-row-name">
              {fullName(p)}
            </span>
            <span className={`pick-check ${on ? "on" : ""}`}>{on && <Check size={15} strokeWidth={3} color="#fff" />}</span>
          </button>
        );
      })}
    </div>
  );
}

function InviteSheet({ id, exclude }: { id: string; exclude: string[] }) {
  const layer = useLayer();
  const toast = useToast();
  const actions = useChallengeActions();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (x: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(x)) n.delete(x);
      else n.add(x);
      return n;
    });
  return (
    <>
      <SheetHeader title="Позвать друзей" />
      <div className="sheet-body">
        <FriendPicker selected={sel} onToggle={toggle} exclude={exclude} />
        <Tap
          className="btn btn-block btn-accent"
          style={{ marginTop: 16 }}
          disabled={!sel.size}
          onClick={async () => {
            await actions.invite.mutateAsync({ id, uids: [...sel] });
            haptic.success();
            toast("Приглашения отправлены");
            layer.close();
          }}
        >
          Пригласить{sel.size ? ` (${sel.size})` : ""}
        </Tap>
      </div>
    </>
  );
}

// ───────────── Новый челлендж

const IDEAS: { title: string; emoji: string; metric: ChallengeMetric }[] = [
  { title: "Неделя без пропусков", emoji: "🔥", metric: "workouts" },
  { title: "Тонна за тонной", emoji: "🏋️", metric: "volume" },
  { title: "Дневник каждый день", emoji: "📒", metric: "logged_days" },
  { title: "Железная дисциплина", emoji: "⏱", metric: "minutes" },
];

function NewChallengeSheet() {
  const layer = useLayer();
  const nav = useNav();
  const toast = useToast();
  const actions = useChallengeActions();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🏆");
  const [metric, setMetric] = useState<ChallengeMetric>("workouts");
  const [days, setDays] = useState(7);
  const [start, setStart] = useState<"today" | "monday">("today");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const startDate = useMemo(() => (start === "today" ? todayKey() : shiftKey(weekStart(todayKey()), 7)), [start]);
  const endDate = shiftKey(startDate, days - 1);
  const ok = title.trim().length > 0;

  const create = async () => {
    if (!ok) return;
    try {
      const id = await actions.create.mutateAsync({ title: title.trim(), emoji, metric, start: startDate, end: endDate, invitees: [...sel] });
      haptic.success();
      toast(sel.size ? "Челлендж создан, друзья приглашены 🏆" : "Челлендж создан 🏆");
      layer.close();
      setTimeout(() => nav.push(<ChallengeScreen id={id} />), 350);
    } catch {
      toast("Не получилось создать");
    }
  };

  return (
    <>
      <SheetHeader title="Новый челлендж" />
      <div className="sheet-body">
        <div className="chips-row" style={{ margin: "0 -16px", padding: "0 16px" }}>
          {IDEAS.map((i) => (
            <Tap
              key={i.title}
              className="chip"
              style={{ height: 32, fontSize: 13 }}
              onClick={() => {
                haptic.select();
                setTitle(i.title);
                setEmoji(i.emoji);
                setMetric(i.metric);
              }}
            >
              {i.emoji} {i.title}
            </Tap>
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <Tap
            className="ch-emoji-btn"
            onClick={() => {
              const list = ["🏆", "🔥", "💪", "⚡️", "🥇", "🚀", "🎯", "👑"];
              setEmoji(list[(list.indexOf(emoji) + 1) % list.length]);
              haptic.select();
            }}
          >
            {emoji}
          </Tap>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder="Название" />
        </div>

        <div className="group-label">Что считаем</div>
        <div className="ch-metrics">
          {(Object.keys(METRICS) as ChallengeMetric[]).map((k) => (
            <Tap key={k} className={`ch-metric ${metric === k ? "on" : ""}`} scale={0.96} onClick={() => (haptic.select(), setMetric(k))}>
              <span>{METRICS[k].emoji}</span>
              {METRICS[k].name}
            </Tap>
          ))}
        </div>

        <div className="group-label">Сколько длится</div>
        <div className="row" style={{ gap: 6 }}>
          {[7, 14, 30].map((d) => (
            <Tap key={d} className={`chip ${days === d ? "on" : ""}`} style={{ flex: 1, justifyContent: "center" }} onClick={() => (haptic.select(), setDays(d))}>
              {d === 7 ? "Неделя" : d === 14 ? "2 недели" : "Месяц"}
            </Tap>
          ))}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          {(["today", "monday"] as const).map((s) => (
            <Tap key={s} className={`chip ${start === s ? "on" : ""}`} style={{ flex: 1, justifyContent: "center" }} onClick={() => (haptic.select(), setStart(s))}>
              {s === "today" ? "С сегодня" : "С понедельника"}
            </Tap>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 8, textAlign: "center" }}>
          {fmt(startDate, "d MMMM")} — {fmt(endDate, "d MMMM")}
        </div>

        <div className="group-label">Позвать друзей</div>
        <FriendPicker
          selected={sel}
          onToggle={(x) =>
            setSel((s) => {
              const n = new Set(s);
              if (n.has(x)) n.delete(x);
              else n.add(x);
              return n;
            })
          }
        />

        <Tap className="btn btn-block btn-accent" style={{ marginTop: 18 }} disabled={!ok || actions.create.isPending} onClick={create}>
          Создать челлендж
        </Tap>
      </div>
    </>
  );
}
