import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLayer } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { useProfile, useUpdateProfile } from "@/data/api";
import { sk, uploadImage } from "@/data/social";
import { haptic } from "@/lib/telegram";
import { SheetHeader } from "@/ui/Screen";
import { Avatar } from "@/ui/Avatar";
import { Switch } from "@/ui/Switch";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "@/pages/social.css";

export function EditProfileSheet() {
  const uid = useUid();
  const layer = useLayer();
  const toast = useToast();
  const qc = useQueryClient();
  const p = useProfile().data;
  const update = useUpdateProfile();
  const [first, setFirst] = useState(p?.first_name ?? "");
  const [last, setLast] = useState(p?.last_name ?? "");
  const [username, setUsername] = useState(p?.username ?? "");
  const [bio, setBio] = useState(p?.bio ?? "");
  const [priv, setPriv] = useState(p?.is_private ?? false);
  const [showWeight, setShowWeight] = useState(p?.show_weight ?? false);
  const [avatar, setAvatar] = useState(p?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const uname = username.trim().toLowerCase().replace(/^@/, "");
  const unameOk = uname === "" || /^[a-z0-9_]{3,32}$/.test(uname);

  const pickAvatar = async (f: File) => {
    setUploading(true);
    try {
      setAvatar(await uploadImage(uid, f));
      haptic.success();
    } catch {
      toast("Не удалось загрузить фото");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setError(null);
    try {
      await update.mutateAsync({
        first_name: first.trim().slice(0, 64),
        last_name: last.trim() || null,
        username: uname || null,
        bio: bio.trim() || null,
        is_private: priv,
        show_weight: showWeight,
        avatar_url: avatar,
      });
      qc.invalidateQueries({ queryKey: sk.person(uid) });
      haptic.success();
      toast("Профиль сохранён");
      layer.close();
    } catch (e) {
      haptic.error();
      const msg = e instanceof Error ? e.message : "";
      setError(msg.includes("username") || msg.includes("duplicate") ? "Этот ник уже занят" : "Не получилось сохранить");
    }
  };

  return (
    <>
      <SheetHeader title="Профиль" />
      <div className="sheet-body stack">
        <div style={{ display: "grid", placeItems: "center", padding: "4px 0 6px" }}>
          <button className="tap" style={{ position: "relative", borderRadius: "50%" }} onClick={() => file.current?.click()}>
            <Avatar url={avatar} name={first} size={92} />
            <span
              className="icon-btn"
              style={{ position: "absolute", right: -2, bottom: -2, width: 34, height: 34, background: "var(--kcal)", border: "3px solid var(--bg-2)" }}
            >
              <Camera size={16} />
            </span>
          </button>
          <div className="faint" style={{ fontSize: 13, marginTop: 8 }}>
            {uploading ? "Загружаю…" : "Сменить фото"}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickAvatar(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Имя</label>
            <input className="input" value={first} onChange={(e) => setFirst(e.target.value)} />
          </div>
          <div className="field">
            <label>Фамилия</label>
            <input className="input" value={last} onChange={(e) => setLast(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Ник</label>
          <input
            className="input"
            value={username}
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => setUsername(e.target.value)}
            placeholder="например, dima_fit"
            style={{ borderColor: unameOk ? undefined : "var(--danger)" }}
          />
          {!unameOk && <div style={{ color: "var(--danger)", fontSize: 12, paddingLeft: 4 }}>3–32 символа: латиница, цифры и _</div>}
        </div>
        <div className="field">
          <label>О себе</label>
          <input className="input" value={bio} maxLength={200} onChange={(e) => setBio(e.target.value)} placeholder="Цель, спорт, любимая еда…" />
        </div>
        <Switch on={priv} onChange={setPriv} label="Закрытый профиль" hint="Записи и статистику видят только друзья, писать могут только друзья" />
        <Switch on={showWeight} onChange={setShowWeight} label="Показывать изменение веса" hint="В профиле будет видно, сколько ты сбросил или набрал за месяц" />
        {error && <div style={{ color: "var(--danger)", textAlign: "center", fontSize: 14 }}>{error}</div>}
      </div>
      <div className="sheet-foot">
        <Tap className="btn btn-accent btn-block" disabled={!unameOk || uploading || update.isPending} onClick={submit}>
          Сохранить
        </Tap>
      </div>
    </>
  );
}
