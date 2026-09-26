import { useState } from "react";

const COLORS = ["#7c8cff", "#b388ff", "#ff7a5c", "#ffc247", "#4fd18b", "#5cc8ff"];

export function Avatar({ url, name, size = 44, ring = false }: { url?: string | null; name: string; size?: number; ring?: boolean }) {
  const [broken, setBroken] = useState(false);
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  const color = COLORS[(name.charCodeAt(0) || 0) % COLORS.length];
  const inner = size - (ring ? 8 : 0);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        padding: ring ? 4 : 0,
        background: ring ? "conic-gradient(from 200deg, var(--kcal), var(--kcal-2), var(--protein), var(--fat), var(--carbs), var(--kcal))" : undefined,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: "50%",
          overflow: "hidden",
          background: color,
          display: "grid",
          placeItems: "center",
          fontWeight: 800,
          fontSize: inner * 0.42,
          color: "#fff",
          border: ring ? "3px solid var(--bg)" : undefined,
        }}
      >
        {url && !broken ? (
          <img src={url} alt="" width={inner} height={inner} style={{ objectFit: "cover", width: "100%", height: "100%" }} onError={() => setBroken(true)} />
        ) : (
          letter
        )}
      </div>
    </div>
  );
}
