import { useState } from "react";
import { Bell, MessageCircle, PenLine, Plus, Scale, Sun } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useProfile } from "@/data/api";
import { useFeed, useFriendships, useInviteLink, usePeople, useUnreadCounts } from "@/data/social";
import { isOnline } from "@/lib/dates";
import { Avatar } from "@/ui/Avatar";
import { PostCard } from "@/ui/PostCard";
import { Segmented } from "@/ui/Segmented";
import { Tap } from "@/ui/Tap";
import { InfiniteSentinel } from "@/ui/InfiniteSentinel";
import { NewPostSheet } from "@/sheets/NewPost";
import { ChatsScreen } from "./Chats";
import { NotificationsScreen } from "./Notifications";
import { FriendsScreen, shareInvite } from "./Friends";
import { PersonScreen } from "./Person";
import { HeaderAvatar } from "@/ui/HeaderAvatar";
import { ChallengeScreen, ChallengesScreen } from "./Challenges";
import { useMyChallenges } from "@/data/engage";
import { METRICS } from "@/lib/achievements";
import { todayKey } from "@/lib/dates";
import "./social.css";

export function CommunityPage() {
  const nav = useNav();
  const me = useProfile().data;
  const fs = useFriendships();
  const unread = useUnreadCounts();
  const invite = useInviteLink();
  const [scope, setScope] = useState<"friends" | "all">("all");
  const feed = useFeed(scope);
  const friends = usePeople(fs.friends);
  const posts = feed.data?.pages.flat() ?? [];
  const challenges = useMyChallenges();
  const chInvites = (challenges.data ?? []).filter((c) => c.status === "invited" && c.end_date >= todayKey()).length;
  const live = (challenges.data ?? []).find((c) => c.status === "joined" && c.start_date <= todayKey() && c.end_date >= todayKey());

  // Друзья онлайн — первыми
  const friendList = fs.friends
    .map((id) => friends.get(id))
    .filter((p) => !!p)
    .sort((a, b) => Number(isOnline(b!.last_seen)) - Number(isOnline(a!.last_seen)));

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Люди</div>
        <div className="row" style={{ gap: 8 }}>
          <Tap className="icon-btn" style={{ position: "relative" }} onClick={() => nav.push(<NotificationsScreen />)} aria-label="Уведомления">
            <Bell size={20} />
            {unread.notices > 0 && <span className="badge">{unread.notices}</span>}
          </Tap>
          <Tap className="icon-btn" style={{ position: "relative" }} onClick={() => nav.push(<ChatsScreen />)} aria-label="Сообщения">
            <MessageCircle size={20} />
            {unread.messages > 0 && <span className="badge">{unread.messages}</span>}
          </Tap>
          <HeaderAvatar />
        </div>
      </div>

      <div className="friends-strip">
        <button className="friend-bubble tap" onClick={() => (invite.data ? shareInvite(invite.data) : nav.push(<FriendsScreen />))}>
          <span className="invite-circle">
            <Plus size={24} />
          </span>
          <span>Пригласить</span>
        </button>
        <button className="friend-bubble tap" onClick={() => nav.push(<FriendsScreen initial={fs.incoming.length ? "requests" : "friends"} />)}>
          <span className="invite-circle" style={{ position: "relative", borderStyle: "solid" }}>
            <span style={{ fontSize: 22 }}>👥</span>
            {fs.incoming.length > 0 && <span className="badge">{fs.incoming.length}</span>}
          </span>
          <span>Друзья</span>
        </button>
        <button className="friend-bubble tap" onClick={() => nav.push(<ChallengesScreen />)}>
          <span className="invite-circle" style={{ position: "relative", borderStyle: "solid" }}>
            <span style={{ fontSize: 22 }}>🏆</span>
            {chInvites > 0 && <span className="badge">{chInvites}</span>}
          </span>
          <span>Челленджи</span>
        </button>
        {friendList.map((p) => (
          <button key={p!.id} className="friend-bubble tap" onClick={() => nav.push(<PersonScreen id={p!.id} />)}>
            <span style={{ position: "relative" }}>
              <Avatar url={p!.avatar_url} name={p!.first_name} size={58} />
              {isOnline(p!.last_seen) && <span className="online-dot" style={{ width: 14, height: 14 }} />}
            </span>
            <span>{p!.first_name}</span>
          </button>
        ))}
      </div>

      {live && (
        <button className="live-ch press" onClick={() => nav.push(<ChallengeScreen id={live.id} />)}>
          <span className="live-ch-emoji">{live.emoji}</span>
          <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <div className="live-ch-title">{live.title}</div>
            <div className="live-ch-sub">
              {live.my_place === 1 ? "Ты лидируешь 🥇" : live.my_place ? `Ты #${live.my_place} из ${live.members}` : "Идёт челлендж"} · {METRICS[live.metric].fmt(live.my_value ?? 0)} {METRICS[live.metric].short}
            </div>
          </span>
          <span className="live-dot" />
        </button>
      )}

      <button className="composer press" onClick={() => nav.sheet(<NewPostSheet />, { full: true })}>
        <Avatar url={me?.avatar_url} name={me?.first_name ?? ""} size={38} />
        <span style={{ flex: 1 }}>Чем поделишься?</span>
        <PenLine size={19} />
      </button>
      <div className="chips-row" style={{ padding: "10px 0 0" }}>
        <Tap className="chip" onClick={() => nav.sheet(<NewPostSheet preset="day" />, { full: true })}>
          <Sun size={15} /> Итоги дня
        </Tap>
        <Tap className="chip" onClick={() => nav.sheet(<NewPostSheet preset="weight" />, { full: true })}>
          <Scale size={15} /> Прогресс веса
        </Tap>
      </div>

      <div style={{ margin: "18px 0 12px" }}>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "Все" },
            { value: "friends", label: "Друзья" },
          ]}
        />
      </div>

      {posts.length ? (
        <div className="stack">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
          <InfiniteSentinel query={feed} />
        </div>
      ) : feed.isLoading ? (
        <div className="stack">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton" style={{ height: 180, borderRadius: 28 }} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="big">{scope === "friends" ? "👥" : "🌱"}</div>
          {scope === "friends"
            ? "Здесь будут записи друзей. Пригласи кого-нибудь — вместе проще!"
            : "Лента пока пустая. Стань первым, кто поделится прогрессом!"}
          <div style={{ marginTop: 16 }}>
            <Tap className="btn btn-accent" onClick={() => nav.sheet(<NewPostSheet />, { full: true })}>
              Написать запись
            </Tap>
          </div>
        </div>
      )}
    </div>
  );
}
