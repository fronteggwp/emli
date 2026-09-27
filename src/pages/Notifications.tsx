import { useEffect } from "react";
import { Bell, Check, Heart, MessageCircle, ShoppingBasket, Trophy, UserPlus, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNav } from "@/nav/Nav";
import { fullName, markNoticesRead, sk, useFriendActions, useFriendships, useNotices, usePeople } from "@/data/social";
import { ago } from "@/lib/dates";
import { haptic } from "@/lib/telegram";
import type { Notice } from "@/lib/types";
import { Screen } from "@/ui/Screen";
import { Avatar } from "@/ui/Avatar";
import { Tap } from "@/ui/Tap";
import { PersonScreen } from "./Person";
import { PostScreen } from "./PostScreen";
import { ChallengeScreen } from "./Challenges";
import { useChallengeActions, useMyChallenges } from "@/data/engage";
import { useRespondPlan } from "@/data/mealplan";
import { MealPlanScreen } from "./MealPlan";
import "./social.css";

const META: Record<Notice["kind"], { text: string; Icon: typeof Heart; color: string }> = {
  friend_request: { text: "хочет добавить тебя в друзья", Icon: UserPlus, color: "var(--kcal)" },
  friend_accept: { text: "теперь у тебя в друзьях", Icon: Users, color: "var(--good)" },
  like: { text: "оценил твою запись", Icon: Heart, color: "#ff4d6d" },
  comment: { text: "прокомментировал:", Icon: MessageCircle, color: "var(--carbs)" },
  challenge: { text: "зовёт тебя в челлендж", Icon: Trophy, color: "var(--fat)" },
  plan: { text: "делится с тобой планом питания и общим списком покупок", Icon: ShoppingBasket, color: "var(--good)" },
};

export function NotificationsScreen() {
  const nav = useNav();
  const qc = useQueryClient();
  const notices = useNotices();
  const fs = useFriendships();
  const actions = useFriendActions();
  const challenges = useMyChallenges();
  const chActions = useChallengeActions();
  const planRespond = useRespondPlan();
  const people = usePeople((notices.data ?? []).map((n) => n.actor_id));

  useEffect(() => {
    const t = setTimeout(() => markNoticesRead().then(() => qc.invalidateQueries({ queryKey: sk.notices })), 1200);
    return () => clearTimeout(t);
  }, [qc]);

  return (
    <Screen title="Уведомления">
      {notices.data?.length ? (
        <div className="list">
          {notices.data.map((n) => {
            const p = people.get(n.actor_id);
            const m = META[n.kind];
            const pending = n.kind === "friend_request" && fs.relation(n.actor_id) === "incoming";
            const chInvite = n.kind === "challenge" && challenges.data?.some((c) => c.id === n.challenge_id && c.status === "invited");
            return (
              <div
                key={n.id}
                className="person-row press"
                role="button"
                style={{ alignItems: "flex-start", background: n.read_at ? undefined : "rgba(124,140,255,.06)" }}
                onClick={() =>
                  nav.push(
                    n.plan_id ? <MealPlanScreen id={n.plan_id} /> : n.challenge_id ? <ChallengeScreen id={n.challenge_id} /> : n.post_id ? <PostScreen id={n.post_id} /> : <PersonScreen id={n.actor_id} />,
                  )
                }
              >
                <span style={{ position: "relative" }}>
                  <Avatar url={p?.avatar_url} name={p?.first_name ?? ""} size={44} />
                  <span
                    style={{ position: "absolute", right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11, background: m.color, display: "grid", placeItems: "center", border: "2px solid var(--card)" }}
                  >
                    <m.Icon size={11} color="#fff" fill={n.kind === "like" ? "#fff" : "none"} />
                  </span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, lineHeight: 1.35 }}>
                    <b>{fullName(p)}</b> {m.text}
                    {n.preview && <span className="muted"> «{n.preview}»</span>}
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                    {ago(n.created_at)}
                  </div>
                </span>
                {chInvite && (
                  <Tap
                    className="icon-btn"
                    style={{ width: 38, height: 38, background: "var(--good)", color: "#062a14" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      haptic.success();
                      chActions.respond.mutate({ id: n.challenge_id!, accept: true });
                    }}
                    aria-label="Участвовать"
                  >
                    <Check size={18} strokeWidth={3} />
                  </Tap>
                )}
                {n.kind === "plan" && n.plan_id && (
                  <Tap
                    className="icon-btn"
                    style={{ width: 38, height: 38, background: "var(--good)", color: "#062a14" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      haptic.success();
                      planRespond.mutate({ id: n.plan_id!, accept: true });
                    }}
                    aria-label="Принять"
                  >
                    <Check size={18} strokeWidth={3} />
                  </Tap>
                )}
                {pending && (
                  <Tap
                    className="icon-btn"
                    style={{ width: 38, height: 38, background: "var(--good)", color: "#062a14" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      haptic.success();
                      actions.respond.mutate({ id: n.actor_id, accept: true });
                    }}
                    aria-label="Принять"
                  >
                    <Check size={18} strokeWidth={3} />
                  </Tap>
                )}
              </div>
            );
          })}
        </div>
      ) : notices.isLoading ? (
        <div className="skeleton" style={{ height: 200, borderRadius: 24 }} />
      ) : (
        <div className="empty">
          <Bell size={40} style={{ display: "block", margin: "0 auto 10px" }} />
          Здесь появятся лайки, комментарии, заявки в друзья приглашения в челленджи и общие планы питания
        </div>
      )}
    </Screen>
  );
}
