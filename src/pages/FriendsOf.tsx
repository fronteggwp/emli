import { Lock } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { fullName, useFriendsOf, usePerson } from "@/data/social";
import { useUid } from "@/lib/auth";
import { Screen } from "@/ui/Screen";
import { PersonRow } from "@/ui/PersonRow";
import { FriendButton } from "@/ui/FriendButton";
import { PersonScreen } from "./Person";
import "./social.css";

/** Друзья другого человека — отсюда удобно добавлять «друзей друзей» */
export function FriendsOfScreen({ id }: { id: string }) {
  const nav = useNav();
  const uid = useUid();
  const person = usePerson(id);
  const list = useFriendsOf(id);
  const mutual = (list.data ?? []).filter((p) => p.mutual);
  const others = (list.data ?? []).filter((p) => !p.mutual);

  return (
    <Screen title={`Друзья · ${person.data?.first_name ?? ""}`}>
      {list.isLoading ? (
        <div className="skeleton" style={{ height: 240, borderRadius: 24 }} />
      ) : !list.data?.length ? (
        <div className="empty">
          {person.data?.is_private ? (
            <>
              <Lock size={32} style={{ display: "block", margin: "0 auto 8px" }} />
              {fullName(person.data)} скрывает список друзей
            </>
          ) : (
            "Пока нет друзей"
          )}
        </div>
      ) : (
        <>
          {mutual.length > 0 && (
            <>
              <div className="group-label" style={{ marginTop: 4 }}>
                Общие друзья · {mutual.length}
              </div>
              <div className="list">
                {mutual.map((p) => (
                  <PersonRow key={p.id} p={p} onClick={() => nav.push(<PersonScreen id={p.id} />)} right={<FriendButton id={p.id} />} />
                ))}
              </div>
            </>
          )}
          {others.length > 0 && (
            <>
              <div className="group-label">{mutual.length ? "Остальные" : "Все друзья"} · {others.length}</div>
              <div className="list">
                {others.map((p) => (
                  <PersonRow
                    key={p.id}
                    p={p}
                    sub={p.id === uid ? "это ты" : undefined}
                    onClick={() => p.id !== uid && nav.push(<PersonScreen id={p.id} />)}
                    right={<FriendButton id={p.id} />}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
