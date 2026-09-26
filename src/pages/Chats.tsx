import { MessageCircle } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { fullName, useConversations, usePeople } from "@/data/social";
import { ago, isOnline } from "@/lib/dates";
import { Screen } from "@/ui/Screen";
import { Avatar } from "@/ui/Avatar";
import { Tap } from "@/ui/Tap";
import { ChatScreen } from "./Chat";
import { FriendsScreen } from "./Friends";
import "./social.css";

export function ChatsScreen() {
  const nav = useNav();
  const uid = useUid();
  const convs = useConversations();
  const people = usePeople((convs.data ?? []).map((c) => c.other_id));

  return (
    <Screen title="Сообщения">
      {convs.data?.length ? (
        <div className="list">
          {convs.data.map((c) => {
            const p = people.get(c.other_id);
            const mine = c.last_sender === uid;
            return (
              <div key={c.id} className="person-row press" role="button" onClick={() => nav.push(<ChatScreen cid={c.id} otherId={c.other_id} />)}>
                <span style={{ position: "relative" }}>
                  <Avatar url={p?.avatar_url} name={p?.first_name ?? ""} size={52} />
                  {isOnline(p?.last_seen) && <span className="online-dot" />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="person-name" style={{ flex: 1 }}>
                      {fullName(p)}
                    </span>
                    <span className="faint" style={{ fontSize: 12 }}>
                      {ago(c.last_message_at)}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 2 }}>
                    <span className="person-sub" style={{ flex: 1, color: c.unread ? "var(--text)" : undefined }}>
                      {mine && <span className="faint">Вы: </span>}
                      {c.last_message}
                    </span>
                    {c.unread > 0 && (
                      <span className="badge" style={{ position: "static", border: 0, background: "var(--kcal)" }}>
                        {c.unread}
                      </span>
                    )}
                  </div>
                </span>
              </div>
            );
          })}
        </div>
      ) : convs.isLoading ? (
        <div className="skeleton" style={{ height: 200, borderRadius: 24 }} />
      ) : (
        <div className="empty">
          <MessageCircle size={40} style={{ display: "block", margin: "0 auto 10px" }} />
          Переписок пока нет. Открой профиль друга и нажми «Написать».
          <div style={{ marginTop: 16 }}>
            <Tap className="btn btn-accent" onClick={() => nav.push(<FriendsScreen />)}>
              Найти друзей
            </Tap>
          </div>
        </div>
      )}
    </Screen>
  );
}
