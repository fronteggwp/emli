import { useEffect, useState } from "react";
import { Copy, PackagePlus, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDay } from "@/state/day";
import { useLayer, useNav } from "@/nav/Nav";
import { qk, useSettings } from "@/data/api";
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
import { LogWaistSheet } from "./LogWaist";
import { CheatMealSheet } from "./CheatMeal";
import { loadDetector } from "@/lib/barcode";
import "./sheets.css";
import { Icon3D } from "@/ui/Icon3D";
import { PhotoFoodSheet } from "./PhotoFood";
import { PhotoBanner } from "@/ui/PhotoBanner";
import { MealPlanScreen } from "@/pages/MealPlan";

export function QuickActions() {
  const nav = useNav();
  // Подгружаем распознавание штрихкодов заранее — сканер откроется без задержки
  useEffect(() => {
    const t = setTimeout(() => loadDetector().catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, []);
  const layer = useLayer();
  const trackWaist = !!useSettings().data?.track_waist;
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
    { t: "Еда", s: "Поиск по базе", icon: "diary" as const, go: () => open(<AddFoodSheet />, true) },
    { t: "Штрихкод", s: "Скан упаковки", icon: "barcode" as const, go: () => open(<ScannerSheet />, true) },
    { t: "Вес", s: "Утреннее взвешивание", icon: "weight" as const, go: () => open(<LogWeightSheet />) },
    { t: "Мои приёмы", s: "Набор еды в 1 тап", icon: "meal-plan" as const, go: () => open(<AddFoodSheet tab="mine" />, true) },
  ];

  return (
    <>
      <SheetHeader title="Добавить" />
      <div className="sheet-body">
        <PhotoBanner onOpen={(mode) => open(<PhotoFoodSheet mode={mode} />, true)} />
        <div className="action-tiles" style={{ marginTop: 10 }}>
          {tiles.map((x) => (
            <Tap key={x.t} className="action-tile" onClick={x.go}>
              <span className="ico ico-3d">
                <Icon3D name={x.icon} size={40} />
              </span>
              <span>
                <div className="t">{x.t}</div>
                <div className="s">{x.s}</div>
              </span>
            </Tap>
          ))}
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          <button
            className="list-item press"
            onClick={() => {
              layer.close();
              nav.push(<MealPlanScreen />);
            }}
          >
            <span className="li-icon">
              <Icon3D name="meal-plan" size={26} />
            </span>
            <span style={{ flex: 1 }}>
              <div className="li-title">План питания на неделю</div>
              <div className="li-sub">Меню под твою норму, заготовки и общий список покупок</div>
            </span>
            <span className="mp-ai-pill">ИИ</span>
          </button>
          {trackWaist && (
            <button className="list-item press" onClick={() => open(<LogWaistSheet />)}>
              <span className="li-icon" style={{ fontSize: 20 }}>
                📏
              </span>
              <span style={{ flex: 1 }}>
                <div className="li-title">Замер талии</div>
                <div className="li-sub">Раз в неделю — видно, что уходит жир</div>
              </span>
            </button>
          )}
          <button className="list-item press" onClick={() => open(<QuickAddSheet />)}>
            <span className="li-icon">
              <Zap size={20} />
            </span>
            <span style={{ flex: 1 }}>
              <div className="li-title">Быстрая запись</div>
              <div className="li-sub">Только калории и БЖУ, без продукта</div>
            </span>
          </button>
          <button className="list-item press" onClick={() => open(<CheatMealSheet />, true)}>
            <span className="li-icon">
              <Icon3D name="cheat-day" size={26} />
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
