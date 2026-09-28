-- Замеры талии — как вес: один замер в день, видны только владельцу
create table public.waists (
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day         date not null,
  waist_cm    numeric(4,1) not null check (waist_cm between 40 and 250),
  created_at  timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.waists enable row level security;
create policy "own waists read" on public.waists for select to authenticated using (user_id = (select auth.uid()));
create policy "own waists insert" on public.waists for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own waists update" on public.waists for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own waists delete" on public.waists for delete to authenticated using (user_id = (select auth.uid()));

-- Следить ли за талией: null — ещё не спрашивали (покажем вопрос), true/false — решение человека
alter table public.user_settings add column track_waist boolean;
