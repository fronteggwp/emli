-- Поиск по общей базе штрихкодов (товары из открытых баз, с этикеток и от пользователей) — для поиска по названию
create function public.search_barcode_products(q text, lim int default 25)
returns setof public.barcode_products
language sql stable
set search_path = public, extensions
as $$
  with needle as (select lower(trim(q)) as n)
  select b.* from public.barcode_products b, needle
  where b.kcal is not null and b.source <> 'estimate' and b.name is not null
    and (lower(b.name) like '%' || needle.n || '%'
         or lower(coalesce(b.brand, '')) like '%' || needle.n || '%'
         or word_similarity(needle.n, lower(b.name)) > 0.5)
  order by
    (lower(b.name) like needle.n || '%') desc,
    word_similarity(needle.n, lower(b.name)) desc,
    b.trust desc,
    length(b.name)
  limit least(lim, 50)
$$;
revoke execute on function public.search_barcode_products(text, int) from public, anon;
grant execute on function public.search_barcode_products(text, int) to authenticated, service_role;
