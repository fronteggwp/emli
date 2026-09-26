-- Основа: профили, настройки тела, продукты, дневник питания, вес, цели, программы.

create extension if not exists pg_trgm with schema extensions;

-- Публичная часть профиля (понадобится для друзей и ленты)
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  tg_id       bigint unique not null,
  username    text unique,
  first_name  text not null default '',
  last_name   text,
  avatar_url  text,
  bio         text,
  is_private  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Приватная часть: только сам пользователь
create table public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  sex         text check (sex in ('male', 'female')),
  birth_date  date,
  height_cm   numeric(5,1),
  activity    numeric(4,3),
  onboarded   boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- Продукты: owner_id is null — общая база, иначе личный продукт пользователя. КБЖУ на 100 г.
create table public.foods (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users(id) on delete cascade,
  name          text not null check (length(name) between 1 and 120),
  brand         text,
  barcode       text,
  category      text,
  kcal          numeric(6,1) not null check (kcal >= 0),
  protein       numeric(5,1) not null check (protein >= 0),
  fat           numeric(5,1) not null check (fat >= 0),
  carbs         numeric(5,1) not null check (carbs >= 0),
  serving_g     numeric(6,1),
  serving_name  text,
  source        text not null default 'user' check (source in ('system', 'off', 'user')),
  created_at    timestamptz not null default now()
);
create index foods_name_trgm on public.foods using gin (lower(name) extensions.gin_trgm_ops);
create index foods_barcode on public.foods (barcode) where barcode is not null;
create index foods_owner on public.foods (owner_id);

-- Дневник питания. Значения — уже посчитанные на съеденную порцию (снимок на момент записи).
create table public.food_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day         date not null,
  meal        smallint not null check (meal between 0 and 3),
  food_id     uuid references public.foods(id) on delete set null,
  name        text not null,
  brand       text,
  grams       numeric(7,1),
  kcal        numeric(7,1) not null check (kcal >= 0),
  protein     numeric(6,1) not null default 0 check (protein >= 0),
  fat         numeric(6,1) not null default 0 check (fat >= 0),
  carbs       numeric(6,1) not null default 0 check (carbs >= 0),
  created_at  timestamptz not null default now()
);
create index food_entries_user_day on public.food_entries (user_id, day);

create table public.weights (
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day         date not null,
  weight_kg   numeric(5,2) not null check (weight_kg between 20 and 400),
  body_fat    numeric(4,1) check (body_fat between 2 and 70),
  created_at  timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind           text not null check (kind in ('lose', 'maintain', 'gain')),
  start_date     date not null default current_date,
  start_weight   numeric(5,2) not null,
  target_weight  numeric(5,2),
  rate_kg_week   numeric(4,2) not null default 0,
  created_at     timestamptz not null default now()
);
create index goals_user on public.goals (user_id, created_at desc);

-- Программа питания: действует с start_date до следующей записи
create table public.targets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  start_date  date not null,
  calories    int not null check (calories between 800 and 8000),
  protein     int not null check (protein >= 0),
  fat         int not null check (fat >= 0),
  carbs       int not null check (carbs >= 0),
  tdee        int,
  created_at  timestamptz not null default now()
);
create index targets_user on public.targets (user_id, start_date desc);

-- updated_at
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.user_settings for each row execute function public.touch_updated_at();

-- RLS
alter table public.profiles      enable row level security;
alter table public.user_settings enable row level security;
alter table public.foods         enable row level security;
alter table public.food_entries  enable row level security;
alter table public.weights       enable row level security;
alter table public.goals         enable row level security;
alter table public.targets       enable row level security;

-- Профили пока видит только владелец; для соцсети политика расширится.
create policy "own profile read"   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own settings" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "foods read"   on public.foods for select to authenticated using (owner_id is null or owner_id = (select auth.uid()));
create policy "foods insert" on public.foods for insert to authenticated with check (owner_id = (select auth.uid()) and source <> 'system');
create policy "foods update" on public.foods for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and source <> 'system');
create policy "foods delete" on public.foods for delete to authenticated using (owner_id = (select auth.uid()));

create policy "own entries" on public.food_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own weights" on public.weights for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own goals" on public.goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own targets" on public.targets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Поиск продуктов: сначала совпадения с начала слова, потом по похожести
create function public.search_foods(q text, lim int default 40)
returns setof public.foods
language sql stable
set search_path = public, extensions
as $$
  with needle as (select lower(trim(q)) as n)
  select f.* from public.foods f, needle
  where (f.owner_id is null or f.owner_id = auth.uid())
    and (lower(f.name) like '%' || needle.n || '%'
         or lower(coalesce(f.brand, '')) like '%' || needle.n || '%'
         or word_similarity(needle.n, lower(f.name)) > 0.45)
  order by
    (lower(f.name) like needle.n || '%') desc,
    (lower(f.name) ~ ('(^|\s)' || regexp_replace(needle.n, '([.*+?^${}()|\[\]\\])', '\\\1', 'g'))) desc,
    (f.owner_id is not null) desc,
    word_similarity(needle.n, lower(f.name)) desc,
    length(f.name)
  limit lim
$$;

-- Недавние продукты пользователя (по последней записи каждого названия)
create function public.recent_foods(lim int default 40)
returns table (food_id uuid, name text, brand text, grams numeric, kcal numeric, protein numeric, fat numeric, carbs numeric, last_used timestamptz)
language sql stable
as $$
  select * from (
    select distinct on (lower(e.name))
      e.food_id, e.name, e.brand, e.grams, e.kcal, e.protein, e.fat, e.carbs, e.created_at as last_used
    from public.food_entries e
    where e.user_id = auth.uid()
    order by lower(e.name), e.created_at desc
  ) t
  order by last_used desc
  limit lim
$$;

-- Суммы по дням для аналитики
create function public.daily_totals(from_day date, to_day date)
returns table (day date, kcal numeric, protein numeric, fat numeric, carbs numeric, entries int)
language sql stable
as $$
  select e.day, sum(e.kcal), sum(e.protein), sum(e.fat), sum(e.carbs), count(*)::int
  from public.food_entries e
  where e.user_id = auth.uid() and e.day between from_day and to_day
  group by e.day
  order by e.day
$$;
