-- Тренировки: шаблоны (в т.ч. дни программ), завершённые тренировки, подходы, свои упражнения.

create table public.routines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name         text not null check (length(name) between 1 and 80),
  program      text,                 -- ключ готовой программы, если шаблон из неё
  program_day  smallint,             -- номер дня в программе
  position     int not null default 0,
  -- [{ ex, sets: [{ reps: "8-12", kind }], rest, note }]
  exercises    jsonb not null default '[]',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index routines_user on public.routines (user_id, program, program_day, position);
create trigger routines_touch before update on public.routines for each row execute function public.touch_updated_at();

create table public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name         text not null default 'Тренировка' check (length(name) between 1 and 80),
  routine_id   uuid references public.routines(id) on delete set null,
  program      text,
  program_day  smallint,
  started_at   timestamptz not null,
  finished_at  timestamptz not null,
  duration_s   int not null default 0,
  kcal         int not null default 0,
  volume       numeric(10,1) not null default 0,   -- сумма вес × повторы, кг
  sets_done    int not null default 0,
  prs          jsonb not null default '[]',         -- рекорды этой тренировки
  muscles      jsonb not null default '{}',         -- подходы по мышцам
  notes        text check (length(notes) <= 2000),
  created_at   timestamptz not null default now()
);
create index workouts_user on public.workouts (user_id, started_at desc);

create table public.workout_sets (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references public.workouts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  exercise    text not null,           -- id из каталога или c:<uuid> своего упражнения
  ex_order    smallint not null,
  set_order   smallint not null,
  kind        text not null default 'normal' check (kind in ('normal', 'warmup', 'drop', 'failure')),
  weight      numeric(6,2),
  reps        smallint,
  seconds     int,
  rpe         numeric(3,1),
  done_at     timestamptz not null default now()
);
create index workout_sets_workout on public.workout_sets (workout_id);
create index workout_sets_user_ex on public.workout_sets (user_id, exercise, done_at desc);

create table public.custom_exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null check (length(name) between 1 and 80),
  category    text not null default 'strength',
  equipment   text,
  muscles     text[] not null default '{}',
  created_at  timestamptz not null default now()
);

alter table public.user_settings add column active_program text, add column program_started date;

alter table public.routines         enable row level security;
alter table public.workouts         enable row level security;
alter table public.workout_sets     enable row level security;
alter table public.custom_exercises enable row level security;

create policy "own routines" on public.routines for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own workouts" on public.workouts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own sets" on public.workout_sets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own custom exercises" on public.custom_exercises for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Лучшие результаты по каждому упражнению (рабочие подходы)
create function public.exercise_bests()
returns table (exercise text, best_weight numeric, best_e1rm numeric, best_reps int, best_volume numeric, sets int, last_done timestamptz)
language sql stable set search_path = public as $$
  select s.exercise,
    max(s.weight),
    max(case when s.weight > 0 and s.reps between 1 and 12
      then round(s.weight * (case when s.reps = 1 then 1 else 1 + s.reps / 30.0 end), 1) end),
    max(s.reps)::int,
    max(coalesce(s.weight, 0) * coalesce(s.reps, 0)),
    count(*)::int,
    max(s.done_at)
  from public.workout_sets s
  where s.user_id = auth.uid() and s.kind <> 'warmup'
  group by s.exercise
$$;

-- Подходы из последней тренировки с этими упражнениями — для колонки «прошлый раз»
create function public.last_sets(exs text[])
returns table (exercise text, set_order smallint, kind text, weight numeric, reps smallint, seconds int, done_at timestamptz)
language sql stable set search_path = public as $$
  with last as (
    select distinct on (s.exercise) s.exercise, s.workout_id
    from public.workout_sets s
    where s.user_id = auth.uid() and s.exercise = any(exs)
    order by s.exercise, s.done_at desc
  )
  select s.exercise, s.set_order, s.kind, s.weight, s.reps, s.seconds, s.done_at
  from public.workout_sets s join last l on l.workout_id = s.workout_id and l.exercise = s.exercise
  order by s.exercise, s.set_order
$$;

revoke execute on function public.exercise_bests() from public, anon;
revoke execute on function public.last_sets(text[]) from public, anon;
grant execute on function public.exercise_bests() to authenticated;
grant execute on function public.last_sets(text[]) to authenticated;
