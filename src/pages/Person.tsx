import { useState } from "react";
import { Ban, Check, Clock, Flag, Lock, MessageCircle, MoreHorizontal, Pencil, UserMinus, UserPlus } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import {
  fullName,
  openConversation,
  report,
  useFeed,
  useFriendActions,
  useFriendships,
  usePerson,
  usePublicStats,
} from "@/data/social";
import { lastSeenText } from "@/lib/dates";
import { fmtKg } from "@/lib/nutrition";
import { confirmDialog, haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { Avatar } from "@/ui/Avatar";
import { PostCard } from "@/ui/PostCard";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { InfiniteSentinel } from "@/ui/InfiniteSentinel";
import { ChatScreen } from "./Chat";
import { EditProfileSheet } from "@/sheets/EditProfile";
import "./social.css";

export function PersonScreen({ id }: { id: string }) {
  const nav = useNav();
  const uid = useUid();
  const toast = useToast();
  const person = usePerson(id);
  const stats = usePublicStats(id);
  const fs = useFriendships();
  const actions = useFriendActions();
  const feed = useFeed("user", id);
  const [opening, setOpening] = useState(false);
  const p = person.data;
  const rel = fs.relation(id);
  const me = id === uid;
  const s = stats.data;

  const write = async () => {
    setOpening(true);
    try {
      const cid = await openConversation(id);
      nav.push(<ChatScreen cid={cid} otherId={id} />);
    } catch {
      haptic.error();
      toast("Этот пользователь принимает сообщения только от друзей");
    } finally {
      setOpening(false);
    }
  };

  const more = async () => {
    const choice = await confirmDialog("Заблокировать пользователя? Вы перестанете видеть друг друга и не сможете переписываться.");
    if (!choice) return;
    await actions.block.mutateAsync(id);
    await report({ user_id: id }, "block").catch(() => {});
    toast("Пользователь заблокирован");
    nav.pop();
  };

  const primary = () => {
    if (me)
      return (
        <Tap className="btn btn-block" onClick={() => nav.sheet(<EditProfileSheet />)}>
          <Pencil size={17} /> Редактировать
        </Tap>
      );
    if (rel === "friends")
      return (
        <Tap
          className="btn btn-block"
          onClick={async () => {
            if (!(await confirmDialog(`Удалить ${p?.first_name ?? ""} из друзей?`))) return;
            actions.remove.mutate(id);
            haptic.rigid();
          }}
        >
          <Check size={17} /> В друзьях
        </Tap>
      );
    if (rel === "incoming")
      return (
        <Tap
          className="btn btn-accent btn-block"
          onClick={() => {
            haptic.success();
            actions.respond.mutate({ id, accept: true });
          }}
        >
          <UserPlus size={17} /> Принять заявку
        </Tap>
      );
    if (rel === "outgoing")
      return (
        <Tap className="btn btn-block" onClick={() => actions.remove.mutate(id)}>
          <Clock size={17} /> Заявка отправлена
        </Tap>
      );
    return (
      <Tap
        className="btn btn-accent btn-block"
        onClick={async () => {
          haptic.medium();
          const st = await actions.request.mutateAsync(id);
          toast(st === "accepted" ? "Теперь вы друзья 🤝" : "Заявка отправлена");
        }}
      >
        <UserPlus size={17} /> Добавить в друзья
      </Tap>
    );
  };

  const posts = feed.data?.pages.flat() ?? [];

  return (
    <Screen
      title={p?.username ? `@${p.username}` : ""}
      right={
        !me ? (
          <Tap className="icon-btn" onClick={more} aria-label="Ещё">
            <MoreHorizontal size={20} />
          </Tap>
        ) : undefined
      }
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 4 }}>
        <Avatar url={p?.avatar_url} name={p?.first_name ?? ""} size={96} ring />
        <div style={{ fontSize: 24, fontWeight: 750, marginTop: 12, letterSpacing: "-0.02em" }}>{fullName(p)}</div>
        {!me && <div className={`muted ${lastSeenText(p?.last_seen) === "в сети" ? "typing" : ""}`} style={{ fontSize: 14, marginTop: 2 }}>{lastSeenText(p?.last_seen)}</div>}
        {p?.bio && <div style={{ marginTop: 10, fontSize: 15, maxWidth: 320 }}>{p.bio}</div>}
      </div>

      <div className="row" style={{ marginTop: 18, gap: 10 }}>
        {primary()}
        {!me && (
          <Tap className="btn" onClick={write} disabled={opening} style={{ padding: "0 18px" }} aria-label="Написать">
            <MessageCircle size={19} />
          </Tap>
        )}
      </div>

      {rel === "incoming" && (
        <button className="faint" style={{ width: "100%", marginTop: 10, fontSize: 14 }} onClick={() => actions.respond.mutate({ id, accept: false })}>
          Отклонить заявку
        </button>
      )}

      <div className="kv" style={{ marginTop: 18, gridTemplateColumns: s?.weight_change_30 != null ? "repeat(4, 1fr)" : "repeat(3, 1fr)" }}>
        <div>
          <div className="k">серия</div>
          <div className="v num">{s?.hidden ? "—" : `${s?.streak ?? 0}🔥`}</div>
        </div>
        <div>
          <div className="k">дней</div>
          <div className="v num">{s?.hidden ? "—" : (s?.logged_days ?? 0)}</div>
        </div>
        <div>
          <div className="k">друзей</div>
          <div className="v num">{s?.friends ?? 0}</div>
        </div>
        {s?.weight_change_30 != null && (
          <div>
            <div className="k">вес, 30 д</div>
            <div className="v num" style={{ color: s.weight_change_30 <= 0 ? "var(--good)" : "var(--protein)" }}>
              {s.weight_change_30 > 0 ? "+" : s.weight_change_30 < 0 ? "−" : ""}
              {fmtKg(Math.abs(s.weight_change_30))}
            </div>
          </div>
        )}
      </div>

      <div className="section-title">Записи</div>
      {s?.hidden && !me ? (
        <div className="empty">
          <Lock size={32} style={{ display: "block", margin: "0 auto 8px" }} />
          Закрытый профиль. Добавь в друзья, чтобы видеть записи.
        </div>
      ) : posts.length ? (
        <div className="stack">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          <InfiniteSentinel query={feed} />
        </div>
      ) : feed.isLoading ? (
        <div className="skeleton" style={{ height: 160, borderRadius: 24 }} />
      ) : (
        <div className="empty">{me ? "Ты ещё ничего не публиковал" : "Пока нет записей"}</div>
      )}

      {!me && (
        <div className="row" style={{ justifyContent: "center", gap: 18, marginTop: 24 }}>
          {rel === "friends" && (
            <button className="faint row" style={{ gap: 6, fontSize: 13 }} onClick={() => actions.remove.mutate(id)}>
              <UserMinus size={14} /> Удалить из друзей
            </button>
          )}
          <button
            className="faint row"
            style={{ gap: 6, fontSize: 13 }}
            onClick={async () => {
              await report({ user_id: id }, "profile");
              toast("Жалоба отправлена");
            }}
          >
            <Flag size={14} /> Пожаловаться
          </button>
          <button className="faint row" style={{ gap: 6, fontSize: 13 }} onClick={more}>
            <Ban size={14} /> Заблокировать
          </button>
        </div>
      )}
    </Screen>
  );
}
