-- Вес готового блюда (после варки/запекания) — для точной граммовки порции своих рецептов
alter table public.user_recipes add column cooked_g numeric(7,1) check (cooked_g > 0 and cooked_g < 100000);
