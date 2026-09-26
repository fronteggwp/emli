import { useState } from "react";
import { ArrowUp, Trash } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { fullName, useAddComment, useComments, useDeleteComment, usePost } from "@/data/social";
import { ago } from "@/lib/dates";
import { confirmDialog, haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { PostCard } from "@/ui/PostCard";
import { Avatar } from "@/ui/Avatar";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { PersonScreen } from "./Person";
import "./social.css";

export function PostScreen({ id }: { id: string }) {
  const nav = useNav();
  const uid = useUid();
  const post = usePost(id);
  const comments = useComments(id);
  const add = useAddComment(id);
  const del = useDeleteComment(id);
  const [text, setText] = useState("");

  const send = () => {
    const t = text.trim();
    if (!t) return;
    haptic.tap();
    add.mutate(t);
    setText("");
  };

  if (post.data === null) {
    return (
      <Screen title="Запись">
        <div className="empty">Запись удалена или скрыта</div>
      </Screen>
    );
  }

  return (
    <Screen title="Запись">
      {post.data ? <PostCard post={post.data} detail /> : <div className="skeleton" style={{ height: 200, borderRadius: 24 }} />}

      <div className="section-title" style={{ marginTop: 22 }}>
        Комментарии
      </div>
      <div className="stack" style={{ gap: 14, paddingBottom: 12 }}>
        {comments.data?.map((c) => (
          <div key={c.id} className="row" style={{ alignItems: "flex-start", gap: 10, opacity: c.id.startsWith("temp-") ? 0.6 : 1, animation: "rise .35s cubic-bezier(.32,.72,0,1) both" }}>
            <button onClick={() => c.author_id !== uid && nav.push(<PersonScreen id={c.author_id} />)}>
              <Avatar url={c.author?.avatar_url} name={c.author?.first_name ?? ""} size={34} />
            </button>
            <div style={{ flex: 1, minWidth: 0, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "6px 18px 18px 18px", padding: "8px 12px" }}>
              <div className="row" style={{ gap: 6 }}>
                <span style={{ fontWeight: 650, fontSize: 14 }}>{fullName(c.author)}</span>
                <span className="faint" style={{ fontSize: 12 }}>
                  {ago(c.created_at)}
                </span>
                <span className="spacer" />
                {(c.author_id === uid || post.data?.author_id === uid) && !c.id.startsWith("temp-") && (
                  <button
                    className="faint"
                    onClick={async () => {
                      if (await confirmDialog("Удалить комментарий?")) del.mutate(c.id);
                    }}
                    aria-label="Удалить"
                  >
                    <Trash size={14} />
                  </button>
                )}
              </div>
              <div style={{ fontSize: 15, marginTop: 2, whiteSpace: "pre-wrap", wordBreak: "break-word", userSelect: "text" }}>{c.text}</div>
            </div>
          </div>
        ))}
        {comments.data?.length === 0 && <div className="faint" style={{ textAlign: "center", padding: 16 }}>Будь первым, кто прокомментирует</div>}
      </div>

      <div className="comment-bar">
        <AutoTextarea value={text} maxRows={5} onChange={(e) => setText(e.target.value.slice(0, 1000))} placeholder="Комментарий…" />
        <button className="send-btn" disabled={!text.trim()} onClick={send} aria-label="Отправить">
          <ArrowUp size={20} strokeWidth={2.6} />
        </button>
      </div>
    </Screen>
  );
}
