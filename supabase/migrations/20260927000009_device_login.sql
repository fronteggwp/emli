-- Вход в Emli вне Telegram (приложение на главном экране): подтверждение через бота
-- и долгоживущий ключ устройства вместо данных запуска Telegram.
-- Таблицы доступны только серверным функциям (RLS без политик).

create table public.login_requests (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,          -- попадает в ссылку t.me/<бот>?start=login_<code>
  secret_hash   text not null,                 -- sha256 секрета, который знает только устройство
  confirmed_tg  bigint,                        -- кто подтвердил в боте
  tg_first_name text,
  tg_last_name  text,
  tg_username   text,
  confirmed_at  timestamptz,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index login_requests_created on public.login_requests (created_at);
alter table public.login_requests enable row level security;

create table public.device_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  tg_id        bigint not null,
  secret_hash  text not null unique,
  label        text,
  created_at   timestamptz not null default now(),
  last_used    timestamptz not null default now()
);
create index device_sessions_user on public.device_sessions (user_id);
alter table public.device_sessions enable row level security;

-- Свои устройства можно посмотреть и отключить
create policy "own devices read" on public.device_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy "own devices delete" on public.device_sessions for delete to authenticated using (user_id = (select auth.uid()));
revoke insert, update on public.device_sessions from authenticated, anon;
revoke all on public.login_requests from authenticated, anon;

-- Старые запросы на вход чистим раз в сутки
select cron.schedule('emli-login-cleanup', '17 4 * * *', $$delete from public.login_requests where created_at < now() - interval '1 day'$$);
