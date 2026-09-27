-- Вставка плана с возвратом строки: функция can_view_plan внутри той же операции ещё не видит новую строку,
-- поэтому владельца проверяем напрямую по колонке
drop policy "plans read" on public.meal_plans;
create policy "plans read" on public.meal_plans for select to authenticated using (owner_id = (select auth.uid()) or public.can_view_plan(id));
