import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Send, Share, SquarePlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { completeDeviceLogin } from "@/lib/auth";
import { Logo } from "@/ui/Logo";
import "./welcome.css";
import { visual } from "@/ui/Icon3D";

type Req = { id: string; secret: string; check: string; link: string; tgLink: string; at: number };

export const isStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia?.("(display-mode: standalone)").matches;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/** Экран вне Telegram: установка на главный экран и вход через бота */
export function Welcome() {
  const standalone = isStandalone();
  const [mode, setMode] = useState<"install" | "login">(standalone || !isIOS() ? "login" : "install");
  return (
    <div className="welcome" style={{ ["--welcome-bg" as string]: `url(${visual("backgrounds", "welcome")})` }}>
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
        <Logo size={84} animated />
      </motion.div>
      <div className="welcome-title">Emli</div>
      <div className="welcome-sub">Питание, вес и тренировки — в одном приложении</div>
      {mode === "install" ? <Install onSkip={() => setMode("login")} /> : <Login />}
    </div>
  );
}

function Install({ onSkip }: { onSkip: () => void }) {
  return (
    <motion.div className="welcome-card" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
      <div className="welcome-h">Установи на главный экран</div>
      <div className="welcome-step">
        <span className="welcome-n">1</span>
        <span>
          Нажми <b>«Поделиться»</b> <Share size={16} className="welcome-ico" /> внизу Safari
        </span>
      </div>
      <div className="welcome-step">
        <span className="welcome-n">2</span>
        <span>
          Выбери <b>«На экран „Домой"»</b> <SquarePlus size={16} className="welcome-ico" />
        </span>
      </div>
      <div className="welcome-step">
        <span className="welcome-n">3</span>
        <span>Открой Emli с главного экрана и войди через Telegram</span>
      </div>
      <div className="welcome-note">
        Приложение откроется на весь экран, без Telegram и адресной строки. Если страница открылась внутри Telegram — сначала нажми
        «Открыть в Safari» (значок компаса).
      </div>
      <button className="welcome-link" onClick={onSkip}>
        Войти здесь, в браузере
      </button>
    </motion.div>
  );
}

function Login() {
  const [req, setReq] = useState<Req | null>(null);
  const [state, setState] = useState<"idle" | "waiting" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const polling = useRef(false);

  const start = useCallback(async () => {
    setErr("");
    const { data, error } = await supabase.functions.invoke("tg-auth", { body: { action: "login_start" } });
    if (error || !data?.id) {
      setErr("Нет связи с сервером. Проверь интернет и попробуй ещё раз.");
      setState("error");
      return null;
    }
    const r = { ...(data as Omit<Req, "at">), at: Date.now() };
    setReq(r);
    return r;
  }, []);

  // Запрос готовим заранее — тогда переход в Telegram происходит прямо по нажатию
  useEffect(() => {
    start();
  }, [start]);

  const poll = useCallback(async () => {
    if (!req || polling.current) return;
    polling.current = true;
    try {
      const { data } = await supabase.functions.invoke("tg-auth", {
        body: { action: "login_poll", id: req.id, secret: req.secret, label: navigator.userAgent.slice(0, 80) },
      });
      if (data?.status === "ok") {
        setState("done");
        completeDeviceLogin(data);
        setTimeout(() => location.reload(), 500);
      } else if (data?.status === "expired") {
        setState("idle");
        setErr("Время на вход вышло — нажми кнопку ещё раз.");
        start();
      }
    } finally {
      polling.current = false;
    }
  }, [req, start]);

  useEffect(() => {
    if (state !== "waiting") return;
    const t = setInterval(poll, 2000);
    const onVis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [state, poll]);

  const open = async () => {
    let r = req;
    if (!r || Date.now() - r.at > 12 * 60_000) r = await start();
    if (!r) return;
    setState("waiting");
    location.href = r.tgLink;
  };

  return (
    <motion.div className="welcome-card" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
      {state === "done" ? (
        <div className="welcome-h" style={{ textAlign: "center" }}>
          ✅ Готово, заходим…
        </div>
      ) : state === "waiting" ? (
        <>
          <div className="welcome-h">Подтверди вход в Telegram</div>
          <div className="welcome-text">
            Бот Emli прислал сообщение — нажми в нём <b>«Подтвердить вход»</b> и вернись сюда.
          </div>
          {req && (
            <div className="welcome-code">
              <span>Код в сообщении</span>
              <b>{req.check}</b>
            </div>
          )}
          <div className="welcome-wait">
            <i />
            Жду подтверждения…
          </div>
          <a className="welcome-link" href={req?.link} target="_blank" rel="noreferrer">
            Telegram не открылся? Открыть бота
          </a>
        </>
      ) : (
        <>
          <div className="welcome-h">Вход</div>
          <div className="welcome-text">Аккаунт тот же, что в Telegram: дневник, тренировки и друзья — всё на месте.</div>
          <button className="welcome-tg" onClick={open} disabled={!req && state !== "error"}>
            <Send size={19} /> Войти через Telegram
          </button>
          {err && <div className="welcome-err">{err}</div>}
        </>
      )}
    </motion.div>
  );
}
