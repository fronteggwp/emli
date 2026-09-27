import { useState } from "react";
import { motion } from "motion/react";
import { Check, UserPlus, X } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { Avatar } from "@/ui/Avatar";
import { Icon3D } from "@/ui/Icon3D";
import { useToast } from "@/ui/Toast";
import { useUid } from "@/lib/auth";
import { confirmDialog, haptic } from "@/lib/telegram";
import { useFriendships, usePeople } from "@/data/social";
import { usePlanMembers, useRemoveMember, useSharePlan, type MealPlan } from "@/data/mealplan";
import { FriendsScreen } from "@/pages/Friends";
import "./mealplan.css";

/** Семья: кто видит меню и отмечает покупки; пригласить друзей */
export function PlanShareSheet({ plan, own }: { plan: MealPlan; own: boolean }) {
  const nav = useNav();
  const layer = useLayer();
  const toast = useToast();
  const uid = useUid();
  const members = usePlanMembers(plan.id);
  const fs = useFriendships();
  const share = useSharePlan(plan.id);
  const remove = useRemoveMember(plan.id);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const inPlan = new Set((members.data ?? []).map((m) => m.user_id));
  const candidates = fs.friends.filter((f) => !inPlan.has(f));
  const people = usePeople([plan.owner_id, ...inPlan, ...candidates]);
  const owner = people.get(plan.owner_id);

  const invite = async () => {
    haptic.success();
    const n = await share.mutateAsync([...sel]);
    setSel(new Set());
    toast(n ? `Приглашение отправлено (${n})` : "Уже приглашены");
  };

  return (
    <>
      <SheetHeader title="Семья и общий список" />
      <div className="sheet-body">
        <div className="mp-share-hero">
          <Icon3D name="friends" size={56} />
          <p>Участники видят меню и отмечают покупки в общем списке — галочки появляются у всех сразу.</p>
        </div>

        <div className="mp-label">В плане</div>
        <div className="card list" style={{ padding: 0 }}>
          <div className="list-item">
            <Avatar url={owner?.avatar_url} name={owner?.first_name ?? "?"} size={38} />
            <span style={{ flex: 1 }}>
              <b>{plan.owner_id === uid ? "Ты" : owner?.first_name}</b>
              <div className="muted" style={{ fontSize: 13 }}>
                составил(а) план
              </div>
            </span>
          </div>
          {(members.data ?? []).map((m) => {
            const p = people.get(m.user_id);
            return (
              <div key={m.user_id} className="list-item">
                <Avatar url={p?.avatar_url} name={p?.first_name ?? "?"} size={38} />
                <span style={{ flex: 1 }}>
                  <b>{m.user_id === uid ? "Ты" : p?.first_name ?? "…"}</b>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {m.status === "joined" ? "в плане" : "приглашение отправлено"}
                  </div>
                </span>
                {own && (
                  <Tap
                    className="icon-btn"
                    style={{ width: 34, height: 34 }}
                    onClick={async () => {
                      if (!(await confirmDialog(`Убрать ${p?.first_name ?? "участника"} из плана?`))) return;
                      haptic.rigid();
                      remove.mutate(m.user_id);
                    }}
                    aria-label="Убрать"
                  >
                    <X size={15} />
                  </Tap>
                )}
              </div>
            );
          })}
        </div>

        {own && (
          <>
            <div className="mp-label">Позвать из друзей</div>
            {candidates.length ? (
              <div className="card list" style={{ padding: 0 }}>
                {candidates.map((id) => {
                  const p = people.get(id);
                  const on = sel.has(id);
                  return (
                    <Tap
                      key={id}
                      className="list-item"
                      onClick={() => {
                        haptic.select();
                        const n = new Set(sel);
                        if (on) n.delete(id);
                        else n.add(id);
                        setSel(n);
                      }}
                    >
                      <Avatar url={p?.avatar_url} name={p?.first_name ?? "?"} size={38} />
                      <span style={{ flex: 1, textAlign: "left" }}>
                        <b>{[p?.first_name, p?.last_name].filter(Boolean).join(" ") || "…"}</b>
                      </span>
                      <span className={`mp-box ${on ? "on" : ""}`}>
                        {on && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <Check size={13} strokeWidth={3} />
                          </motion.span>
                        )}
                      </span>
                    </Tap>
                  );
                })}
              </div>
            ) : (
              <div className="mp-hint">
                {fs.friends.length ? "Все друзья уже в плане." : "Общий список работает с друзьями в Emli: добавь партнёра или семью в друзья — и позови сюда."}
              </div>
            )}
            <Tap
              className="btn btn-block"
              style={{ marginTop: 10 }}
              onClick={() => {
                layer.close();
                setTimeout(() => nav.push(<FriendsScreen />), 200);
              }}
            >
              <UserPlus size={18} /> Добавить друзей
            </Tap>
          </>
        )}
      </div>
      {own && sel.size > 0 && (
        <div className="sheet-foot">
          <Tap className="btn btn-accent btn-block" disabled={share.isPending} onClick={invite}>
            Пригласить ({sel.size})
          </Tap>
        </div>
      )}
    </>
  );
}
