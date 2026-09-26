import { motion } from "motion/react";
import { BookOpen, ChartColumn, Plus, UserRound, Users } from "lucide-react";
import { useNav, type Tab } from "@/nav/Nav";
import { haptic } from "@/lib/telegram";
import { QuickActions } from "@/sheets/QuickActions";
import "./tabbar.css";

const ITEMS: { tab: Tab; label: string; Icon: typeof BookOpen }[] = [
  { tab: "diary", label: "Дневник", Icon: BookOpen },
  { tab: "stats", label: "Прогресс", Icon: ChartColumn },
  { tab: "community", label: "Люди", Icon: Users },
  { tab: "profile", label: "Профиль", Icon: UserRound },
];

export function TabBar() {
  const nav = useNav();
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
        <motion.span animate={{ scale: on ? 1.08 : 1, y: on ? -1 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
          <i.Icon size={24} strokeWidth={on ? 2.4 : 1.9} />
        </motion.span>
        <span className="tab-label">{i.label}</span>
        {on && <motion.span layoutId="tab-dot" className="tab-dot" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
      </button>
    );
  };
  return (
    <div className="tabbar">
      <div className="tabbar-inner">
        {ITEMS.slice(0, 2).map(render)}
        <motion.button
          className="fab"
          whileTap={{ scale: 0.88 }}
          transition={{ type: "spring", stiffness: 600, damping: 22 }}
          onClick={() => {
            haptic.medium();
            nav.sheet(<QuickActions />);
          }}
          aria-label="Добавить"
        >
          <Plus size={30} strokeWidth={2.6} />
        </motion.button>
        {ITEMS.slice(2).map(render)}
      </div>
    </div>
  );
}
