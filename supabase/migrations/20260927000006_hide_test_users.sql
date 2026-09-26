-- Тестовые аккаунты разработки (отрицательный tg_id) не показываем настоящим пользователям в поиске
drop function public.search_people(text, int);
create function public.search_people(q text, lim int default 30)
returns table (id uuid, username text, first_name text, last_name text, avatar_url text, bio text, is_private boolean, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select pr.id, pr.username, pr.first_name, pr.last_name, pr.avatar_url, pr.bio, pr.is_private, pr.last_seen
  from public.profiles pr
  where pr.id <> auth.uid()
    and not public.is_blocked(auth.uid(), pr.id)
    and (pr.tg_id > 0 or (select me.tg_id from public.profiles me where me.id = auth.uid()) < 0)
    and (
      pr.username ilike replace(replace(lower(trim(both '@' from trim(q))), '%', ''), '_', '\_') || '%'
      or (pr.first_name || ' ' || coalesce(pr.last_name, '')) ilike '%' || replace(trim(q), '%', '') || '%'
    )
  order by (pr.username = lower(trim(both '@' from trim(q)))) desc, pr.last_seen desc nulls last
  limit least(lim, 50)
$$;
revoke execute on function public.search_people(text, int) from public, anon;
grant execute on function public.search_people(text, int) to authenticated;
