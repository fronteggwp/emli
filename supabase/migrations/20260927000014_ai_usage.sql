-- Учёт запросов к ИИ: ограничение частоты на пользователя (запросы делает только сервер)
create table public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  ms         int,
  ok         boolean not null default true,
  created_at timestamptz not null default now()
);
create index ai_usage_user on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;
create policy "own ai usage read" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.ai_usage from authenticated, anon;
