import { haptic } from "@/lib/telegram";

export function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      className="switch-row press"
      onClick={() => {
        haptic.select();
        onChange(!on);
      }}
    >
      <span style={{ flex: 1, textAlign: "left" }}>
        <div style={{ fontWeight: 550 }}>{label}</div>
        {hint && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{hint}</div>}
      </span>
      <span className={`switch ${on ? "on" : ""}`}>
        <i />
      </span>
    </button>
  );
}
