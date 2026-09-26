import type { ReactNode } from "react";
import { fullName } from "@/data/social";
import { isOnline } from "@/lib/dates";
import type { Person } from "@/lib/types";
import { Avatar } from "./Avatar";

export function PersonRow({ p, sub, right, onClick }: { p: Person; sub?: ReactNode; right?: ReactNode; onClick?: () => void }) {
  return (
    <div className="person-row press" onClick={onClick} role="button">
      <span style={{ position: "relative" }}>
        <Avatar url={p.avatar_url} name={p.first_name} size={44} />
        {isOnline(p.last_seen) && <span className="online-dot" />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div className="person-name">{fullName(p)}</div>
        <div className="person-sub">{sub ?? (p.username ? `@${p.username}` : p.bio ?? "")}</div>
      </span>
      {right}
    </div>
  );
}
