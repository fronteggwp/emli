import { memo, useState } from "react";
import { Flame, Heart, MessageCircle, MoreHorizontal, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { fullName, useToggleLike } from "@/data/social";
import { ago, fmt } from "@/lib/dates";
import { fmtKg, fmtNum } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { Post, PostAttachment } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Rings } from "./Rings";
import { PersonScreen } from "@/pages/Person";
import { PostScreen } from "@/pages/PostScreen";
import { PostMenuSheet } from "@/sheets/PostMenu";
import "@/pages/social.css";

export const PostCard = memo(function PostCard({ post, detail = false }: { post: Post; detail?: boolean }) {
  const nav = useNav();
  const uid = useUid();
  const like = useToggleLike();
  const [loaded, setLoaded] = useState(false);
  const openPost = () => !detail && nav.push(<PostScreen id={post.id} />);
  const openAuthor = () => post.author_id !== uid && nav.push(<PersonScreen id={post.author_id} />);

  return (
    <article className="post">
      <div className="post-head">
        <button onClick={openAuthor} className="tap" style={{ borderRadius: "50%" }}>
          <Avatar url={post.author.avatar_url} name={post.author.first_name} size={42} />
        </button>
        <button style={{ flex: 1, minWidth: 0, textAlign: "left" }} onClick={openAuthor}>
          <div className="post-name">{fullName(post.author)}</div>
          <div className="post-meta">
            {post.author.username && <span>@{post.author.username} ·</span>}
            <span>{ago(post.created_at)}</span>
            {post.visibility === "friends" && <Users size={12} />}
          </div>
        </button>
        <button
          className="icon-btn tap"
          style={{ width: 34, height: 34, background: "transparent" }}
          onClick={() => nav.sheet(<PostMenuSheet post={post} />)}
          aria-label="Ещё"
        >
          <MoreHorizontal size={20} className="muted" />
        </button>
      </div>

      <div onClick={openPost}>
        {post.text && <div className={`post-text ${detail ? "" : "clamp"}`}>{post.text}</div>}
        {post.attachment && <AttachmentCard a={post.attachment} />}
        {post.image_url && (
          <div className="post-image">
            <img src={post.image_url} alt="" loading="lazy" decoding="async" className={loaded ? "loaded" : ""} onLoad={() => setLoaded(true)} />
          </div>
        )}
      </div>

      <div className="post-foot">
        <button
          className={`post-action tap ${post.liked ? "liked" : ""}`}
          style={{ ["--tap-scale" as string]: 0.9 }}
          onClick={() => {
            haptic[post.liked ? "tap" : "medium"]();
            like.mutate(post);
          }}
        >
          <Heart size={20} fill={post.liked ? "currentColor" : "none"} />
          {post.like_count > 0 && <span className="num">{post.like_count}</span>}
        </button>
        <button className="post-action tap" onClick={openPost}>
          <MessageCircle size={20} />
          {post.comment_count > 0 && <span className="num">{post.comment_count}</span>}
        </button>
      </div>
    </article>
  );
});

export function AttachmentCard({ a }: { a: PostAttachment }) {
  if (a.type === "day") {
    return (
      <div className="attach">
        <Rings
          size={62}
          stroke={7}
          gap={2}
          rings={[
            { value: a.kcal, max: a.target || a.kcal, color: "var(--kcal)", color2: "var(--kcal-2)" },
            { value: 1, max: 1, color: "var(--protein)" },
          ]}
        />
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            Итоги дня · {fmt(a.day, "d MMMM")}
          </div>
          <div className="attach-big num">
            {fmtNum(a.kcal)} <span style={{ fontSize: 14, color: "var(--text-2)" }}>/ {fmtNum(a.target)} ккал</span>
          </div>
          <div className="num" style={{ fontSize: 13, marginTop: 2 }}>
            <span style={{ color: "var(--protein)" }}>Б {fmtNum(a.protein)}</span> ·{" "}
            <span style={{ color: "var(--fat)" }}>Ж {fmtNum(a.fat)}</span> ·{" "}
            <span style={{ color: "var(--carbs)" }}>У {fmtNum(a.carbs)}</span>
          </div>
        </div>
      </div>
    );
  }
  if (a.type === "weight") {
    const down = a.change <= 0;
    return (
      <div className="attach" style={{ background: "radial-gradient(120% 120% at 0% 0%, rgba(179,136,255,.2), transparent 60%), var(--card-2)" }}>
        <span className="icon-btn" style={{ background: "rgba(179,136,255,.18)", color: "var(--weight)", width: 52, height: 52 }}>
          {down ? <TrendingDown size={26} /> : <TrendingUp size={26} />}
        </span>
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            Прогресс веса · {a.days} дн.
          </div>
          <div className="attach-big num" style={{ color: down ? "var(--good)" : "var(--protein)" }}>
            {down ? "−" : "+"}
            {fmtKg(Math.abs(a.change))} кг
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="attach" style={{ background: "radial-gradient(120% 120% at 0% 0%, rgba(255,122,92,.2), transparent 60%), var(--card-2)" }}>
      <span className="icon-btn" style={{ background: "rgba(255,122,92,.18)", color: "var(--protein)", width: 52, height: 52 }}>
        <Flame size={26} />
      </span>
      <div>
        <div className="muted" style={{ fontSize: 13 }}>
          Серия записей
        </div>
        <div className="attach-big num">{a.days} дней подряд</div>
      </div>
    </div>
  );
}
