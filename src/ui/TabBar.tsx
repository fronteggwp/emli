import { BookOpen, ChartColumn, Dumbbell, Plus, Users } from "lucide-react";
import { useNav, type Tab } from "@/nav/Nav";
import { haptic } from "@/lib/telegram";
import { QuickActions } from "@/sheets/QuickActions";
import { useUnreadCounts } from "@/data/social";
import "./tabbar.css";

const ITEMS: { tab: Tab; label: string; Icon: typeof BookOpen }[] = [
  { tab: "diary", label: "Дневник", Icon: BookOpen },
  { tab: "workouts", label: "Спорт", Icon: Dumbbell },
  { tab: "stats", label: "Прогресс", Icon: ChartColumn },
  { tab: "community", label: "Люди", Icon: Users },
];

export function TabBar() {
  const nav = useNav();
  const unread = useUnreadCounts();
  const render = (i: (typeof ITEMS)[number]) => {
    const on = nav.tab === i.tab;
    return (
      <button
        key={i.tab}
        className={`tab ${on ? "on" : ""}`}
        onClick={() => {
          if (!on) haptic.select();
          nav.setTab(i.tab);
        }}
      >
        <span className="tab-icon" style={{ position: "relative" }}>
          <i.Icon size={24} strokeWidth={on ? 2.4 : 1.9} />
          {i.tab === "community" && unread.total > 0 && <span className="badge">{unread.total > 99 ? "99+" : unread.total}</span>}
        </span>
        <span className="tab-label">{i.label}</span>
      </button>
    );
  };
  return (
    <div className="tabbar">
      <div className="tabbar-inner">
        {ITEMS.slice(0, 2).map(render)}
        <button
          className="fab tap"
          style={{ ["--tap-scale" as string]: 0.88 }}
          onClick={() => {
            haptic.medium();
            nav.sheet(<QuickActions />);
          }}
          aria-label="Добавить"
        >
          <Plus size={30} strokeWidth={2.6} />
        </button>
        {ITEMS.slice(2).map(render)}
      </div>
    </div>
  );
}
