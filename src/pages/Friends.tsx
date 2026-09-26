import { useState } from "react";
import { Check, Copy, Search, Send, UserPlus, X } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useFriendActions, useFriendships, useInviteLink, usePeople, useSearchPeople } from "@/data/social";
import { useDebounced } from "@/lib/hooks";
import { haptic, tg } from "@/lib/telegram";
import type { Person } from "@/lib/types";
import { Screen } from "@/ui/Screen";
import { PersonRow } from "@/ui/PersonRow";
import { Segmented } from "@/ui/Segmented";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { PersonScreen } from "./Person";
import "./social.css";

export function shareInvite(link: string) {
  const text = "Давай вместе следить за питанием в Emli 🌿";
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  if (tg) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}

export function FriendsScreen({ initial = "friends" }: { initial?: "friends" | "requests" }) {
  const nav = useNav();
  const toast = useToast();
  const fs = useFriendships();
  const actions = useFriendActions();
  const invite = useInviteLink();
  const [tab, setTab] = useState<"friends" | "requests">(initial);
  const [q, setQ] = useState("");
  const term = useDebounced(q, 250);
  const found = useSearchPeople(term);
  const people = usePeople([...fs.friends, ...fs.incoming, ...fs.outgoing]);

  const open = (p: Person) => nav.push(<PersonScreen id={p.id} />);

  const actionFor = (p: Person) => {
    const rel = fs.relation(p.id);
    if (rel === "friends") return <span className="faint" style={{ fontSize: 13 }}>в друзьях</span>;
    if (rel === "outgoing") return <span className="faint" style={{ fontSize: 13 }}>заявка</span>;
    return (
      <Tap
        className="icon-btn"
        style={{ width: 38, height: 38, background: "var(--kcal)", color: "#fff" }}
        onClick={async (e) => {
          e.stopPropagation();
          haptic.medium();
          const st = await actions.request.mutateAsync(p.id);
          toast(st === "accepted" ? "Теперь вы друзья 🤝" : "Заявка отправлена");
        }}
        aria-label="Добавить"
      >
        <UserPlus size={18} />
      </Tap>
    );
  };

  const list = (ids: string[]) => ids.map((id) => people.get(id)).filter((p): p is Person => !!p);

  return (
    <Screen title="Друзья">
      <div className="search-box" style={{ margin: 0 }}>
        <Search size={19} className="faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти по имени или @нику" autoCapitalize="none" />
        {q && (
          <button className="icon-btn" onClick={() => setQ("")}>
            <X size={16} />
          </button>
        )}
      </div>

      {term.trim().replace(/^@/, "").length >= 2 ? (
        <div className="list" style={{ marginTop: 12 }}>
          {found.data?.map((p) => <PersonRow key={p.id} p={p} onClick={() => open(p)} right={actionFor(p)} />)}
          {found.data?.length === 0 && <div className="empty">Никого не нашёл</div>}
          {found.isLoading && <div className="skeleton" style={{ height: 64, margin: 12 }} />}
        </div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 12, background: "radial-gradient(120% 120% at 0% 0%, rgba(124,140,255,.2), transparent 60%), var(--card)" }}>
            <div className="card-title">Пригласи друзей</div>
            <div className="card-sub" style={{ marginBottom: 14 }}>
              Отправь ссылку — друг откроет Emli, и вы сразу окажетесь в друзьях
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Tap className="btn btn-accent btn-block btn-sm" disabled={!invite.data} onClick={() => invite.data && shareInvite(invite.data)}>
                <Send size={16} /> Отправить в Telegram
              </Tap>
              <Tap
                className="icon-btn"
                style={{ width: 40, height: 40 }}
                disabled={!invite.data}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(invite.data!);
                    haptic.success();
                    toast("Ссылка скопирована", <Check size={18} color="var(--good)" />);
                  } catch {
                    toast(invite.data!);
                  }
                }}
                aria-label="Скопировать"
              >
                <Copy size={17} />
              </Tap>
            </div>
          </div>

          <div style={{ margin: "16px 0 12px" }}>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "friends", label: `Друзья${fs.friends.length ? ` · ${fs.friends.length}` : ""}` },
                { value: "requests", label: `Заявки${fs.incoming.length ? ` · ${fs.incoming.length}` : ""}` },
              ]}
            />
          </div>

          {tab === "friends" ? (
            fs.friends.length ? (
              <div className="list">
                {list(fs.friends).map((p) => (
                  <PersonRow key={p.id} p={p} onClick={() => open(p)} />
                ))}
              </div>
            ) : (
              <div className="empty">
                <div className="big">👥</div>
                Пока нет друзей. Найди их по нику или отправь приглашение.
              </div>
            )
          ) : (
            <>
              {fs.incoming.length ? (
                <div className="list">
                  {list(fs.incoming).map((p) => (
                    <PersonRow
                      key={p.id}
                      p={p}
                      sub="хочет добавить тебя"
                      onClick={() => open(p)}
                      right={
                        <div className="row" style={{ gap: 6 }}>
                          <Tap
                            className="icon-btn"
                            style={{ width: 38, height: 38 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              actions.respond.mutate({ id: p.id, accept: false });
                            }}
                            aria-label="Отклонить"
                          >
                            <X size={17} />
                          </Tap>
                          <Tap
                            className="icon-btn"
                            style={{ width: 38, height: 38, background: "var(--good)", color: "#062a14" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              haptic.success();
                              actions.respond.mutate({ id: p.id, accept: true });
                            }}
                            aria-label="Принять"
                          >
                            <Check size={18} strokeWidth={3} />
                          </Tap>
                        </div>
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="empty">Новых заявок нет</div>
              )}
              {fs.outgoing.length > 0 && (
                <>
                  <div className="group-label">Ты отправил</div>
                  <div className="list">
                    {list(fs.outgoing).map((p) => (
                      <PersonRow
                        key={p.id}
                        p={p}
                        sub="ждём ответа"
                        onClick={() => open(p)}
                        right={
                          <button className="faint" style={{ fontSize: 13 }} onClick={(e) => { e.stopPropagation(); actions.remove.mutate(p.id); }}>
                            отменить
                          </button>
                        }
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
