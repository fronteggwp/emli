-- Надёжность: атомарные сохранения, цели подходов, тренировочный максимум 5/3/1,
-- напоминания через полночь, недельные итоги по нормам каждого дня.

-- ───────────── Подходы: цель и план (для прогрессии и этапов программ)
alter table public.workout_sets add column target text check (length(target) <= 20), add column planned smallint;

-- ───────────── Тренировка целиком одной операцией; повторная отправка безопасна
create function public.save_workout(w jsonb, s jsonb) returns uuid
language plpgsql set search_path = public as $$
declare wid uuid := (w->>'id')::uuid;
begin
  if wid is null then raise exception 'id'; end if;
  if exists (select 1 from public.workouts where id = wid) then return wid; end if;
  insert into public.workouts (id, name, routine_id, program, program_day, started_at, finished_at, duration_s, kcal, volume, sets_done, prs, muscles, notes)
  select wid, x.name, x.routine_id, x.program, x.program_day, x.started_at, x.finished_at, coalesce(x.duration_s, 0), coalesce(x.kcal, 0),
    coalesce(x.volume, 0), coalesce(x.sets_done, 0), coalesce(x.prs, '[]'), coalesce(x.muscles, '{}'), x.notes
  from jsonb_populate_record(null::public.workouts, w) x;
  insert into public.workout_sets (workout_id, exercise, ex_order, set_order, kind, weight, reps, seconds, rpe, done_at, target, planned)
  select wid, x.exercise, x.ex_order, x.set_order, coalesce(x.kind, 'normal'), x.weight, x.reps, x.seconds, x.rpe, coalesce(x.done_at, now()), x.target, x.planned
  from jsonb_populate_recordset(null::public.workout_sets, s) x;
  return wid;
end $$;

-- ───────────── Норма на дату: замена одной операцией
create function public.set_targets(d date, kcal int, p int, f int, c int, t int) returns void
language plpgsql set search_path = public as $$
begin
  delete from public.targets where user_id = auth.uid() and start_date = d;
  insert into public.targets (user_id, start_date, calories, protein, fat, carbs, tdee) values (auth.uid(), d, kcal, p, f, c, t);
end $$;

-- ───────────── Еженедельная корректировка: норма, переход на поддержание и отметка — вместе
create function public.apply_checkin(d date, kcal int, p int, f int, c int, t int, apply boolean, maintain boolean, weight numeric)
returns void language plpgsql set search_path = public as $$
begin
  if apply then
    perform public.set_targets(d, kcal, p, f, c, t);
    if maintain then
      insert into public.goals (user_id, kind, start_date, start_weight, target_weight, rate_kg_week)
      values (auth.uid(), 'maintain', d, weight, null, 0);
    end if;
  end if;
  insert into public.user_settings (user_id, last_checkin) values (auth.uid(), d)
  on conflict (user_id) do update set last_checkin = excluded.last_checkin;
end $$;

-- ───────────── Читмил: замена плана одной операцией
create function public.save_cheat_plan(old_id uuid, d date, extra int, spread int, m text, t text)
returns public.cheat_plans language plpgsql set search_path = public as $$
declare r public.cheat_plans;
begin
  if old_id is not null then delete from public.cheat_plans where id = old_id and user_id = auth.uid(); end if;
  insert into public.cheat_plans (user_id, day, extra_kcal, spread_days, mode, title)
  values (auth.uid(), d, extra, spread, m, t)
  on conflict (user_id, day) do update set extra_kcal = excluded.extra_kcal, spread_days = excluded.spread_days, mode = excluded.mode, title = excluded.title
  returning * into r;
  return r;
end $$;

-- ───────────── Программа: шаблоны, настройки и напоминания — вместе
create function public.start_program(key text, days jsonb, workout_days smallint[], label text) returns void
language plpgsql set search_path = public as $$
begin
  delete from public.routines where user_id = auth.uid() and program = key;
  insert into public.routines (user_id, name, program, program_day, position, exercises)
  select auth.uid(), x->>'name', key, (x->>'program_day')::smallint, (x->>'position')::int, x->'exercises'
  from jsonb_array_elements(days) x;
  insert into public.user_settings (user_id, active_program, program_started) values (auth.uid(), key, current_date)
  on conflict (user_id) do update set active_program = excluded.active_program, program_started = excluded.program_started;
  update public.reminders set workout_days = start_program.workout_days, workout_label = label where user_id = auth.uid();
  delete from public.program_state where user_id = auth.uid() and program = key;
end $$;

create function public.stop_program() returns void
language plpgsql set search_path = public as $$
begin
  update public.user_settings set active_program = null where user_id = auth.uid();
  update public.reminders set workout_days = '{}', workout_label = null where user_id = auth.uid();
end $$;

-- ───────────── Состояние программ: тренировочный максимум 5/3/1 по упражнениям
create table public.program_state (
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  program    text not null,
  exercise   text not null,
  tm         numeric(6,2) not null,
  cycle      int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, program, exercise)
);
alter table public.program_state enable row level security;
create policy "own program state" on public.program_state for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────── Напоминания: окно в 2 часа корректно переходит через полночь
create function public.in_window(t time, start time, minutes int default 120) returns boolean
language sql immutable as $$
  select ((extract(epoch from t)::int - extract(epoch from start)::int) % 86400 + 86400) % 86400 < minutes * 60
$$;

create or replace function public.due_reminders()
returns table (user_id uuid, tg_id bigint, kind text, day date, payload jsonb)
language sql stable security definer set search_path = public as $$
  with u as (
    select r.*, p.tg_id, (now() at time zone r.tz) as lt
    from public.reminders r join public.profiles p on p.id = r.user_id
    where r.enabled and p.tg_id > 0
  ),
  cand as (
    select u.user_id, u.tg_id, 'meal' || m.i as kind, u.lt::date as day, jsonb_build_object('meal', m.i) as payload
    from u cross join generate_series(0, 2) as m(i)
    where u.meals and public.in_window(u.lt::time, u.meal_times[m.i + 1])
      and not exists (select 1 from public.food_entries e where e.user_id = u.user_id and e.day = u.lt::date and e.meal = m.i)
      and (select count(distinct e.day) from public.food_entries e
           where e.user_id = u.user_id and e.meal = m.i and e.day between u.lt::date - 7 and u.lt::date - 1) >= 3
    union all
    select u.user_id, u.tg_id, 'workout', u.lt::date, jsonb_build_object('label', u.workout_label)
    from u
    where u.workout and extract(isodow from u.lt)::smallint = any(u.workout_days)
      and public.in_window(u.lt::time, u.workout_time)
      and not exists (select 1 from public.workouts w where w.user_id = u.user_id and (w.started_at at time zone u.tz)::date = u.lt::date)
    union all
    select u.user_id, u.tg_id, 'weigh', u.lt::date, '{}'::jsonb
    from u
    where u.weigh and public.in_window(u.lt::time, u.weigh_time)
      and not exists (select 1 from public.weights w where w.user_id = u.user_id and w.day = u.lt::date)
    union all
    select u.user_id, u.tg_id, 'streak', u.lt::date, jsonb_build_object('streak', public.streak_at(u.user_id, u.lt::date))
    from u
    where u.streak and public.in_window(u.lt::time, u.streak_time)
      and not exists (select 1 from public.food_entries e where e.user_id = u.user_id and e.day = u.lt::date)
      and public.streak_at(u.user_id, u.lt::date) >= 3
    union all
    select u.user_id, u.tg_id, 'weekly', u.lt::date,
      public.period_summary(u.user_id, u.lt::date - 6, u.lt::date) || jsonb_build_object('week_start', u.lt::date - 6)
    from u
    where u.weekly and extract(isodow from u.lt) = 7 and public.in_window(u.lt::time, '19:00', 180)
  )
  select c.* from cand c
  where not exists (select 1 from public.reminder_log l where l.user_id = c.user_id and l.kind = c.kind and l.day = c.day)
$$;

-- ───────────── Итоги периода: норма каждого дня (с читмилами), неполные дни отдельно
create or replace function public.period_summary(uid uuid, d1 date, d2 date) returns jsonb
language sql stable security definer set search_path = public as $$
  with tz as (select public.user_tz(uid) as z),
  daily as (
    select day, sum(kcal) kcal, sum(protein) protein, count(*) n
    from public.food_entries where user_id = uid and day between d1 and d2 group by day
  ),
  typical as (
    select percentile_cont(0.5) within group (order by k) as med
    from (select sum(kcal) k from public.food_entries where user_id = uid and day between d2 - 60 and d2 group by day) q
  ),
  dt as (
    select d.*, t.calories + coalesce(ch.delta, 0) as target, t.protein as tprotein,
      coalesce(f.status,
        case when d.kcal >= greatest(500, least(coalesce(t.calories, 2000), coalesce((select med from typical), 2000)) * 0.5)
          then 'complete' else 'incomplete' end) as st
    from daily d
    left join lateral (
      select calories, protein from public.targets
      where user_id = uid and start_date <= d.day order by start_date desc, created_at desc limit 1
    ) t on true
    left join lateral (
      select sum(case
        when c.day = d.day then c.extra_kcal::numeric
        when c.mode = 'before' and d.day between c.day - c.spread_days and c.day - 1 then -c.extra_kcal::numeric / c.spread_days
        when c.mode = 'after' and d.day between c.day + 1 and c.day + c.spread_days then -c.extra_kcal::numeric / c.spread_days
        else 0 end) as delta
      from public.cheat_plans c where c.user_id = uid
    ) ch on true
    left join public.day_flags f on f.user_id = uid and f.day = d.day
  ),
  full_days as (select * from dt where st = 'complete'),
  w_now as (select avg(weight_kg) a, count(*) n from public.weights where user_id = uid and day between d1 and d2),
  w_prev as (select avg(weight_kg) a from public.weights where user_id = uid and day between d1 - 7 and d1 - 1),
  wk as (
    select count(*) n, coalesce(sum(volume), 0) vol, coalesce(sum(sets_done), 0) sets,
      coalesce(sum(duration_s), 0) dur, coalesce(sum(kcal), 0) kcal, coalesce(sum(jsonb_array_length(prs)), 0) prs
    from public.workouts, tz
    where user_id = uid and (started_at at time zone tz.z)::date between d1 and d2
  ),
  wk_prev as (
    select count(*) n from public.workouts, tz
    where user_id = uid and (started_at at time zone tz.z)::date between d1 - 7 and d1 - 1
  )
  select jsonb_build_object(
    'from', d1, 'to', d2,
    'days_logged', (select count(*) from daily),
    'days_complete', (select count(*) from full_days),
    'avg_kcal', (select round(avg(kcal)) from full_days),
    'avg_protein', (select round(avg(protein)) from full_days),
    'target_kcal', (select round(avg(target)) from full_days),
    'target_protein', (select round(avg(tprotein)) from full_days),
    'days_on_target', (select count(*) from full_days where target is not null and abs(kcal - target) <= target * 0.1),
    'weight_avg', (select round(a, 2) from w_now),
    'weight_prev_avg', (select round(a, 2) from w_prev),
    'weigh_ins', (select n from w_now),
    'workouts', (select n from wk),
    'workouts_prev', (select n from wk_prev),
    'volume', (select round(vol) from wk),
    'sets', (select sets from wk),
    'minutes', (select round(dur / 60.0) from wk),
    'burned', (select kcal from wk),
    'prs', (select prs from wk),
    'streak', public.streak_at(uid, d2),
    'workouts_plan', coalesce((select array_length(workout_days, 1) from public.reminders where user_id = uid), 0)
  )
$$;

-- ───────────── Права
do $$
declare f text;
begin
  foreach f in array array[
    'public.save_workout(jsonb, jsonb)', 'public.set_targets(date, int, int, int, int, int)',
    'public.apply_checkin(date, int, int, int, int, int, boolean, boolean, numeric)',
    'public.save_cheat_plan(uuid, date, int, int, text, text)', 'public.start_program(text, jsonb, smallint[], text)',
    'public.stop_program()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke execute on function public.in_window(time, time, int) from public, anon, authenticated;
end $$;
