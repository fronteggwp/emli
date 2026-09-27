import { useState, type CSSProperties } from "react";

/** Картинка с плавным появлением после загрузки */
export function Photo({ src, alt = "", className = "", style, eager }: { src: string; alt?: string; className?: string; style?: CSSProperties; eager?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      className={`photo ${ok ? "in" : ""} ${className}`}
      style={style}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onLoad={() => setOk(true)}
    />
  );
}
