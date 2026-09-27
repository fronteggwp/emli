-- Еженедельная корректировка нормы и отметка «день записан не полностью».

alter table public.user_settings add column last_checkin date;

create table public.day_flags (
  user_id  uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day      date not null,
  status   text not null check (status in ('complete', 'incomplete')),
  primary key (user_id, day)
);
alter table public.day_flags enable row level security;
create policy "own day flags" on public.day_flags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
