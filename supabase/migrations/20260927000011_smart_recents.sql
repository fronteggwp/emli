-- Умные «частые продукты»: рейтинг по частоте с затуханием по давности (полураспад ~2 недели),
-- с учётом приёма пищи, и обычная порция (медиана граммов) вместо последней.

drop function if exists public.recent_foods(int);

create function public.recent_foods(lim int default 40, for_meal smallint default null)
returns table (
  food_id uuid, name text, brand text, grams numeric,
  kcal numeric, protein numeric, fat numeric, carbs numeric,
  last_used timestamptz, uses int, score numeric
)
language sql stable set search_path = public as $$
  with e as (
    select * from public.food_entries
    where user_id = auth.uid() and created_at > now() - interval '180 days'
  ),
  g as (
    select lower(name) as k,
      count(*)::int as uses,
      max(created_at) as last_used,
      sum(
        exp(-extract(epoch from (now() - created_at)) / 86400.0 / 20.0)
        * case when for_meal is not null and meal = for_meal then 2.5 else 1 end
      ) as score,
      percentile_disc(0.5) within group (order by grams) as usual
    from e group by lower(name)
  ),
  latest as (
    select distinct on (lower(name)) lower(name) as k, food_id, name, brand, grams, kcal, protein, fat, carbs
    from e order by lower(name), created_at desc
  )
  select l.food_id, l.name, l.brand,
    coalesce(g.usual, l.grams),
    case when l.grams > 0 and g.usual > 0 then round(l.kcal * g.usual / l.grams, 1) else l.kcal end,
    case when l.grams > 0 and g.usual > 0 then round(l.protein * g.usual / l.grams, 1) else l.protein end,
    case when l.grams > 0 and g.usual > 0 then round(l.fat * g.usual / l.grams, 1) else l.fat end,
    case when l.grams > 0 and g.usual > 0 then round(l.carbs * g.usual / l.grams, 1) else l.carbs end,
    g.last_used, g.uses, round(g.score::numeric, 4)
  from latest l join g using (k)
  order by g.score desc
  limit lim
$$;

revoke execute on function public.recent_foods(int, smallint) from public, anon;
grant execute on function public.recent_foods(int, smallint) to authenticated;
