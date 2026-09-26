import { motion } from "motion/react";
import { MessageCircle, Newspaper, Trophy, UserPlus } from "lucide-react";

const FEATURES = [
  { Icon: UserPlus, color: "var(--kcal)", title: "Друзья", text: "Добавляй друзей по ссылке или нику" },
  { Icon: Newspaper, color: "var(--protein)", title: "Лента", text: "Делись прогрессом, едой и победами" },
  { Icon: MessageCircle, color: "var(--carbs)", title: "Чаты", text: "Переписка с друзьями прямо в приложении" },
  { Icon: Trophy, color: "var(--fat)", title: "Челленджи", text: "Соревнуйтесь в сериях и целях" },
];

export function CommunityPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">Люди</div>
      </div>
      <div className="card" style={{ textAlign: "center", padding: "28px 20px", background: "radial-gradient(100% 80% at 50% 0%, rgba(124,140,255,.18), transparent 70%), var(--card)" }}>
        <motion.div
          style={{ fontSize: 52 }}
          animate={{ rotate: [0, -8, 8, -4, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.5 }}
        >
          👋
        </motion.div>
        <div style={{ fontSize: 22, fontWeight: 750, marginTop: 10, letterSpacing: "-0.02em" }}>Скоро здесь будут люди</div>
        <p className="muted" style={{ margin: "8px auto 0", maxWidth: 280, fontSize: 15 }}>
          Мы уже строим социальную часть Emli. Вот что появится:
        </p>
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            className="card row"
            style={{ padding: 16 }}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i, type: "spring", stiffness: 300, damping: 26 }}
          >
            <span className="icon-btn" style={{ background: "var(--card-2)", color: f.color }}>
              <f.Icon size={21} />
            </span>
            <span>
              <div style={{ fontWeight: 650 }}>{f.title}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {f.text}
              </div>
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
