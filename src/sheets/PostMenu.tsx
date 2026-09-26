import { Ban, Flag, Trash, UserRound } from "lucide-react";
import { useLayer, useNav } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { report, useDeletePost, useFriendActions } from "@/data/social";
import { confirmDialog, haptic } from "@/lib/telegram";
import type { Post } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { useToast } from "@/ui/Toast";
import { PersonScreen } from "@/pages/Person";

export function PostMenuSheet({ post }: { post: Post }) {
  const uid = useUid();
  const nav = useNav();
  const layer = useLayer();
  const toast = useToast();
  const del = useDeletePost();
  const { block } = useFriendActions();
  const mine = post.author_id === uid;

  const items = mine
    ? [
        {
          Icon: Trash,
          title: "Удалить запись",
          danger: true,
          go: async () => {
            if (!(await confirmDialog("Удалить запись?"))) return;
            haptic.rigid();
            del.mutate(post.id);
            toast("Запись удалена");
            layer.close();
          },
        },
      ]
    : [
        {
          Icon: UserRound,
          title: "Открыть профиль",
          go: () => {
            layer.close();
            nav.push(<PersonScreen id={post.author_id} />);
          },
        },
        {
          Icon: Flag,
          title: "Пожаловаться",
          go: async () => {
            await report({ post_id: post.id }, "post");
            haptic.success();
            toast("Спасибо, мы проверим запись");
            layer.close();
          },
        },
        {
          Icon: Ban,
          title: "Заблокировать автора",
          danger: true,
          go: async () => {
            if (!(await confirmDialog("Заблокировать? Вы перестанете видеть друг друга."))) return;
            await block.mutateAsync(post.author_id);
            haptic.warning();
            toast("Пользователь заблокирован");
            layer.close();
          },
        },
      ];

  return (
    <>
      <SheetHeader title="Запись" />
      <div className="sheet-body">
        <div className="list">
          {items.map((i) => (
            <button key={i.title} className="list-item press" onClick={i.go} style={{ color: "danger" in i && i.danger ? "var(--danger)" : undefined }}>
              <span className="li-icon" style={{ color: "inherit" }}>
                <i.Icon size={20} />
              </span>
              <span className="li-title">{i.title}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
