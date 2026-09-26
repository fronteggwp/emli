import { useEffect, useState } from "react";
import { Copy, PackagePlus, ScanBarcode, Scale, Search, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDay } from "@/state/day";
import { useLayer, useNav } from "@/nav/Nav";
import { qk } from "@/data/api";
import { supabase } from "@/lib/supabase";
import { dayTitle, shiftKey } from "@/lib/dates";
import { haptic } from "@/lib/telegram";
import { SheetHeader } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { useToast } from "@/ui/Toast";
import { AddFoodSheet } from "./AddFood";
import { ScannerSheet } from "./Scanner";
import { QuickAddSheet } from "./QuickAdd";
import { CreateFoodSheet } from "./CreateFood";
import { LogWeightSheet } from "./LogWeight";
import { CheatMealSheet } from "./CheatMeal";
import { loadDetector } from "@/lib/barcode";
import "./sheets.css";

export function QuickActions() {
  const nav = useNav();
  // Подгружаем распознавание штрихкодов заранее — сканер откроется без задержки
  useEffect(() => {
    const t = setTimeout(() => loadDetector().catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, []);
  const layer = useLayer();
  const { day } = useDay();
  const toast = useToast();
  const qc = useQueryClient();
  const [copying, setCopying] = useState(false);

  const open = (node: React.ReactNode, full = false) => {
    haptic.tap();
    layer.close();
    nav.sheet(node, { full });
  };

  const copyYesterday = async () => {
    setCopying(true);
    const from = shiftKey(day, -1);
    const { data, error } = await supabase.from("food_entries").select("meal,food_id,name,brand,grams,kcal,protein,fat,carbs").eq("day", from);
    if (error || !data?.length) {
      setCopying(false);
      haptic.warning();
      toast(`${dayTitle(from)} ничего не записано`);
      return;
    }
    await supabase.from("food_entries").insert(data.map((e) => ({ ...e, day })));
    qc.invalidateQueries({ queryKey: qk.entries(day) });
    qc.invalidateQueries({ queryKey: qk.totals });
    haptic.success();
    toast(`Скопировано: ${data.length} ${data.length === 1 ? "запись" : "записей"}`);
    layer.close();
  };

  const tiles = [
    { t: "Еда", s: "Поиск по базе", Icon: Search, color: "var(--kcal)", bg: "rgba(124,140,255,.16)", go: () => open(<AddFoodSheet />, true) },
    { t: "Штрихкод", s: "Скан упаковки", Icon: ScanBarcode, color: "var(--protein)", bg: "rgba(255,122,92,.15)", go: () => open(<ScannerSheet />, true) },
    { t: "Вес", s: "Утреннее взвешивание", Icon: Scale, color: "var(--weight)", bg: "rgba(179,136,255,.16)", go: () => open(<LogWeightSheet />) },
    { t: "Быстро", s: "Калории и БЖУ", Icon: Zap, color: "var(--fat)", bg: "rgba(255,194,71,.15)", go: () => open(<QuickAddSheet />) },
  ];

  return (
    <>
      <SheetHeader title="Добавить" />
      <div className="sheet-body">
        <div className="action-tiles">
          {tiles.map((x) => (
            <Tap key={x.t} className="action-tile" onClick={x.go}>
              <span className="ico" style={{ background: x.bg, color: x.color }}>
                <x.Icon size={22} />
              </span>
              <span>
                <div className="t">{x.t}</div>
                <div className="s">{x.s}</div>
              </span>
            </Tap>
          ))}
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          <button className="list-item press" onClick={() => open(<CheatMealSheet />, true)}>
            <span className="li-icon" style={{ fontSize: 18 }}>
              🍕
            </span>
            <span style={{ flex: 1 }}>
              <div className="li-title">Запланировать читмил</div>
              <div className="li-sub">Съешь больше в нужный день — неделя останется в балансе</div>
            </span>
          </button>
          <button className="list-item press" onClick={() => open(<CreateFoodSheet />)}>
            <span className="li-icon">
              <PackagePlus size={20} />
            </span>
            <span className="li-title">Создать свой продукт</span>
          </button>
          <button className="list-item press" onClick={copyYesterday} disabled={copying}>
            <span className="li-icon">
              <Copy size={20} />
            </span>
            <span style={{ flex: 1 }}>
              <div className="li-title">{copying ? "Копирую…" : "Повторить вчерашнее меню"}</div>
              <div className="li-sub">Все записи за {dayTitle(shiftKey(day, -1)).toLowerCase()} → {dayTitle(day).toLowerCase()}</div>
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
