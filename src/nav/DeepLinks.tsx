import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNav } from "./Nav";
import { acceptInvite, sk, useRealtime } from "@/data/social";
import { useUid } from "@/lib/auth";
import { tg, haptic } from "@/lib/telegram";
import { useToast } from "@/ui/Toast";
import { ChatScreen } from "@/pages/Chat";
import { PersonScreen } from "@/pages/Person";
import { PostScreen } from "@/pages/PostScreen";
import { FriendsScreen } from "@/pages/Friends";
import { supabase } from "@/lib/supabase";
import { AddFoodSheet } from "@/sheets/AddFood";
import { LogWeightSheet } from "@/sheets/LogWeight";
import { WeekReportScreen } from "@/pages/WeekReport";
import { ChallengeScreen } from "@/pages/Challenges";
import { useDay } from "@/state/day";
import { todayKey } from "@/lib/dates";
import type { Meal } from "@/lib/types";

/**
 * Переходы из бота и приглашений: ?ref=код, ?chat=id, ?post=id, ?user=id, ?friends,
 * ?add=приём, ?workout, ?weigh, ?week, ?challenge=id
 * (или start_param вида ref_код, если приложение открыто прямой ссылкой).
 */
export function DeepLinks() {
  const nav = useNav();
  const toast = useToast();
  const qc = useQueryClient();
  const uid = useUid();
  const { setDay } = useDay();
  const done = useRef(false);
  useRealtime();

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // Параметры перехода — в query (?chat=…); хэш занят данными запуска Telegram
    const hash = new URLSearchParams(location.search);
    const start = tg?.initDataUnsafe.start_param ?? "";
    if (start.startsWith("ref_")) hash.set("ref", start.slice(4));
    const linked = ["ref", "chat", "post", "user", "friends", "add", "workout", "weigh", "week", "challenge"].some((k) => hash.has(k));
    if (linked) history.replaceState(null, "", location.pathname + location.hash);

    (async () => {
      const ref = hash.get("ref");
      if (ref) {
        const inviter = await acceptInvite(ref).catch(() => null);
        if (inviter) {
          qc.invalidateQueries({ queryKey: sk.friendships });
          haptic.success();
          toast("Вы теперь друзья 🤝");
          nav.setTab("community");
          setTimeout(() => nav.push(<PersonScreen id={inviter} />), 300);
        }
        return;
      }
      const chat = hash.get("chat");
      if (chat) {
        const { data } = await supabase.from("conversations").select("user_a,user_b").eq("id", chat).maybeSingle();
        if (data) {
          nav.setTab("community");
          const other = data.user_a === uid ? data.user_b : data.user_a;
          setTimeout(() => nav.push(<ChatScreen cid={chat} otherId={other} />), 250);
        }
        return;
      }
      const post = hash.get("post");
      if (post) {
        nav.setTab("community");
        setTimeout(() => nav.push(<PostScreen id={post} />), 250);
        return;
      }
      const user = hash.get("user");
      if (user) {
        nav.setTab("community");
        setTimeout(() => nav.push(<PersonScreen id={user} />), 250);
        return;
      }
      if (hash.has("add")) {
        const m = Number(hash.get("add"));
        nav.setTab("diary");
        setDay(todayKey());
        setTimeout(() => nav.sheet(<AddFoodSheet meal={hash.get("add") && m >= 0 && m <= 3 ? (m as Meal) : undefined} />, { full: true }), 300);
        return;
      }
      if (hash.has("workout")) {
        nav.setTab("workouts");
        return;
      }
      if (hash.has("weigh")) {
        nav.setTab("diary");
        setTimeout(() => nav.sheet(<LogWeightSheet />), 300);
        return;
      }
      if (hash.has("week")) {
        const start = hash.get("week");
        setTimeout(() => nav.push(<WeekReportScreen start={start && /^d{4}-d{2}-d{2}$/.test(start) ? start : undefined} />), 250);
        return;
      }
      const challenge = hash.get("challenge");
      if (challenge) {
        nav.setTab("community");
        setTimeout(() => nav.push(<ChallengeScreen id={challenge} />), 250);
        return;
      }
      if (hash.has("friends")) {
        nav.setTab("community");
        setTimeout(() => nav.push(<FriendsScreen initial="requests" />), 250);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
