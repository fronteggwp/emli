-- Тренд веса на сервере — тот же алгоритм, что в приложении (src/lib/nutrition.ts, trendSeries):
-- Хольт (уровень + скорость), выбросы гасятся, первые взвешивания весят больше (2/(n+1), не меньше 0,1).
-- Нужен, чтобы «вес, 30 д» в публичном профиле совпадал с тем, что человек видит у себя.
create or replace function public.weight_trend(uid uuid, until date) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  w record;
  d date;
  lvl numeric;
  slope numeric := 0;
  since int := 0;
  n int := 0;
  prev date;
  r numeric;
  lim numeric;
  a numeric;
begin
  for w in select day, weight_kg from public.weights where user_id = uid and day <= until order by day loop
    if n = 0 then
      lvl := w.weight_kg;
      n := 1;
      prev := w.day;
      continue;
    end if;
    -- Дни без взвешиваний: тренд продолжает движение, но не дольше 10 дней
    d := prev + 1;
    while d <= w.day loop
      since := since + 1;
      if since <= 10 then lvl := lvl + slope; end if;
      d := d + 1;
    end loop;
    r := w.weight_kg - lvl;
    lim := greatest(1, lvl * 0.012);
    if abs(r) > lim then r := sign(r) * (lim + (abs(r) - lim) * 0.3); end if;
    n := n + 1;
    a := greatest(0.1, 2.0 / (n + 1));
    lvl := lvl + a * r;
    slope := greatest(-0.15, least(0.15, slope + 0.15 * a * r));
    since := 0;
    prev := w.day;
  end loop;
  if n = 0 then return null; end if;
  -- После последнего взвешивания до нужной даты
  d := prev + 1;
  while d <= until loop
    since := since + 1;
    if since <= 10 then lvl := lvl + slope; end if;
    d := d + 1;
  end loop;
  return round(lvl, 2);
end $$;
revoke execute on function public.weight_trend(uuid, date) from public, anon, authenticated;

create or replace function public.public_stats(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pr public.profiles;
  streak int := 0;
  d date := current_date;
  w_now numeric;
  w_then numeric;
begin
  select * into pr from public.profiles where id = uid;
  if pr.id is null or public.is_blocked(me, uid) then return jsonb_build_object('hidden', true); end if;
  if uid <> me and pr.is_private and not public.are_friends(me, uid) then
    return jsonb_build_object('hidden', true,
      'friends', (select count(*) from public.friendships where status = 'accepted' and uid in (requester, addressee)));
  end if;
  if not exists (select 1 from public.food_entries where user_id = uid and day = d) then d := d - 1; end if;
  while exists (select 1 from public.food_entries where user_id = uid and day = d) and streak < 3650 loop
    streak := streak + 1;
    d := d - 1;
  end loop;
  if pr.show_weight or uid = me then
    -- Как в приложении: разница трендов (не сырых весов), иначе у себя и в публичном профиле разные цифры
    w_now := public.weight_trend(uid, current_date);
    if exists (select 1 from public.weights where user_id = uid and day <= current_date - 30) then
      w_then := public.weight_trend(uid, current_date - 30);
    else
      select weight_kg into w_then from public.weights where user_id = uid and day <= current_date order by day asc limit 1;
    end if;
    -- Одно взвешивание — изменения ещё нет
    if (select count(*) from public.weights where user_id = uid and day <= current_date) < 2 then w_then := null; end if;
  end if;
  return jsonb_build_object(
    'hidden', false,
    'streak', streak,
    'logged_days', (select count(distinct day) from public.food_entries where user_id = uid),
    'friends', (select count(*) from public.friendships where status = 'accepted' and uid in (requester, addressee)),
    'posts', (select count(*) from public.posts where author_id = uid),
    'weight_change_30', case when w_now is not null and w_then is not null then round(w_now - w_then, 1) end
  );
end $$;

