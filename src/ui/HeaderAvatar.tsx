import { useNav } from "@/nav/Nav";
import { useProfile } from "@/data/api";
import { haptic } from "@/lib/telegram";
import { Avatar } from "./Avatar";
import { ProfileScreen } from "@/pages/Profile";

/** Аватарка в шапке вкладок — вход в профиль и настройки */
export function HeaderAvatar() {
  const nav = useNav();
  const p = useProfile().data;
  return (
    <button
      className="tap"
      style={{ borderRadius: "50%", ["--tap-scale" as string]: 0.9 }}
      onClick={() => {
        haptic.tap();
        nav.push(<ProfileScreen />);
      }}
      aria-label="Профиль"
    >
      <Avatar url={p?.avatar_url} name={p?.first_name ?? ""} size={40} />
    </button>
  );
}
