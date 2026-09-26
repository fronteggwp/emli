import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { useDay } from "@/state/day";
import { useLayer } from "@/nav/Nav";
import { useTotals } from "@/data/api";
import { fromKey, shiftKey, toKey, todayKey, weekStart, WEEKDAYS_SHORT } from "@/lib/dates";
import { haptic } from "@/lib/telegram";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import "./sheets.css";

export function CalendarSheet() {
  const { day, setDay } = useDay();
  const layer = useLayer();
  const totals = useTotals();
  const [month, setMonth] = useState(toKey(startOfMonth(fromKey(day))));
  const [dir, setDir] = useState(0);
  const logged = new Set((totals.data ?? []).filter((t) => t.entries > 0).map((t) => t.day));
  const today = todayKey();

  const first = weekStart(month);
  const last = toKey(endOfMonth(fromKey(month)));
  const cells: string[] = [];
  for (let d = first; d <= last || cells.length % 7; d = shiftKey(d, 1)) cells.push(d);

  const go = (n: number) => {
    haptic.select();
    setDir(n);
    setMonth(toKey(addMonths(fromKey(month), n)));
  };

  const title = format(fromKey(month), "LLLL yyyy", { locale: ru });

  return (
    <>
      <SheetHeader title={title.charAt(0).toUpperCase() + title.slice(1)} left={
        <Tap className="icon-btn" onClick={() => go(-1)}><ChevronLeft size={20} /></Tap>
      } right={
        <Tap className="icon-btn" onClick={() => go(1)}><ChevronRight size={20} /></Tap>
      } />
      <div className="sheet-body" style={{ overflow: "hidden" }}>
        <div className="cal-grid">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="cal-wd">
              {w}
            </div>
          ))}
        </div>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={month}
            className="cal-grid"
            custom={dir}
            initial={{ x: dir > 0 ? 80 : -80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir > 0 ? -80 : 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
          >
            {cells.map((d) => {
              const inMonth = d.slice(0, 7) === month.slice(0, 7);
              return (
                <button
                  key={d}
                  className={`cal-day ${inMonth ? "" : "muted"} ${d === today ? "today" : ""} ${d === day ? "on" : ""}`}
                  onClick={() => {
                    haptic.select();
                    setDay(d);
                    layer.close();
                  }}
                >
                  {fromKey(d).getDate()}
                  {logged.has(d) && d !== day && <i />}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
        <Tap
          className="btn btn-block"
          style={{ marginTop: 16 }}
          onClick={() => {
            setDay(today);
            layer.close();
          }}
        >
          Сегодня
        </Tap>
      </div>
    </>
  );
}
