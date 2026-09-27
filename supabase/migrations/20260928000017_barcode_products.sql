-- Общая база штрихкодов Emli: всё, что нашли в открытых базах, прочитали с этикеток и добавили пользователи.
-- Один раз найденный товар дальше находится мгновенно у всех. Пишет только сервер (функция barcode).
create table public.barcode_products (
  barcode      text primary key check (barcode ~ '^[0-9]{8,14}$'),
  name         text check (length(name) <= 160),
  brand        text check (length(brand) <= 80),
  kcal         numeric(6,1) check (kcal between 0 and 950),
  protein      numeric(5,1) check (protein between 0 and 100),
  fat          numeric(5,1) check (fat between 0 and 100),
  carbs        numeric(5,1) check (carbs between 0 and 100),
  serving_g    numeric(6,1),
  net_g        numeric(7,1),
  liquid       boolean not null default false,
  -- off — Open Food Facts; off_label — КБЖУ прочитано ИИ с фото этикетки из Open Food Facts;
  -- usda — FoodData Central; label — фото этикетки от пользователя; user — введено руками;
  -- estimate — оценка ИИ по названию; name — известно только название; miss — нигде нет
  source       text not null check (source in ('off', 'off_label', 'usda', 'label', 'user', 'estimate', 'name', 'miss')),
  trust        smallint not null default 0,
  image_url    text,
  contributed_by uuid references public.profiles(id) on delete set null,
  confirms     int not null default 0,
  checked_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index barcode_products_name on public.barcode_products using gin (lower(name) extensions.gin_trgm_ops) where kcal is not null;

alter table public.barcode_products enable row level security;
create policy "barcodes read" on public.barcode_products for select to authenticated using (true);
revoke insert, update, delete on public.barcode_products from authenticated, anon;

-- Кто что добавил: защита от спама и откат плохих правок
create table public.barcode_contributions (
  id          bigint generated always as identity primary key,
  barcode     text not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
create index barcode_contrib_user on public.barcode_contributions (user_id, created_at desc);
alter table public.barcode_contributions enable row level security;
revoke all on public.barcode_contributions from authenticated, anon;
