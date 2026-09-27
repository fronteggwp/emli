import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { ek, syncAchievements, useAchievements } from "@/data/engage";
import { ACHIEVEMENTS, ACH_GROUPS, achByKey, groupOf } from "@/lib/achievements";
import { fmt } from "@/lib/dates";
import { haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "./engage.css";
import "./achievements.css";

export function AchievementsScreen({ uid, name }: { uid: string; name?: string }) {
  const me = useUid();
  const q = useAchievements(uid);
  const earned = new Map((q.data ?? []).map((e) => [e.key, e.earned_at]));
  const own = uid === me;
  return (
    <Screen title={own ? "Достижения" : `Достижения · ${name ?? ""}`}>
      <div className="ach-summary">
        <div className="num ach-count">
          {earned.size}
          <span>/{ACHIEVEMENTS.length}</span>
        </div>
        <div className="ach-progress">
          <motion.i initial={{ width: 0 }} animate={{ width: `${(earned.size / ACHIEVEMENTS.length) * 100}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {own ? "Открываются сами — просто веди дневник и тренируйся" : "Открытые достижения"}
        </div>
      </div>
      {ACH_GROUPS.map((g) => (
        <div key={g.id}>
          <div className="section-title">{g.name}</div>
          <div className="ach-grid">
            {ACHIEVEMENTS.filter((a) => a.group === g.id).map((a, i) => {
              const at = earned.get(a.key);
              return (
                <motion.div
                  key={a.key}
                  className={`ach ${at ? "on" : ""}`}
                  style={{ ["--c1" as string]: g.colors[0], ["--c2" as string]: g.colors[1] }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <span className="ach-medal">{a.emoji}</span>
                  <span className="ach-title">{a.title}</span>
                  <span className="ach-desc">{at ? fmt(at.slice(0, 10), "d MMM yyyy") : a.desc}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </Screen>
  );
}

/** Полоска последних достижений для профиля */
export function AchievementStrip({ uid, name }: { uid: string; name?: string }) {
  const nav = useNav();
  const q = useAchievements(uid);
  const list = (q.data ?? []).map((e) => achByKey(e.key)).filter((a): a is NonNullable<typeof a> => !!a);
  if (q.isLoading) return null;
  return (
    <Tap className="ach-strip" scale={0.98} onClick={() => nav.push(<AchievementsScreen uid={uid} name={name} />)}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>Достижения</b>
          <span className="muted num" style={{ fontSize: 13 }}>
            {list.length}/{ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="ach-strip-row">
          {list.length ? (
            list.slice(0, 7).map((a) => (
              <span
                key={a.key}
                className="ach-mini"
                style={{ background: `linear-gradient(135deg, ${groupOf(a.group).colors[0]}, ${groupOf(a.group).colors[1]})` }}
              >
                {a.emoji}
              </span>
            ))
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>
              Пока пусто — первые откроются совсем скоро
            </span>
          )}
        </div>
      </span>
      <ChevronRight size={18} className="faint" />
    </Tap>
  );
}

/** Проверяет новые достижения после любых изменений данных и празднует их */
export function AchievementWatcher() {
  const qc = useQueryClient();
  const uid = useUid();
  const toast = useToast();
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const run = async () => {
      const fresh = await syncAchievements().catch(() => []);
      if (!fresh.length) return;
      qc.invalidateQueries({ queryKey: ek.achievements(uid) });
      fresh.forEach((k, i) => {
        const a = achByKey(k);
        if (!a) return;
        setTimeout(() => {
          haptic.success();
          toast(`Достижение: ${a.title}`, <span style={{ fontSize: 18 }}>{a.emoji}</span>);
        }, 600 + i * 2400);
      });
    };
    const schedule = (ms: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(run, ms);
    };
    schedule(4000);
    const unsub = qc.getMutationCache().subscribe((e) => {
      if (e.type === "updated" && e.action.type === "success") schedule(3500);
    });
    return () => {
      unsub();
      window.clearTimeout(timer.current);
    };
  }, [qc, uid, toast]);

  return null;
}
