-- Вес для людей — по взвешиваниям, а не по тренду: «вес, 30 д» совпадает с историей и с тем,
-- что человек видит у себя (приложение считает так же — scaleChange). Тренд остаётся только для расчётов.
drop function if exists public.weight_trend(uuid, date);

create or replace function public.public_stats(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pr public.profiles;
  streak int := 0;
  d date := current_date;
  w_now numeric;
  w_then numeric;
  d_now date;
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
    -- Как в приложении (scaleChange): по взвешиваниям — последнее минус взвешивание на начало 30 дней
    -- (последнее до этой даты, иначе первое после неё); одно взвешивание — изменения нет
    select weight_kg, day into w_now, d_now from public.weights where user_id = uid and day <= current_date order by day desc limit 1;
    select weight_kg into w_then from public.weights where user_id = uid and day <= current_date - 30 order by day desc limit 1;
    if w_then is null then
      select weight_kg into w_then from public.weights where user_id = uid and day > current_date - 30 and day < d_now order by day asc limit 1;
    end if;
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

