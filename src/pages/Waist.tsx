import { useMemo, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { Plus } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useDeleteWaist, useSettings, useWaists } from "@/data/api";
import { fmt, shiftKey, todayKey } from "@/lib/dates";
import { fmtNum, measureChange, rfmBodyFat, waistToHeight } from "@/lib/nutrition";
import { haptic } from "@/lib/telegram";
import { Screen } from "@/ui/Screen";
import { LineChart, useMounted } from "@/ui/Charts";
import { Segmented } from "@/ui/Segmented";
import { NumberTicker } from "@/ui/NumberTicker";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { LogWaistSheet } from "@/sheets/LogWaist";
import "./stats.css";

type Range = 30 | 90 | 180 | 0;
const cm = (n: number) => fmtNum(n, n % 1 ? 1 : 0);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${cm(Math.abs(n))}`;

export const ZONE_TEXT = {
  low: { title: "ниже обычного", color: "var(--fat)" },
  ok: { title: "в норме", color: "var(--good)" },
  raised: { title: "повышенный риск", color: "var(--fat)" },
  high: { title: "высокий риск", color: "var(--danger)" },
} as const;

export function WaistScreen() {
  const nav = useNav();
  const waists = useWaists();
  const settings = useSettings();
  const mounted = useMounted(320);
  const [range, setRange] = useState<Range>(90);
  const list = waists.data ?? [];
  const last = list[list.length - 1];
  const s = settings.data;

  const points = useMemo(() => {
    const from = range ? shiftKey(todayKey(), -range + 1) : "0000";
    return list.filter((w) => w.day >= from).map((w) => ({ day: w.day, value: w.waist_cm, dot: w.waist_cm }));
  }, [list, range]);

  // Изменения — по замерам из истории (как у веса)
  const period = measureChange(list, (w) => w.waist_cm, range || null);
  const total = measureChange(list, (w) => w.waist_cm, null);
  const whtr = last ? waistToHeight(last.waist_cm, s?.height_cm) : null;
  const fat = last ? rfmBodyFat(last.waist_cm, s?.height_cm, s?.sex) : null;

  return (
    <Screen
      title="Талия"
      right={
        <Tap className="icon-btn" onClick={() => nav.sheet(<LogWaistSheet />)} aria-label="Записать замер">
          <Plus size={20} />
        </Tap>
      }
    >
      <div className="card" style={{ background: "radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, var(--waist) 18%, transparent), transparent 60%), var(--card)" }}>
        <div className="muted" style={{ fontSize: 13 }}>
          {last ? `Талия · ${fmt(last.day, "d MMMM")}` : "Талия"}
        </div>
        <div className="row" style={{ alignItems: "baseline", gap: 6, marginTop: 4 }}>
          <span className="big-stat num">{last ? <NumberTicker value={last.waist_cm} digits={last.waist_cm % 1 ? 1 : 0} /> : "—"}</span>
          <span className="muted" style={{ fontSize: 18 }}>
            см
          </span>
        </div>
        <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>
          {!last
            ? "Сделай первый замер — дальше будет видно, как уходят сантиметры"
            : total
              ? `${signed(total.change)} см с ${fmt(total.from.day, "d MMMM")}`
              : "Первый замер. Повтори через неделю — появится динамика"}
        </div>
        <div style={{ marginTop: 22 }}>
          {mounted && points.length > 1 ? (
            <LineChart
              key={range}
              points={points}
              height={190}
              color="var(--waist)"
              unit="см"
              renderTip={(p) => (
                <>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {fmt(p.day, "d MMMM")}
                  </div>
                  <div className="num" style={{ fontWeight: 700, fontSize: 16 }}>
                    {cm(p.value)} см
                  </div>
                </>
              )}
            />
          ) : (
            <div className="empty" style={{ height: 190, display: "grid", placeItems: "center" }}>
              {list.length <= 1 ? "Два замера — и появится график" : "Нет замеров за этот период"}
            </div>
          )}
        </div>
        <div style={{ marginTop: 16 }}>
          <Segmented
            size="sm"
            value={range}
            onChange={setRange}
            options={[
              { value: 30, label: "Месяц" },
              { value: 90, label: "3 мес" },
              { value: 180, label: "Полгода" },
              { value: 0, label: "Всё" },
            ]}
          />
        </div>
      </div>

      <div className="kv" style={{ marginTop: 12 }}>
        <div>
          <div className="k">{range ? "За период" : "За всё время"}</div>
          <div className="v num" style={{ color: period && period.change < 0 ? "var(--good)" : undefined }}>
            {period ? signed(period.change) : "—"}
          </div>
        </div>
        <div>
          <div className="k">В месяц</div>
          <div className="v num">{period && period.days >= 7 ? signed(Math.round((period.change / Math.max(period.days / 30, 1)) * 10) / 10) : "—"}</div>
        </div>
        <div>
          <div className="k">Замеров</div>
          <div className="v num">{list.length}</div>
        </div>
      </div>

      {whtr && <WhtrCard ratio={whtr.ratio} zone={whtr.zone} fat={fat} />}
      {last && !s?.height_cm && <p className="explain" style={{ margin: "14px 4px 0" }}>Укажи рост в «Параметрах тела» — покажу отношение талии к росту и оценку процента жира.</p>}

      <p className="explain" style={{ margin: "16px 4px 0" }}>
        <b>Зачем мерить талию.</b> Когда вес стоит, а талия уходит — жир уходит, а мышцы остаются. Это лучший признак, что всё идёт правильно. Хватит замера раз в неделю.
      </p>

      <div className="section-title">История</div>
      <div className="list">
        <AnimatePresence initial={false}>
          {[...list].reverse().map((w, i, arr) => (
            <WaistRow key={w.day} day={w.day} value={w.waist_cm} prev={arr[i + 1]?.waist_cm ?? null} />
          ))}
        </AnimatePresence>
        {!list.length && <div className="empty">Пока нет замеров</div>}
      </div>
    </Screen>
  );
}

/** Отношение талии к росту: шкала с отметкой и понятная подпись */
export function WhtrCard({ ratio, zone, fat }: { ratio: number; zone: keyof typeof ZONE_TEXT; fat: number | null }) {
  const pos = Math.min(Math.max((ratio - 0.35) / (0.7 - 0.35), 0), 1) * 100;
  const z = ZONE_TEXT[zone];
  return (
    <div className="card whtr" style={{ marginTop: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="card-title">Талия / рост</div>
        <span className="num" style={{ fontWeight: 800, fontSize: 20 }}>
          {ratio.toFixed(2).replace(".", ",")}
        </span>
      </div>
      <div className="whtr-bar">
        <motion.i className="whtr-dot" initial={{ left: "0%" }} animate={{ left: `${pos}%` }} transition={{ type: "spring", stiffness: 120, damping: 18 }} />
      </div>
      <div className="whtr-scale">
        <span>0,4</span>
        <span>0,5</span>
        <span>0,6</span>
      </div>
      <div style={{ fontSize: 14, marginTop: 8 }}>
        <b style={{ color: z.color }}>{z.title[0].toUpperCase() + z.title.slice(1)}</b>
        <span className="muted"> · здоровая граница — талия меньше половины роста</span>
      </div>
      {fat != null && (
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Оценка жира по талии и росту: ≈ {fat}% (формула RFM, точность ±4%)
        </div>
      )}
    </div>
  );
}

function WaistRow({ day, value, prev }: { day: string; value: number; prev: number | null }) {
  const nav = useNav();
  const del = useDeleteWaist();
  const toast = useToast();
  const diff = prev != null ? Math.round((value - prev) * 10) / 10 : null;
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -110 || info.velocity.x < -700) {
      haptic.rigid();
      del.mutate(day);
      toast("Замер удалён");
    }
  };
  return (
    <motion.div layout exit={{ opacity: 0, height: 0 }} className="entry-wrap">
      <div className="entry-delete">Удалить</div>
      <motion.button
        className="list-item"
        style={{ background: "var(--card)" }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0.05 }}
        onDragEnd={onDragEnd}
        onClick={() => nav.sheet(<LogWaistSheet day={day} />)}
      >
        <span style={{ flex: 1 }}>
          <div className="li-title">{fmt(day, "d MMMM, EEEEEE")}</div>
          {diff != null && Math.abs(diff) >= 0.1 && (
            <div className="li-sub" style={{ color: diff < 0 ? "var(--good)" : "var(--protein)" }}>
              {signed(diff)} см
            </div>
          )}
        </span>
        <span className="num" style={{ fontWeight: 700 }}>
          {cm(value)} см
        </span>
      </motion.button>
    </motion.div>
  );
}
