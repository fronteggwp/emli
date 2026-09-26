-- Друзья друзей: список друзей человека и подсказки «возможно, вы знакомы».

-- Друзья пользователя uid (закрытый профиль показывает список только своим друзьям)
create function public.friends_of(uid uuid)
returns table (id uuid, username text, first_name text, last_name text, avatar_url text, bio text, is_private boolean, last_seen timestamptz, mutual boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  priv boolean;
begin
  select pr.is_private into priv from public.profiles pr where pr.id = uid;
  if uid <> me and (public.is_blocked(me, uid) or (coalesce(priv, true) and not public.are_friends(me, uid))) then
    return;
  end if;
  return query
  select p.id, p.username, p.first_name, p.last_name, p.avatar_url, p.bio, p.is_private, p.last_seen,
         public.are_friends(me, p.id)
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = uid then f.addressee else f.requester end
  where f.status = 'accepted' and uid in (f.requester, f.addressee) and not public.is_blocked(me, p.id)
  order by (p.id = me) desc, public.are_friends(me, p.id) desc, p.last_seen desc nulls last;
end $$;

-- Подсказки: друзья моих друзей, с которыми у меня ещё нет связи; чем больше общих — тем выше
create function public.suggested_friends(lim int default 20)
returns table (id uuid, username text, first_name text, last_name text, avatar_url text, bio text, is_private boolean, last_seen timestamptz, mutual_count int)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  mine as (
    select case when f.requester = me.id then f.addressee else f.requester end as fid
    from public.friendships f, me
    where f.status = 'accepted' and me.id in (f.requester, f.addressee)
  ),
  fof as (
    select case when f.requester = m.fid then f.addressee else f.requester end as cand, m.fid as via
    from public.friendships f
    join mine m on m.fid in (f.requester, f.addressee)
    where f.status = 'accepted'
  )
  select p.id, p.username, p.first_name, p.last_name, p.avatar_url, p.bio, p.is_private, p.last_seen,
         count(distinct fof.via)::int
  from fof
  join public.profiles p on p.id = fof.cand, me
  where fof.cand <> me.id
    and fof.cand not in (select fid from mine)
    and not exists (
      select 1 from public.friendships x
      where (x.requester = me.id and x.addressee = fof.cand) or (x.requester = fof.cand and x.addressee = me.id)
    )
    and not public.is_blocked(me.id, fof.cand)
  group by p.id, p.username, p.first_name, p.last_name, p.avatar_url, p.bio, p.is_private, p.last_seen
  order by count(distinct fof.via) desc, p.last_seen desc nulls last
  limit least(lim, 50)
$$;

revoke execute on function public.friends_of(uuid) from public, anon;
revoke execute on function public.suggested_friends(int) from public, anon;
grant execute on function public.friends_of(uuid) to authenticated;
grant execute on function public.suggested_friends(int) to authenticated;
