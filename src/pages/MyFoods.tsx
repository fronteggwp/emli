import { Plus } from "lucide-react";
import { useNav } from "@/nav/Nav";
import { useMyFoods } from "@/data/api";
import { fmtNum } from "@/lib/nutrition";
import { Screen } from "@/ui/Screen";
import { Tap } from "@/ui/Tap";
import { CreateFoodSheet } from "@/sheets/CreateFood";

export function MyFoodsScreen() {
  const nav = useNav();
  const foods = useMyFoods();
  return (
    <Screen
      title="Мои продукты"
      right={
        <Tap className="icon-btn" onClick={() => nav.sheet(<CreateFoodSheet />)} aria-label="Создать">
          <Plus size={20} />
        </Tap>
      }
    >
      {foods.data?.length ? (
        <div className="list">
          {foods.data.map((f) => (
            <button key={f.id} className="list-item" onClick={() => nav.sheet(<CreateFoodSheet food={f} />)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div className="li-title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {f.name}
                </div>
                <div className="li-sub">
                  {[f.brand, `Б ${fmtNum(f.protein, 1)} · Ж ${fmtNum(f.fat, 1)} · У ${fmtNum(f.carbs, 1)}`].filter(Boolean).join(" · ")}
                </div>
              </span>
              <span className="num" style={{ fontWeight: 700 }}>
                {fmtNum(f.kcal)}
                <div className="faint" style={{ fontSize: 11, fontWeight: 500 }}>
                  на 100 г
                </div>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="big">📦</div>
          Здесь будут продукты, которые ты создашь или отсканируешь
          <div style={{ marginTop: 16 }}>
            <Tap className="btn btn-accent" onClick={() => nav.sheet(<CreateFoodSheet />)}>
              Создать продукт
            </Tap>
          </div>
        </div>
      )}
    </Screen>
  );
}
