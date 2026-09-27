-- План питания: меню по дням (items — jsonb, считает клиент), общий список покупок с отметками в реальном времени
create table public.meal_plans (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  start_day   date not null,
  days        smallint not null check (days between 1 and 14),
  prefs       jsonb not null default '{}',
  items       jsonb not null default '[]',
  note        text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index meal_plans_owner on public.meal_plans (owner_id, created_at desc);

-- Кто ещё видит план и отмечает покупки (семья, партнёр)
create table public.meal_plan_members (
  plan_id     uuid not null references public.meal_plans(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  invited_by  uuid references public.profiles(id) on delete set null,
  status      text not null default 'invited' check (status in ('invited', 'joined')),
  created_at  timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index meal_plan_members_user on public.meal_plan_members (user_id);

-- Отметки в списке покупок: одна строка на продукт — двое могут отмечать одновременно без затирания
create table public.shop_marks (
  plan_id     uuid not null references public.meal_plans(id) on delete cascade,
  key         text not null,
  checked     boolean not null default false,
  have        boolean not null default false,
  -- Свой пункт, добавленный руками: {"name": "...", "qty": "..."}
  custom      jsonb,
  by_user     uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (plan_id, key)
);

create function public.can_view_plan(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.meal_plans where id = pid and owner_id = auth.uid())
      or exists (select 1 from public.meal_plan_members where plan_id = pid and user_id = auth.uid());
$$;
create function public.can_shop(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.meal_plans where id = pid and owner_id = auth.uid())
      or exists (select 1 from public.meal_plan_members where plan_id = pid and user_id = auth.uid() and status = 'joined');
$$;
revoke execute on function public.can_view_plan(uuid), public.can_shop(uuid) from public, anon;
grant execute on function public.can_view_plan(uuid), public.can_shop(uuid) to authenticated;

alter table public.meal_plans enable row level security;
create policy "plans read" on public.meal_plans for select to authenticated using (public.can_view_plan(id));
create policy "plans insert" on public.meal_plans for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "plans update" on public.meal_plans for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "plans delete" on public.meal_plans for delete to authenticated using (owner_id = (select auth.uid()));

alter table public.meal_plan_members enable row level security;
create policy "members read" on public.meal_plan_members for select to authenticated using (public.can_view_plan(plan_id));
-- Выйти может сам участник, убрать — владелец плана
create policy "members leave" on public.meal_plan_members for delete to authenticated using (
  user_id = (select auth.uid()) or exists (select 1 from public.meal_plans p where p.id = plan_id and p.owner_id = (select auth.uid()))
);

alter table public.shop_marks enable row level security;
create policy "marks read" on public.shop_marks for select to authenticated using (public.can_shop(plan_id));
create policy "marks insert" on public.shop_marks for insert to authenticated with check (public.can_shop(plan_id));
create policy "marks update" on public.shop_marks for update to authenticated using (public.can_shop(plan_id)) with check (public.can_shop(plan_id));
create policy "marks delete" on public.shop_marks for delete to authenticated using (public.can_shop(plan_id));

create trigger meal_plans_touch before update on public.meal_plans for each row execute function public.touch_updated_at();
create trigger shop_marks_touch before update on public.shop_marks for each row execute function public.touch_updated_at();

-- Уведомление-приглашение
alter table public.notifications add column plan_id uuid references public.meal_plans(id) on delete cascade;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('friend_request', 'friend_accept', 'like', 'comment', 'challenge', 'plan'));

-- Поделиться планом с друзьями (только взаимные друзья, только владелец)
create function public.share_meal_plan(pid uuid, users uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  u uuid;
  n int := 0;
begin
  if not exists (select 1 from public.meal_plans where id = pid and owner_id = me) then
    raise exception 'not_owner';
  end if;
  foreach u in array users loop
    if u <> me and public.are_friends(me, u) then
      insert into public.meal_plan_members (plan_id, user_id, invited_by) values (pid, u, me) on conflict do nothing;
      if found then
        insert into public.notifications (user_id, actor_id, kind, plan_id) values (u, me, 'plan', pid);
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;

create function public.respond_meal_plan(pid uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if accept then
    update public.meal_plan_members set status = 'joined' where plan_id = pid and user_id = auth.uid();
  else
    delete from public.meal_plan_members where plan_id = pid and user_id = auth.uid();
  end if;
  delete from public.notifications where user_id = auth.uid() and kind = 'plan' and plan_id = pid;
end $$;

revoke execute on function public.share_meal_plan(uuid, uuid[]), public.respond_meal_plan(uuid, boolean) from public, anon;
grant execute on function public.share_meal_plan(uuid, uuid[]), public.respond_meal_plan(uuid, boolean) to authenticated;

alter publication supabase_realtime add table public.meal_plans, public.shop_marks, public.meal_plan_members;
