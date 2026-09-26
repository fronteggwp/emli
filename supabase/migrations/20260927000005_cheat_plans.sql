-- Читмил: в выбранный день можно съесть больше, а лишнее «копится» за счёт соседних дней.
-- Хранится только план; скорректированные нормы на каждый день считает приложение.
create table public.cheat_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day          date not null,
  extra_kcal   int not null check (extra_kcal between 100 and 3000),
  spread_days  int not null check (spread_days between 1 and 7),
  mode         text not null default 'before' check (mode in ('before', 'after')),
  title        text check (length(title) <= 60),
  created_at   timestamptz not null default now(),
  unique (user_id, day)
);
create index cheat_plans_user on public.cheat_plans (user_id, day);
alter table public.cheat_plans enable row level security;
create policy "own cheat plans" on public.cheat_plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
