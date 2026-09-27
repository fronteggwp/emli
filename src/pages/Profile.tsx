import { BarChart3, ChefHat, ChevronRight, Info, Newspaper, Package, Pencil, Ruler as RulerIcon, Settings, Target, Trophy, Users } from "lucide-react";
import { motion } from "motion/react";
import { useNav } from "@/nav/Nav";
import { useProfile } from "@/data/api";
import { useInsights } from "@/data/insights";
import { fmtKg } from "@/lib/nutrition";
import { NumberTicker } from "@/ui/NumberTicker";
import { Avatar } from "@/ui/Avatar";
import { GoalScreen } from "./Goal";
import { MyFoodsScreen } from "./MyFoods";
import { EditBodySheet } from "@/sheets/EditBody";
import { AboutSheet } from "@/sheets/About";
import { EditProfileSheet } from "@/sheets/EditProfile";
import { FriendsScreen } from "./Friends";
import { PersonScreen } from "./Person";
import { useFriendships, usePublicStats } from "@/data/social";
import { Tap } from "@/ui/Tap";
import { Screen } from "@/ui/Screen";
import { AchievementStrip } from "./Achievements";
import { SettingsScreen } from "./Settings";
import { RecipesScreen } from "./Recipes";
import { ChallengesScreen } from "./Challenges";
import { WeekReportScreen } from "./WeekReport";

/** Профиль открывается экраном по аватарке в шапке вкладок */
export function ProfileScreen() {
  return (
    <Screen title="Профиль">
      <ProfileBody />
    </Screen>
  );
}

function ProfileBody() {
  const nav = useNav();
  const profile = useProfile();
  const ins = useInsights();
  const fs = useFriendships();
  const p = profile.data;
  // Серия и число дней — с сервера, по всей истории (локальные данные — только за полгода)
  const stats = usePublicStats(p?.id ?? "");
  const lost = ins.goal && ins.current != null ? ins.current - ins.goal.start_weight : null;

  const items = [
    { Icon: Target, title: "Цель и программа", sub: "Калории, БЖУ, темп", go: () => nav.push(<GoalScreen />) },
    { Icon: BarChart3, title: "Итоги недели", sub: "Оценка, питание, вес и тренировки", go: () => nav.push(<WeekReportScreen />) },
    { Icon: ChefHat, title: "Рецепты", sub: "База блюд с КБЖУ, избранное и свои рецепты", go: () => nav.push(<RecipesScreen />) },
    { Icon: Package, title: "Мои продукты", sub: "Созданные и отсканированные", go: () => nav.push(<MyFoodsScreen />) },
    { Icon: RulerIcon, title: "Параметры тела", sub: "Рост, возраст, активность", go: () => nav.sheet(<EditBodySheet />) },
    { Icon: Users, title: "Друзья", sub: fs.friends.length ? `${fs.friends.length} в друзьях${fs.incoming.length ? ` · ${fs.incoming.length} заявки` : ""}` : "Найти и пригласить", go: () => nav.push(<FriendsScreen initial={fs.incoming.length ? "requests" : "friends"} />) },
    { Icon: Trophy, title: "Челленджи", sub: "Соревнования с друзьями", go: () => nav.push(<ChallengesScreen />) },
    { Icon: Newspaper, title: "Мои записи", sub: "Как меня видят другие", go: () => p && nav.push(<PersonScreen id={p.id} />) },
    { Icon: Settings, title: "Настройки", sub: "Тема, напоминания, данные", go: () => nav.push(<SettingsScreen />) },
    { Icon: Info, title: "О приложении", sub: "Как считаются цифры", go: () => nav.sheet(<AboutSheet />) },
  ];

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "6px 0 18px" }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
          <Avatar url={p?.avatar_url} name={p?.first_name ?? ""} size={96} ring />
        </motion.div>
        <div style={{ fontSize: 24, fontWeight: 750, marginTop: 14, letterSpacing: "-0.02em" }}>
          {[p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Без имени"}
        </div>
        {p?.username && <div className="muted" style={{ marginTop: 2 }}>@{p.username}</div>}
        {p?.bio && <div style={{ marginTop: 8, fontSize: 15, maxWidth: 320 }}>{p.bio}</div>}
        <Tap className="btn btn-sm" style={{ marginTop: 14 }} onClick={() => nav.sheet(<EditProfileSheet />)}>
          <Pencil size={15} /> Редактировать профиль
        </Tap>
      </div>

      <div className="kv" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <StatTile label="дней с записями" value={stats.data?.logged_days ?? ins.loggedDays} />
        <StatTile label="серия дней" value={stats.data?.streak ?? ins.streak} suffix="🔥" />
        <StatTile
          label={lost != null && lost > 0 ? "набрано" : "сброшено"}
          value={lost != null ? Math.abs(lost) : 0}
          digits={1}
          suffix="кг"
        />
      </div>

      {p && <AchievementStrip uid={p.id} />}

      <div className="list" style={{ marginTop: 20 }}>
        {items.map((i) => (
          <button key={i.title} className="list-item press" onClick={i.go}>
            <span className="li-icon">
              <i.Icon size={21} />
            </span>
            <span style={{ flex: 1 }}>
              <div className="li-title">{i.title}</div>
              <div className="li-sub">{i.sub}</div>
            </span>
            <ChevronRight size={18} className="faint" />
          </button>
        ))}
      </div>

      {ins.current != null && (
        <div className="faint" style={{ textAlign: "center", fontSize: 13, marginTop: 20 }}>
          Текущий вес по тренду: {fmtKg(ins.current)} кг
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, digits = 0, suffix }: { label: string; value: number; digits?: number; suffix?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: "14px 10px", textAlign: "center" }}>
      <div className="num" style={{ fontSize: 22, fontWeight: 800 }}>
        <NumberTicker value={value} digits={digits} />
        {suffix && <span style={{ fontSize: 14, marginLeft: 3 }}>{suffix}</span>}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
