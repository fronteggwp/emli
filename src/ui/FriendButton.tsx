import { Check, Clock, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFriendActions, useFriendships } from "@/data/social";
import { haptic } from "@/lib/telegram";
import { Tap } from "./Tap";
import { useToast } from "./Toast";

/** Кнопка рядом с человеком в списке: добавить / заявка / принять / в друзьях */
export function FriendButton({ id }: { id: string }) {
  const fs = useFriendships();
  const actions = useFriendActions();
  const toast = useToast();
  const qc = useQueryClient();
  const rel = fs.relation(id);
  if (rel === "self") return null;
  if (rel === "friends")
    return (
      <span className="faint row" style={{ gap: 4, fontSize: 13 }}>
        <Check size={14} /> друзья
      </span>
    );
  if (rel === "outgoing")
    return (
      <span className="faint row" style={{ gap: 4, fontSize: 13 }}>
        <Clock size={14} /> заявка
      </span>
    );
  return (
    <Tap
      className="btn btn-sm"
      style={{ height: 34, padding: "0 12px", background: rel === "incoming" ? "var(--good)" : "var(--kcal)", color: rel === "incoming" ? "#062a14" : "#fff" }}
      onClick={async (e) => {
        e.stopPropagation();
        haptic.medium();
        if (rel === "incoming") {
          await actions.respond.mutateAsync({ id, accept: true });
          toast("Теперь вы друзья 🤝");
        } else {
          const st = await actions.request.mutateAsync(id);
          toast(st === "accepted" ? "Теперь вы друзья 🤝" : "Заявка отправлена");
        }
        qc.invalidateQueries({ queryKey: ["suggestions"] });
        qc.invalidateQueries({ queryKey: ["friends-of"] });
      }}
    >
      <UserPlus size={15} /> {rel === "incoming" ? "Принять" : "Добавить"}
    </Tap>
  );
}
