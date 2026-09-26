import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, CheckCheck, ChevronLeft, ImagePlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLayer, useNav } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  fullName,
  markRead,
  sk,
  uploadImage,
  useConversations,
  useMessages,
  usePerson,
  useSendMessage,
  uuid,
} from "@/data/social";
import { daySeparator, lastSeenText, timeHM } from "@/lib/dates";
import { haptic, inTelegram } from "@/lib/telegram";
import type { Message } from "@/lib/types";
import { Avatar } from "@/ui/Avatar";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { InfiniteSentinel } from "@/ui/InfiniteSentinel";
import { useToast } from "@/ui/Toast";
import { PersonScreen } from "./Person";
import "./social.css";

const sameDay = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10) && new Date(a).toDateString() === new Date(b).toDateString();

export function ChatScreen({ cid, otherId }: { cid: string; otherId: string }) {
  const nav = useNav();
  const layer = useLayer();
  const uid = useUid();
  const qc = useQueryClient();
  const toast = useToast();
  const other = usePerson(otherId);
  const msgs = useMessages(cid);
  const convs = useConversations();
  const send = useSendMessage(cid);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<number | undefined>(undefined);
  const file = useRef<HTMLInputElement>(null);

  const list = useMemo(() => msgs.data?.pages.flat() ?? [], [msgs.data]);
  const otherReadAt = convs.data?.find((c) => c.id === cid)?.other_read_at ?? null;
  const newestTheirs = list.find((m) => m.sender_id !== uid)?.id;

  // Прочитано: при открытии и при каждом новом входящем
  useEffect(() => {
    markRead(cid).then(() => qc.invalidateQueries({ queryKey: sk.convs }));
  }, [cid, newestTheirs, qc]);

  // «Печатает…» через broadcast-канал
  useEffect(() => {
    const ch = supabase
      .channel(`typing:${cid}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.uid === uid) return;
        setTyping(true);
        window.clearTimeout(typingTimer.current);
        typingTimer.current = window.setTimeout(() => setTyping(false), 3500);
      })
      .subscribe();
    typingChannel.current = ch;
    return () => {
      window.clearTimeout(typingTimer.current);
      supabase.removeChannel(ch);
    };
  }, [cid, uid]);

  // Пришло сообщение — «печатает» пропадает
  useEffect(() => setTyping(false), [newestTheirs]);

  const onType = (v: string) => {
    setText(v.slice(0, 4000));
    const now = Date.now();
    if (v && now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      typingChannel.current?.send({ type: "broadcast", event: "typing", payload: { uid } });
    }
  };

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    haptic.tap();
    send.mutate({ id: uuid(), text: t });
    setText("");
  };

  const sendPhoto = async (f: File) => {
    setUploading(true);
    try {
      const url = await uploadImage(uid, f);
      send.mutate({ id: uuid(), text: null, image_url: url });
      haptic.success();
    } catch {
      toast("Не удалось отправить фото");
    } finally {
      setUploading(false);
    }
  };

  const p = other.data;
  const status = typing ? "печатает…" : lastSeenText(p?.last_seen);

  return (
    <div className="chat">
      <div className="chat-head">
        {!inTelegram && (
          <button className="icon-btn" style={{ width: 38, height: 38 }} onClick={layer.close} aria-label="Назад">
            <ChevronLeft size={22} />
          </button>
        )}
        <button className="row press" style={{ flex: 1, minWidth: 0, gap: 10, borderRadius: 14, padding: "2px 4px" }} onClick={() => nav.push(<PersonScreen id={otherId} />)}>
          <Avatar url={p?.avatar_url} name={p?.first_name ?? ""} size={40} />
          <span style={{ minWidth: 0, textAlign: "left" }}>
            <div className="person-name">{fullName(p)}</div>
            <div className={`person-sub ${typing || status === "в сети" ? "typing" : ""}`}>{status}</div>
          </span>
        </button>
      </div>

      <div className="chat-list">
        {list.map((m, i) => {
          const older = list[i + 1] as Message | undefined;
          const newer = list[i - 1] as Message | undefined;
          const mine = m.sender_id === uid;
          const tail = !newer || newer.sender_id !== m.sender_id || new Date(newer.created_at).getTime() - new Date(m.created_at).getTime() > 300_000;
          const gap = !!older && older.sender_id !== m.sender_id;
          const pending = send.isPending && send.variables?.id === m.id;
          const read = mine && !!otherReadAt && otherReadAt >= m.created_at;
          return (
            <Fragment key={m.id}>
              <div className={`bubble-row ${mine ? "mine" : "theirs"} ${tail ? "tail" : ""} ${gap ? "gap" : ""}`}>
                <div className={`bubble ${pending ? "pending" : ""}`}>
                  {m.image_url && <img src={m.image_url} alt="" loading="lazy" />}
                  {m.text}
                  <span className="bubble-time">
                    {timeHM(m.created_at)}
                    {mine && (read ? <CheckCheck size={14} /> : <Check size={14} />)}
                  </span>
                </div>
              </div>
              {(!older || !sameDay(older.created_at, m.created_at)) && <div className="day-sep">{daySeparator(m.created_at)}</div>}
            </Fragment>
          );
        })}
        <InfiniteSentinel query={msgs} />
        {!msgs.isLoading && list.length === 0 && (
          <div className="empty" style={{ margin: "auto" }}>
            <div className="big">👋</div>
            Напиши первым — например, спроси, как успехи
          </div>
        )}
      </div>

      <div className="chat-input">
        <button className="icon-btn" style={{ width: 42, height: 42, background: "transparent" }} onClick={() => file.current?.click()} disabled={uploading} aria-label="Фото">
          <ImagePlus size={22} className={uploading ? "faint" : "muted"} />
        </button>
        <AutoTextarea
          value={text}
          maxRows={6}
          onChange={(e) => onType(e.target.value)}
          placeholder="Сообщение"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="send-btn" disabled={!text.trim()} onClick={submit} aria-label="Отправить">
          <ArrowUp size={20} strokeWidth={2.6} />
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) sendPhoto(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
