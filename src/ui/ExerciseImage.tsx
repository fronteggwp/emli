import { memo, useState } from "react";
import { Dumbbell } from "lucide-react";
import { imgUrl, type Exercise } from "@/lib/exercise";

/**
 * Демонстрация упражнения: два кадра (начало и конец движения) плавно сменяют друг друга.
 * animate=false — статичная миниатюра для списков.
 */
export const ExerciseImage = memo(function ExerciseImage({
  ex,
  size,
  animate = true,
  radius = 16,
}: {
  ex: Pick<Exercise, "id" | "img" | "custom">;
  size?: number;
  animate?: boolean;
  radius?: number;
}) {
  const [loaded, setLoaded] = useState(0);
  const style = size ? { width: size, height: size, borderRadius: radius, aspectRatio: "auto" } : { borderRadius: radius };
  if (ex.custom || !ex.img) {
    return (
      <div className="ex-img ex-img-empty" style={style}>
        <Dumbbell size={size ? size * 0.42 : 40} />
      </div>
    );
  }
  const two = animate && ex.img > 1;
  return (
    <div className={`ex-img ${loaded ? "ready" : ""}`} style={style}>
      <img src={imgUrl(ex.id, 0)} alt="" loading="lazy" decoding="async" onLoad={() => setLoaded((n) => n + 1)} />
      {two && <img src={imgUrl(ex.id, 1)} alt="" loading="lazy" decoding="async" className="ex-img-b" onLoad={() => setLoaded((n) => n + 1)} />}
    </div>
  );
});
