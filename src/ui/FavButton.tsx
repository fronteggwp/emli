import { useState } from "react";
import { Heart } from "lucide-react";
import { useIsFavorite, useToggleFavorite, type Favorite } from "@/data/engage";
import { haptic } from "@/lib/telegram";
import { Tap } from "./Tap";
import { useToast } from "./Toast";

/** Сердечко «в избранное». ensure — сохранить объект и вернуть его id, если id ещё нет. */
export function FavButton({
  kind,
  refId,
  ensure,
  size = 19,
  className = "icon-btn",
}: {
  kind: Favorite["kind"];
  refId?: string | null;
  ensure?: () => Promise<string | null>;
  size?: number;
  className?: string;
}) {
  const [id, setId] = useState(refId ?? null);
  const on = useIsFavorite(kind, id ?? undefined);
  const toggle = useToggleFavorite();
  const toast = useToast();
  const [pop, setPop] = useState(0);

  const click = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let ref = id;
    if (!ref && ensure) {
      ref = await ensure().catch(() => null);
      setId(ref);
    }
    if (!ref) return;
    if (!on) {
      haptic.success();
      setPop((p) => p + 1);
      toast("В избранном ❤️");
    } else haptic.tap();
    toggle.mutate({ kind, ref, on: !on });
  };

  return (
    <Tap className={className} onClick={click} aria-label={on ? "Убрать из избранного" : "В избранное"} scale={0.85}>
      <Heart
        key={pop}
        size={size}
        className={pop ? "heart-pop" : undefined}
        fill={on ? "var(--danger)" : "none"}
        color={on ? "var(--danger)" : "currentColor"}
      />
    </Tap>
  );
}
