-- Напоминания и итоги недели от бота, избранное, свои приёмы пищи и рецепты, достижения, челленджи.

-- ───────────── Напоминания
create table public.reminders (
  user_id        uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  enabled        boolean not null default true,
  tz             text not null default 'Europe/Moscow',
  meals          boolean not null default true,
  meal_times     time[] not null default '{10:30,14:30,20:00}',
  workout        boolean not null default true,
  workout_time   time not null default '18:00',
  workout_days   smallint[] not null default '{}',   -- дни недели 1..7 (пн..вс)
  workout_label  text check (length(workout_label) <= 120),
  weigh          boolean not null default false,
  weigh_time     time not null default '09:00',
  streak         boolean not null default true,
  streak_time    time not null default '21:00',
  weekly         boolean not null default true,
  updated_at     timestamptz not null default now(),
  check (array_length(meal_times, 1) = 3)
);
create trigger reminders_touch before update on public.reminders for each row execute function public.touch_updated_at();
alter table public.reminders enable row level security;
create policy "own reminders" on public.reminders for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Что уже отправлено (чтобы не повторяться)
create table public.reminder_log (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  kind     text not null,
  day      date not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind, day)
);
alter table public.reminder_log enable row level security;

create function public.user_tz(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select tz from public.reminders where user_id = uid), 'Europe/Moscow')
$$;

-- Серия дней с записями, заканчивающаяся днём d (или d-1, если в d ещё пусто)
create function public.streak_at(uid uuid, d date) returns int
language sql stable security definer set search_path = public as $$
  with days as (select distinct day from public.food_entries where user_id = uid and day <= d and day > d - 400),
  start as (select case when exists (select 1 from days where day = d) then d else d - 1 end as s),
  g as (
    select day, (select s from start) - day as off, row_number() over (order by day desc) - 1 as rn
    from days where day <= (select s from start)
  )
  select count(*)::int from g where off = rn
$$;

-- Итоги периода: питание, вес, тренировки
create function public.period_summary(uid uuid, d1 date, d2 date) returns jsonb
language sql stable security definer set search_path = public as $$
  with tz as (select public.user_tz(uid) as z),
  daily as (
    select day, sum(kcal) kcal, sum(protein) protein
    from public.food_entries where user_id = uid and day between d1 and d2 group by day
  ),
  tgt as (
    select calories, protein from public.targets
    where user_id = uid and start_date <= d2 order by start_date desc, created_at desc limit 1
  ),
  w_now as (select avg(weight_kg) a, count(*) n from public.weights where user_id = uid and day between d1 and d2),
  w_prev as (select avg(weight_kg) a from public.weights where user_id = uid and day between d1 - 7 and d1 - 1),
  wk as (
    select count(*) n, coalesce(sum(volume), 0) vol, coalesce(sum(sets_done), 0) sets,
      coalesce(sum(duration_s), 0) dur, coalesce(sum(kcal), 0) kcal,
      coalesce(sum(jsonb_array_length(prs)), 0) prs
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
    'avg_kcal', (select round(avg(kcal)) from daily),
    'avg_protein', (select round(avg(protein)) from daily),
    'target_kcal', (select calories from tgt),
    'target_protein', (select protein from tgt),
    'days_on_target', (select count(*) from daily, tgt where abs(daily.kcal - tgt.calories) <= tgt.calories * 0.1),
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
    'streak', public.streak_at(uid, d2)
  )
$$;

create function public.my_summary(d1 date, d2 date) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null or d2 - d1 > 366 then null else public.period_summary(auth.uid(), d1, d2) end
$$;

-- Кому и что пора напомнить прямо сейчас (окно 2 часа после выбранного времени)
create function public.due_reminders()
returns table (user_id uuid, tg_id bigint, kind text, day date, payload jsonb)
language sql stable security definer set search_path = public as $$
  with u as (
    select r.*, p.tg_id, p.first_name, (now() at time zone r.tz) as lt
    from public.reminders r join public.profiles p on p.id = r.user_id
    where r.enabled and p.tg_id > 0
  ),
  cand as (
    -- приёмы пищи: только те, что человек обычно записывает (3+ из последних 7 дней)
    select u.user_id, u.tg_id, 'meal' || m.i as kind, u.lt::date as day, jsonb_build_object('meal', m.i) as payload
    from u cross join generate_series(0, 2) as m(i)
    where u.meals
      and u.lt::time >= u.meal_times[m.i + 1] and u.lt::time < u.meal_times[m.i + 1] + interval '2 hours'
      and not exists (select 1 from public.food_entries e where e.user_id = u.user_id and e.day = u.lt::date and e.meal = m.i)
      and (select count(distinct e.day) from public.food_entries e
           where e.user_id = u.user_id and e.meal = m.i and e.day between u.lt::date - 7 and u.lt::date - 1) >= 3
    union all
    select u.user_id, u.tg_id, 'workout', u.lt::date, jsonb_build_object('label', u.workout_label)
    from u
    where u.workout and extract(isodow from u.lt)::smallint = any(u.workout_days)
      and u.lt::time >= u.workout_time and u.lt::time < u.workout_time + interval '2 hours'
      and not exists (select 1 from public.workouts w where w.user_id = u.user_id
                      and (w.started_at at time zone u.tz)::date = u.lt::date)
    union all
    select u.user_id, u.tg_id, 'weigh', u.lt::date, '{}'::jsonb
    from u
    where u.weigh and u.lt::time >= u.weigh_time and u.lt::time < u.weigh_time + interval '2 hours'
      and not exists (select 1 from public.weights w where w.user_id = u.user_id and w.day = u.lt::date)
    union all
    select u.user_id, u.tg_id, 'streak', u.lt::date, jsonb_build_object('streak', public.streak_at(u.user_id, u.lt::date))
    from u
    where u.streak and u.lt::time >= u.streak_time and u.lt::time < u.streak_time + interval '2 hours'
      and not exists (select 1 from public.food_entries e where e.user_id = u.user_id and e.day = u.lt::date)
      and public.streak_at(u.user_id, u.lt::date) >= 3
    union all
    select u.user_id, u.tg_id, 'weekly', u.lt::date, public.period_summary(u.user_id, u.lt::date - 6, u.lt::date)
    from u
    where u.weekly and extract(isodow from u.lt) = 7 and u.lt::time >= '19:00' and u.lt::time < '22:00'
  )
  select c.* from cand c
  where not exists (select 1 from public.reminder_log l where l.user_id = c.user_id and l.kind = c.kind and l.day = c.day)
$$;

-- Раз в 15 минут: если есть кому писать — будим функцию reminders
create function public.run_reminders() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare secret text;
begin
  if not exists (select 1 from public.due_reminders()) then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://ezhgiczvwsufzhwwwrkr.supabase.co/functions/v1/reminders',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret)
  );
end $$;

create extension if not exists pg_cron;
select cron.schedule('emli-reminders', '*/15 * * * *', 'select public.run_reminders()');

-- ───────────── Избранное (продукты и рецепты из базы)
create table public.favorites (
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind        text not null check (kind in ('food', 'recipe')),
  ref         text not null check (length(ref) <= 80),
  created_at  timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.favorites enable row level security;
create policy "own favorites" on public.favorites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────── Мои приёмы пищи: набор продуктов, добавляется в один тап
create table public.meal_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null check (length(name) between 1 and 60),
  emoji       text not null default '🍽️' check (length(emoji) <= 16),
  -- [{ food_id, name, brand, grams, kcal, protein, fat, carbs }]
  items       jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 40),
  uses        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index meal_templates_user on public.meal_templates (user_id, uses desc);
create trigger meal_templates_touch before update on public.meal_templates for each row execute function public.touch_updated_at();
alter table public.meal_templates enable row level security;
create policy "own meal templates" on public.meal_templates for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────── Свои рецепты
create table public.user_recipes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title        text not null check (length(title) between 1 and 80),
  emoji        text not null default '🍲' check (length(emoji) <= 16),
  servings     smallint not null default 1 check (servings between 1 and 50),
  time         smallint check (time between 1 and 1440),
  -- [{ food_id, name, grams, kcal, protein, fat, carbs }] — значения на указанные граммы
  ingredients  jsonb not null check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) between 1 and 60),
  steps        text check (length(steps) <= 6000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index user_recipes_user on public.user_recipes (user_id, created_at desc);
create trigger user_recipes_touch before update on public.user_recipes for each row execute function public.touch_updated_at();
alter table public.user_recipes enable row level security;
create policy "own recipes" on public.user_recipes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────── Челленджи с друзьями
create table public.challenges (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (length(title) between 1 and 60),
  emoji       text not null default '🏆' check (length(emoji) <= 16),
  metric      text not null check (metric in ('workouts', 'volume', 'sets', 'minutes', 'logged_days', 'weigh_ins')),
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 92)
);
create table public.challenge_members (
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'invited' check (status in ('invited', 'joined')),
  invited_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index challenge_members_user on public.challenge_members (user_id);
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;

create function public.in_challenge(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.challenge_members where challenge_id = cid and user_id = auth.uid())
$$;
create policy "members see challenge" on public.challenges for select to authenticated using (public.in_challenge(id));
create policy "members see members" on public.challenge_members for select to authenticated using (public.in_challenge(challenge_id));

-- Уведомления о приглашениях
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('friend_request', 'friend_accept', 'like', 'comment', 'challenge'));
alter table public.notifications add column challenge_id uuid references public.challenges(id) on delete cascade;

create function public.metric_value(uid uuid, metric text, d1 date, d2 date) returns numeric
language sql stable security definer set search_path = public as $$
  select case metric
    when 'workouts' then (select count(*) from public.workouts w where w.user_id = uid and (w.started_at at time zone public.user_tz(uid))::date between d1 and d2)
    when 'volume' then (select coalesce(sum(volume), 0) from public.workouts w where w.user_id = uid and (w.started_at at time zone public.user_tz(uid))::date between d1 and d2)
    when 'sets' then (select coalesce(sum(sets_done), 0) from public.workouts w where w.user_id = uid and (w.started_at at time zone public.user_tz(uid))::date between d1 and d2)
    when 'minutes' then (select coalesce(round(sum(duration_s) / 60.0), 0) from public.workouts w where w.user_id = uid and (w.started_at at time zone public.user_tz(uid))::date between d1 and d2)
    when 'logged_days' then (select count(distinct day) from public.food_entries e where e.user_id = uid and e.day between d1 and d2)
    when 'weigh_ins' then (select count(*) from public.weights x where x.user_id = uid and x.day between d1 and d2)
  end::numeric
$$;

create function public.challenge_board(cid uuid)
returns table (user_id uuid, first_name text, last_name text, avatar_url text, value numeric, place int)
language sql stable security definer set search_path = public as $$
  with c as (select * from public.challenges where id = cid and public.in_challenge(cid)),
  v as (
    select m.user_id, public.metric_value(m.user_id, c.metric, c.start_date, least(c.end_date, current_date + 1)) as value
    from public.challenge_members m, c
    where m.challenge_id = cid and m.status = 'joined'
  )
  select v.user_id, p.first_name, p.last_name, p.avatar_url, v.value,
    (rank() over (order by v.value desc))::int
  from v join public.profiles p on p.id = v.user_id
  order by v.value desc, p.first_name
$$;

create function public.my_challenges()
returns table (id uuid, title text, emoji text, metric text, start_date date, end_date date, owner_id uuid,
               status text, members int, my_value numeric, my_place int, leader_name text, leader_value numeric)
language sql stable security definer set search_path = public as $$
  select c.id, c.title, c.emoji, c.metric, c.start_date, c.end_date, c.owner_id, m.status,
    (select count(*)::int from public.challenge_members x where x.challenge_id = c.id and x.status = 'joined'),
    b.value, b.place, l.first_name, l.value
  from public.challenge_members m
  join public.challenges c on c.id = m.challenge_id
  left join lateral (select * from public.challenge_board(c.id) bb where bb.user_id = auth.uid()) b on true
  left join lateral (select * from public.challenge_board(c.id) bb order by bb.value desc limit 1) l on true
  where m.user_id = auth.uid()
  order by (c.end_date < current_date), m.status = 'joined', c.end_date
$$;

create function public.invite_to_challenge(cid uuid, uids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int := 0; u uuid; t text;
begin
  if not exists (select 1 from public.challenge_members where challenge_id = cid and user_id = me and status = 'joined') then
    raise exception 'not a member';
  end if;
  select title into t from public.challenges where id = cid;
  foreach u in array coalesce(uids, '{}') loop
    if u <> me and public.are_friends(me, u) then
      insert into public.challenge_members (challenge_id, user_id, invited_by) values (cid, u, me) on conflict do nothing;
      if found then
        n := n + 1;
        insert into public.notifications (user_id, actor_id, kind, challenge_id, preview) values (u, me, 'challenge', cid, t);
      end if;
    end if;
  end loop;
  return n;
end $$;

create function public.create_challenge(title text, emoji text, metric text, start_date date, end_date date, invitees uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null then raise exception 'auth'; end if;
  if (select count(*) from public.challenges where owner_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many';
  end if;
  insert into public.challenges (owner_id, title, emoji, metric, start_date, end_date)
    values (me, title, coalesce(nullif(emoji, ''), '🏆'), metric, start_date, end_date) returning id into cid;
  insert into public.challenge_members (challenge_id, user_id, status) values (cid, me, 'joined');
  perform public.invite_to_challenge(cid, invitees);
  return cid;
end $$;

create function public.respond_challenge(cid uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if accept then
    update public.challenge_members set status = 'joined' where challenge_id = cid and user_id = auth.uid();
  else
    delete from public.challenge_members where challenge_id = cid and user_id = auth.uid() and status = 'invited';
  end if;
  delete from public.notifications where user_id = auth.uid() and kind = 'challenge' and challenge_id = cid;
end $$;

create function public.leave_challenge(cid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.challenge_members where challenge_id = cid and user_id = auth.uid();
  -- никого не осталось — удаляем сам челлендж
  delete from public.challenges c where c.id = cid
    and not exists (select 1 from public.challenge_members m where m.challenge_id = cid and m.status = 'joined');
end $$;

-- ───────────── Достижения: считаются на сервере по реальным данным
create table public.achievements (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  key        text not null,
  earned_at  timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.achievements enable row level security;
create policy "achievements visible" on public.achievements for select to authenticated using (
  user_id = (select auth.uid())
  or public.are_friends((select auth.uid()), user_id)
  or exists (select 1 from public.profiles p where p.id = user_id and not p.is_private)
);

create function public.sync_achievements() returns setof text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  k text[] := '{}';
  z text;
  n numeric;
  best int;
  w_last numeric;
  g record;
  c record;
begin
  if uid is null then return; end if;
  z := public.user_tz(uid);

  -- питание
  select count(distinct day) into n from public.food_entries where user_id = uid;
  if n >= 1 then k := k || 'first_log'::text; end if;
  if n >= 100 then k := k || 'logged_100'::text; end if;
  select coalesce(max(cnt), 0) into best from (
    select count(*) cnt from (
      select day, day - (row_number() over (order by day))::int as grp
      from (select distinct day from public.food_entries where user_id = uid) d
    ) x group by grp
  ) y;
  if best >= 7 then k := k || 'streak_7'::text; end if;
  if best >= 30 then k := k || 'streak_30'::text; end if;
  if best >= 100 then k := k || 'streak_100'::text; end if;
  select count(*) into n from (
    select e.day from public.food_entries e where e.user_id = uid and e.day > current_date - 60
    group by e.day
    having abs(sum(e.kcal) - coalesce((select t.calories from public.targets t where t.user_id = uid and t.start_date <= e.day
                                       order by t.start_date desc, t.created_at desc limit 1), 0)) <= 100
  ) q;
  if n >= 7 then k := k || 'on_target_7'::text; end if;

  -- вес
  select count(*) into n from public.weights where user_id = uid;
  if n >= 1 then k := k || 'first_weigh'::text; end if;
  if n >= 30 then k := k || 'weigh_30'::text; end if;
  select weight_kg into w_last from public.weights where user_id = uid order by day desc limit 1;
  select * into g from public.goals where user_id = uid order by created_at desc limit 1;
  if found and w_last is not null then
    if (select start_weight from public.goals where user_id = uid order by created_at limit 1) - w_last >= 5 then
      k := k || 'lost_5'::text;
    end if;
    if g.target_weight is not null and (
      (g.kind = 'lose' and w_last <= g.target_weight) or (g.kind = 'gain' and w_last >= g.target_weight)
    ) then k := k || 'goal_reached'::text; end if;
  end if;

  -- тренировки
  select count(*) into n from public.workouts where user_id = uid;
  if n >= 1 then k := k || 'first_workout'::text; end if;
  if n >= 10 then k := k || 'workouts_10'::text; end if;
  if n >= 50 then k := k || 'workouts_50'::text; end if;
  if n >= 100 then k := k || 'workouts_100'::text; end if;
  if exists (select 1 from public.workouts where user_id = uid and volume >= 10000) then k := k || 'volume_10t'::text; end if;
  select coalesce(sum(volume), 0) into n from public.workouts where user_id = uid;
  if n >= 100000 then k := k || 'volume_100t'::text; end if;
  if n >= 1000000 then k := k || 'volume_1000t'::text; end if;
  select coalesce(sum(jsonb_array_length(prs)), 0) into n from public.workouts where user_id = uid;
  if n >= 1 then k := k || 'first_pr'::text; end if;
  if n >= 25 then k := k || 'prs_25'::text; end if;
  if exists (select 1 from public.workouts where user_id = uid and extract(hour from started_at at time zone z) < 7) then
    k := k || 'early_bird'::text;
  end if;
  if exists (select 1 from public.workouts where user_id = uid and extract(hour from started_at at time zone z) >= 22) then
    k := k || 'night_owl'::text;
  end if;
  -- 4 недели подряд минимум по 3 тренировки
  select count(*) into n from (
    select date_trunc('week', started_at at time zone z) wk from public.workouts
    where user_id = uid and started_at > now() - interval '28 days'
    group by 1 having count(*) >= 3
  ) q;
  if n >= 4 then k := k || 'consistent_month'::text; end if;

  -- общение
  select count(*) into n from public.friendships where status = 'accepted' and (requester = uid or addressee = uid);
  if n >= 1 then k := k || 'first_friend'::text; end if;
  if n >= 10 then k := k || 'friends_10'::text; end if;
  if exists (select 1 from public.posts where author_id = uid) then k := k || 'first_post'::text; end if;

  -- челленджи: победа в завершённом
  for c in
    select ch.id from public.challenges ch join public.challenge_members m on m.challenge_id = ch.id
    where m.user_id = uid and m.status = 'joined' and ch.end_date < current_date
      and (select count(*) from public.challenge_members x where x.challenge_id = ch.id and x.status = 'joined') >= 2
  loop
    if exists (select 1 from public.challenge_board(c.id) b where b.user_id = uid and b.place = 1 and b.value > 0) then
      k := k || 'challenge_win'::text;
      exit;
    end if;
  end loop;

  return query
    insert into public.achievements (user_id, key)
    select uid, x from unnest(k) x
    on conflict do nothing
    returning key;
end $$;

-- ───────────── Права
do $$
declare f text;
begin
  foreach f in array array[
    'public.user_tz(uuid)', 'public.streak_at(uuid, date)', 'public.period_summary(uuid, date, date)',
    'public.due_reminders()', 'public.run_reminders()', 'public.metric_value(uuid, text, date, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.my_summary(date, date)', 'public.in_challenge(uuid)', 'public.challenge_board(uuid)', 'public.my_challenges()',
    'public.invite_to_challenge(uuid, uuid[])', 'public.create_challenge(text, text, text, date, date, uuid[])',
    'public.respond_challenge(uuid, boolean)', 'public.leave_challenge(uuid)', 'public.sync_achievements()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
