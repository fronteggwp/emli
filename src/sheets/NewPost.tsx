import { useMemo, useRef, useState } from "react";
import { Flame, ImagePlus, Scale, Sun, X } from "lucide-react";
import { useLayer } from "@/nav/Nav";
import { useUid } from "@/lib/auth";
import { useCreatePost, uploadImage } from "@/data/social";
import { useEntries } from "@/data/api";
import { useInsights } from "@/data/insights";
import { todayKey } from "@/lib/dates";
import { sumMacros } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import type { PostAttachment } from "@/lib/types";
import { SheetHeader } from "@/ui/Screen";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { AttachmentCard } from "@/ui/PostCard";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import "@/pages/social.css";

type Kind = "day" | "weight" | "streak" | null;

export function NewPostSheet({ preset }: { preset?: Kind }) {
  const uid = useUid();
  const layer = useLayer();
  const toast = useToast();
  const create = useCreatePost();
  const ins = useInsights();
  const today = useEntries(todayKey());
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Kind>(preset ?? null);
  const [visibility, setVisibility] = useState<"public" | "friends">("public");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  const weightDays = Math.min(30, ins.trend.length);
  const options = useMemo(() => {
    const out: { kind: Exclude<Kind, null>; label: string; Icon: typeof Sun; a: PostAttachment }[] = [];
    const s = sumMacros(today.data ?? []);
    if (s.kcal > 0)
      out.push({
        kind: "day",
        label: "Итоги дня",
        Icon: Sun,
        a: { type: "day", day: todayKey(), kcal: Math.round(s.kcal), protein: Math.round(s.protein), fat: Math.round(s.fat), carbs: Math.round(s.carbs), target: ins.target?.calories ?? 0 },
      });
    if (weightDays >= 7) {
      const from = ins.trend[ins.trend.length - weightDays].trend;
      out.push({
        kind: "weight",
        label: "Прогресс веса",
        Icon: Scale,
        a: { type: "weight", change: Math.round(((ins.current ?? from) - from) * 10) / 10, days: weightDays },
      });
    }
    if (ins.streak >= 2) out.push({ kind: "streak", label: "Серия", Icon: Flame, a: { type: "streak", days: ins.streak } });
    return out;
  }, [today.data, ins, weightDays]);

  const attachment = options.find((o) => o.kind === kind)?.a ?? null;
  const canPost = !busy && (text.trim().length > 0 || !!file || !!attachment);

  const submit = async () => {
    if (!canPost) return;
    setBusy(true);
    try {
      const image_url = file ? await uploadImage(uid, file) : null;
      await create.mutateAsync({ text: text.trim() || null, image_url, attachment, visibility });
      haptic.success();
      toast("Опубликовано");
      layer.close();
    } catch (e) {
      haptic.error();
      toast(e instanceof Error ? e.message : "Не получилось опубликовать");
      setBusy(false);
    }
  };

  return (
    <>
      <SheetHeader
        title="Новая запись"
        right={
          <Tap className="btn btn-sm btn-accent" disabled={!canPost} onClick={submit} style={{ height: 36, padding: "0 14px" }}>
            {busy ? "…" : "Готово"}
          </Tap>
        }
      />
      <div className="sheet-body">
        <AutoTextarea
          value={text}
          maxRows={10}
          autoFocus
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          placeholder="Как прошёл день? Поделись успехом, рецептом или мыслью…"
          style={{ width: "100%", border: 0, outline: "none", background: "none", resize: "none", fontSize: 17, lineHeight: "24px", minHeight: 96 }}
        />
        {attachment && <AttachmentCard a={attachment} />}
        {preview && (
          <div className="post-image" style={{ position: "relative" }}>
            <img src={preview} alt="" className="loaded" />
            <button
              className="icon-btn"
              style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, background: "rgba(0,0,0,.6)" }}
              onClick={() => setFile(null)}
              aria-label="Убрать фото"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="chips-row" style={{ padding: "16px 0 0" }}>
          <Tap className="chip" onClick={() => input.current?.click()}>
            <ImagePlus size={16} /> Фото
          </Tap>
          {options.map((o) => (
            <Tap
              key={o.kind}
              className={`chip ${kind === o.kind ? "on" : ""}`}
              onClick={() => {
                haptic.select();
                setKind(kind === o.kind ? null : o.kind);
              }}
            >
              <o.Icon size={16} /> {o.label}
            </Tap>
          ))}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = "";
          }}
        />

        <div className="group-label">Кто увидит</div>
        <div className="chips-row" style={{ padding: "4px 0 0" }}>
          <Tap className={`chip ${visibility === "public" ? "on" : ""}`} onClick={() => setVisibility("public")}>
            🌍 Все
          </Tap>
          <Tap className={`chip ${visibility === "friends" ? "on" : ""}`} onClick={() => setVisibility("friends")}>
            👥 Только друзья
          </Tap>
        </div>
      </div>
    </>
  );
}
