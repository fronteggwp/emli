import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { useProfile, useSettings } from "@/data/api";
import { NavProvider, type Tab } from "@/nav/Nav";
import { DayProvider } from "@/state/day";
import { TabBar } from "@/ui/TabBar";
import { DeepLinks } from "@/nav/DeepLinks";
import { Logo } from "@/ui/Logo";
import { DiaryPage } from "@/pages/Diary";
import { StatsPage } from "@/pages/Stats";
import { CommunityPage } from "@/pages/Community";
import { WorkoutsPage } from "@/pages/Workouts";
import { WorkoutProvider } from "@/state/workout";
import { ActiveBar } from "@/ui/ActiveBar";
import { Onboarding } from "@/pages/Onboarding";
import { AchievementWatcher } from "@/pages/Achievements";
import { useSyncTimezone } from "@/data/engage";

export function App() {
  const auth = useAuth();
  return (
    <AnimatePresence mode="wait">
      {auth.status === "loading" && <Splash key="splash" />}
      {auth.status === "outside" && <Outside key="outside" />}
      {auth.status === "error" && <ErrorScreen key="error" message={auth.message} />}
      {auth.status === "ready" && <Main key="main" />}
    </AnimatePresence>
  );
}

function Main() {
  const settings = useSettings();
  const profile = useProfile();
  const [justOnboarded, setJustOnboarded] = useState(false);

  if (settings.isLoading || profile.isLoading) return <Splash />;
  if (settings.error || profile.error) return <ErrorScreen message={(settings.error ?? profile.error)!.message} />;
  if (!settings.data?.onboarded && !justOnboarded) return <Onboarding onDone={() => setJustOnboarded(true)} />;

  return (
    <DayProvider>
      <WorkoutProvider>
      <motion.div
        style={{ position: "absolute", inset: 0 }}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <NavProvider tabs={(tab) => <Tabs tab={tab} />} />
      </motion.div>
      </WorkoutProvider>
    </DayProvider>
  );
}

const PAGES: Record<Tab, () => React.ReactNode> = {
  diary: () => <DiaryPage />,
  stats: () => <StatsPage />,
  community: () => <CommunityPage />,
  workouts: () => <WorkoutsPage />,
};

/** Вкладки остаются смонтированными — сохраняется прокрутка и не мигают данные */
function Tabs({ tab }: { tab: Tab }) {
  const [visited, setVisited] = useState<Tab[]>([tab]);
  if (!visited.includes(tab)) setVisited([...visited, tab]);
  return (
    <>
      {visited.map((t) => (
        <TabPage key={t} active={t === tab}>
          {PAGES[t]()}
        </TabPage>
      ))}
      <div className="top-scrim" />
      <ActiveBar tab={tab} />
      <TabBar />
      <DeepLinks />
      <Background />
    </>
  );
}

/** Фоновые задачи: часовой пояс для напоминаний, проверка достижений */
function Background() {
  useSyncTimezone();
  return <AchievementWatcher />;
}

function TabPage({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return <div className={`tab-page ${active && shown ? "on" : ""}`}>{children}</div>;
}

function Splash() {
  return (
    <motion.div className="center-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Logo size={84} animated />
    </motion.div>
  );
}

function Outside() {
  return (
    <motion.div className="center-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Logo size={72} animated />
      <div className="page-title" style={{ fontSize: 26 }}>
        Emli
      </div>
      <p className="muted" style={{ maxWidth: 300, margin: 0 }}>
        Приложение работает внутри Telegram. Открой бота и нажми кнопку «Открыть».
      </p>
    </motion.div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <motion.div className="center-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div style={{ fontSize: 44 }}>😵‍💫</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Не получилось войти</div>
      <p className="muted" style={{ maxWidth: 300, margin: 0, fontSize: 14 }}>
        {message}
      </p>
      <button className="btn btn-primary" onClick={() => location.reload()}>
        Попробовать снова
      </button>
    </motion.div>
  );
}
