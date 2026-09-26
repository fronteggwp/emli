-- Соцчасть: публичные профили, друзья, блокировки, лента, лайки, комментарии, уведомления, чаты.

-- ───────────── Профили: видны всем, менять можно только часть полей
drop policy "own profile read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);

alter table public.profiles
  add column last_seen timestamptz,
  add column show_weight boolean not null default false,
  add constraint username_format check (username is null or username ~ '^[a-z0-9_]{3,32}$'),
  add constraint bio_len check (bio is null or length(bio) <= 200),
  add constraint name_len check (length(first_name) between 0 and 64);

revoke update on public.profiles from authenticated, anon;
grant update (username, first_name, last_name, avatar_url, bio, is_private, show_weight) on public.profiles to authenticated;
-- Telegram id другим пользователям не показываем
revoke select on public.profiles from authenticated, anon;
grant select (id, username, first_name, last_name, avatar_url, bio, is_private, show_weight, last_seen, created_at, updated_at)
  on public.profiles to authenticated;

create function public.touch_seen() returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_seen = now() where id = auth.uid();
$$;

-- ───────────── Блокировки
create table public.blocks (
  blocker     uuid not null references public.profiles(id) on delete cascade,
  blocked     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
create policy "own blocks" on public.blocks for all to authenticated
  using (blocker = (select auth.uid())) with check (blocker = (select auth.uid()));

create function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

-- ───────────── Друзья (изменения — только через функции)
create table public.friendships (
  requester    uuid not null references public.profiles(id) on delete cascade,
  addressee    uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index friendships_addressee on public.friendships (addressee, status);
alter table public.friendships enable row level security;
create policy "see own friendships" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));

create function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted' and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

create function public.friend_request(target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  st text;
begin
  if me is null or target is null or target = me then raise exception 'invalid'; end if;
  if public.is_blocked(me, target) then raise exception 'blocked'; end if;
  -- Встречная заявка — сразу дружба
  update public.friendships set status = 'accepted', accepted_at = now()
    where requester = target and addressee = me and status = 'pending';
  if found then return 'accepted'; end if;
  select status into st from public.friendships
    where (requester = me and addressee = target) or (requester = target and addressee = me);
  if st is not null then return st; end if;
  insert into public.friendships (requester, addressee) values (me, target);
  return 'pending';
end $$;

create function public.friend_respond(other uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if accept then
    update public.friendships set status = 'accepted', accepted_at = now()
      where requester = other and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships where requester = other and addressee = auth.uid() and status = 'pending';
  end if;
end $$;

create function public.friend_remove(other uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.friendships
  where (requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid());
$$;

create function public.block_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if target = auth.uid() then raise exception 'invalid'; end if;
  insert into public.blocks (blocker, blocked) values (auth.uid(), target) on conflict do nothing;
  delete from public.friendships
    where (requester = auth.uid() and addressee = target) or (requester = target and addressee = auth.uid());
end $$;

-- ───────────── Приглашения по ссылке: код знает только владелец
create table public.invite_codes (
  user_id  uuid primary key references public.profiles(id) on delete cascade,
  code     text unique not null default encode(extensions.gen_random_bytes(6), 'hex')
);
alter table public.invite_codes enable row level security;
create policy "own invite code" on public.invite_codes for select to authenticated using (user_id = (select auth.uid()));

create function public.my_invite_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  insert into public.invite_codes (user_id) values (auth.uid()) on conflict do nothing;
  select code into c from public.invite_codes where user_id = auth.uid();
  return c;
end $$;

-- Перешёл по ссылке друга — становитесь друзьями сразу
create function public.accept_invite(invite text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inviter uuid;
begin
  select user_id into inviter from public.invite_codes where code = invite;
  if inviter is null or inviter = me then return inviter; end if;
  if public.is_blocked(me, inviter) then return null; end if;
  update public.friendships set status = 'accepted', accepted_at = coalesce(accepted_at, now())
    where (requester = inviter and addressee = me) or (requester = me and addressee = inviter);
  if not found then
    insert into public.friendships (requester, addressee, status, accepted_at) values (inviter, me, 'accepted', now());
  end if;
  return inviter;
end $$;

-- ───────────── Лента
create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  text           text check (length(text) <= 2000),
  image_url      text,
  attachment     jsonb,
  visibility     text not null default 'public' check (visibility in ('public', 'friends')),
  like_count     int not null default 0,
  comment_count  int not null default 0,
  created_at     timestamptz not null default now(),
  check (coalesce(length(trim(text)), 0) > 0 or image_url is not null or attachment is not null)
);
create index posts_created on public.posts (created_at desc);
create index posts_author on public.posts (author_id, created_at desc);
alter table public.posts enable row level security;

create policy "posts read" on public.posts for select to authenticated using (
  author_id = (select auth.uid())
  or (
    not public.is_blocked((select auth.uid()), author_id)
    and (
      public.are_friends((select auth.uid()), author_id)
      or (visibility = 'public' and not exists (select 1 from public.profiles pr where pr.id = author_id and pr.is_private))
    )
  )
);
create policy "posts insert" on public.posts for insert to authenticated with check (author_id = (select auth.uid()));
create policy "posts update" on public.posts for update to authenticated using (author_id = (select auth.uid()));
create policy "posts delete" on public.posts for delete to authenticated using (author_id = (select auth.uid()));
revoke update on public.posts from authenticated, anon;
grant update (text, visibility) on public.posts to authenticated;

create table public.post_likes (
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;
create policy "likes read" on public.post_likes for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy "likes insert" on public.post_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy "likes delete" on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  text        text not null check (length(trim(text)) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index comments_post on public.comments (post_id, created_at);
alter table public.comments enable row level security;
create policy "comments read" on public.comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id) and not public.is_blocked((select auth.uid()), author_id));
create policy "comments insert" on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy "comments delete" on public.comments for delete to authenticated using (
  author_id = (select auth.uid())
  or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
);

-- Счётчики лайков и комментариев
create function public.bump_counts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'post_likes' then
    update public.posts set like_count = greatest(like_count + case when tg_op = 'INSERT' then 1 else -1 end, 0)
      where id = coalesce(new.post_id, old.post_id);
  else
    update public.posts set comment_count = greatest(comment_count + case when tg_op = 'INSERT' then 1 else -1 end, 0)
      where id = coalesce(new.post_id, old.post_id);
  end if;
  return null;
end $$;
create trigger likes_count after insert or delete on public.post_likes for each row execute function public.bump_counts();
create trigger comments_count after insert or delete on public.comments for each row execute function public.bump_counts();

create table public.reports (
  id          bigint generated always as identity primary key,
  reporter    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  post_id     uuid references public.posts(id) on delete cascade,
  comment_id  uuid references public.comments(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,
  reason      text check (length(reason) <= 500),
  created_at  timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy "reports insert" on public.reports for insert to authenticated with check (reporter = (select auth.uid()));

-- Лента: посты с автором и отметкой «я лайкнул»
create function public.feed(scope text default 'all', author uuid default null, before timestamptz default null, lim int default 20)
returns table (
  id uuid, author_id uuid, text text, image_url text, attachment jsonb, visibility text,
  like_count int, comment_count int, created_at timestamptz, liked boolean, author jsonb
)
language sql stable set search_path = public as $$
  select p.id, p.author_id, p.text, p.image_url, p.attachment, p.visibility, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    jsonb_build_object('id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name,
                       'username', pr.username, 'avatar_url', pr.avatar_url)
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where (before is null or p.created_at < before)
    and (author is null or p.author_id = author)
    and (scope <> 'friends' or p.author_id = auth.uid() or public.are_friends(auth.uid(), p.author_id))
  order by p.created_at desc
  limit least(lim, 50)
$$;

-- ───────────── Уведомления в приложении
create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  actor_id    uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('friend_request', 'friend_accept', 'like', 'comment')),
  post_id     uuid references public.posts(id) on delete cascade,
  preview     text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "own notifications delete" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create function public.mark_notifications_read() returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

create function public.make_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if tg_table_name = 'friendships' then
    if tg_op = 'INSERT' and new.status = 'pending' then
      insert into public.notifications (user_id, actor_id, kind) values (new.addressee, new.requester, 'friend_request');
    elsif tg_op = 'INSERT' and new.status = 'accepted' then
      -- дружба по ссылке-приглашению: сообщаем пригласившему
      insert into public.notifications (user_id, actor_id, kind) values (new.requester, new.addressee, 'friend_accept');
    elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
      insert into public.notifications (user_id, actor_id, kind) values (new.requester, new.addressee, 'friend_accept');
      delete from public.notifications where user_id = new.addressee and actor_id = new.requester and kind = 'friend_request';
    end if;
  elsif tg_table_name = 'post_likes' then
    select author_id into owner from public.posts where id = new.post_id;
    if owner is not null and owner <> new.user_id and not exists (
      select 1 from public.notifications
      where user_id = owner and actor_id = new.user_id and kind = 'like' and post_id = new.post_id
    ) then
      insert into public.notifications (user_id, actor_id, kind, post_id) values (owner, new.user_id, 'like', new.post_id);
    end if;
  elsif tg_table_name = 'comments' then
    select author_id into owner from public.posts where id = new.post_id;
    if owner is not null and owner <> new.author_id then
      insert into public.notifications (user_id, actor_id, kind, post_id, preview)
        values (owner, new.author_id, 'comment', new.post_id, left(new.text, 140));
    end if;
  end if;
  return null;
end $$;
create trigger friendships_notify after insert or update on public.friendships for each row execute function public.make_notification();
create trigger likes_notify after insert on public.post_likes for each row execute function public.make_notification();
create trigger comments_notify after insert on public.comments for each row execute function public.make_notification();

-- ───────────── Чаты
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user_a           uuid not null references public.profiles(id) on delete cascade,
  user_b           uuid not null references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz,
  last_message     text,
  last_sender      uuid,
  a_read_at        timestamptz,
  b_read_at        timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);
alter table public.conversations enable row level security;
create policy "own conversations" on public.conversations for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  text             text check (length(text) between 1 and 4000),
  image_url        text,
  created_at       timestamptz not null default now(),
  check (text is not null or image_url is not null)
);
create index messages_conv on public.messages (conversation_id, created_at desc);
alter table public.messages enable row level security;

create function public.can_message(me uuid, other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not public.is_blocked(me, other)
    and (public.are_friends(me, other) or not coalesce((select is_private from public.profiles where id = other), true));
$$;

create policy "messages read" on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));
create policy "messages insert" on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (select auth.uid()) in (c.user_a, c.user_b)
      and public.can_message((select auth.uid()), case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end)
  )
);
create policy "messages delete" on public.messages for delete to authenticated using (sender_id = (select auth.uid()));

create function public.open_conversation(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cid uuid;
begin
  if me is null or other = me then raise exception 'invalid'; end if;
  select id into cid from public.conversations where user_a = least(me, other) and user_b = greatest(me, other);
  if cid is not null then return cid; end if;
  if not public.can_message(me, other) then raise exception 'not_allowed'; end if;
  insert into public.conversations (user_a, user_b) values (least(me, other), greatest(me, other))
    on conflict (user_a, user_b) do nothing;
  select id into cid from public.conversations where user_a = least(me, other) and user_b = greatest(me, other);
  return cid;
end $$;

create function public.on_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set
    last_message_at = new.created_at,
    last_message = coalesce(left(new.text, 140), '📷 Фото'),
    last_sender = new.sender_id,
    a_read_at = case when user_a = new.sender_id then new.created_at else a_read_at end,
    b_read_at = case when user_b = new.sender_id then new.created_at else b_read_at end
  where id = new.conversation_id;
  return null;
end $$;
create trigger messages_after after insert on public.messages for each row execute function public.on_message();

create function public.mark_read(cid uuid) returns void
language sql security definer set search_path = public as $$
  update public.conversations set
    a_read_at = case when user_a = auth.uid() then now() else a_read_at end,
    b_read_at = case when user_b = auth.uid() then now() else b_read_at end
  where id = cid and auth.uid() in (user_a, user_b);
$$;

create function public.my_conversations()
returns table (id uuid, other_id uuid, last_message text, last_message_at timestamptz, last_sender uuid, other_read_at timestamptz, unread int)
language sql stable set search_path = public as $$
  select c.id,
    case when c.user_a = auth.uid() then c.user_b else c.user_a end,
    c.last_message, c.last_message_at, c.last_sender,
    case when c.user_a = auth.uid() then c.b_read_at else c.a_read_at end,
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.sender_id <> auth.uid()
        and m.created_at > coalesce(case when c.user_a = auth.uid() then c.a_read_at else c.b_read_at end, 'epoch'))::int
  from public.conversations c
  where auth.uid() in (c.user_a, c.user_b) and c.last_message_at is not null
  order by c.last_message_at desc
$$;

-- ───────────── Поиск людей и публичная статистика
create function public.search_people(q text, lim int default 30)
returns table (id uuid, username text, first_name text, last_name text, avatar_url text, bio text, is_private boolean, last_seen timestamptz)
language sql stable set search_path = public as $$
  select pr.id, pr.username, pr.first_name, pr.last_name, pr.avatar_url, pr.bio, pr.is_private, pr.last_seen
  from public.profiles pr
  where pr.id <> auth.uid()
    and not public.is_blocked(auth.uid(), pr.id)
    and (
      pr.username ilike replace(replace(lower(trim(both '@' from trim(q))), '%', ''), '_', '\_') || '%'
      or (pr.first_name || ' ' || coalesce(pr.last_name, '')) ilike '%' || replace(trim(q), '%', '') || '%'
    )
  order by (pr.username = lower(trim(both '@' from trim(q)))) desc, pr.last_seen desc nulls last
  limit least(lim, 50)
$$;

create function public.public_stats(uid uuid) returns jsonb
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
    select weight_kg into w_now from public.weights where user_id = uid order by day desc limit 1;
    select weight_kg into w_then from public.weights where user_id = uid and day >= current_date - 30 order by day asc limit 1;
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

-- ───────────── Хранилище фото
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "media upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────────── Реалтайм для чатов и уведомлений
alter publication supabase_realtime add table public.messages, public.conversations, public.notifications;

-- ───────────── Пуш-уведомления через бота (секрет лежит в Vault, не в миграции)
create extension if not exists pg_net with schema extensions;

create function public.push_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret';
  if secret is null then return null; end if;
  perform net.http_post(
    url := 'https://ezhgiczvwsufzhwwwrkr.supabase.co/functions/v1/notify',
    body := jsonb_build_object('table', tg_table_name, 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret)
  );
  return null;
end $$;
create trigger notifications_push after insert on public.notifications for each row execute function public.push_notify();
create trigger messages_push after insert on public.messages for each row execute function public.push_notify();

-- ───────────── Права на функции: только для вошедших пользователей
do $$
declare f text;
begin
  foreach f in array array[
    'touch_seen()', 'is_blocked(uuid,uuid)', 'are_friends(uuid,uuid)', 'friend_request(uuid)', 'friend_respond(uuid,boolean)',
    'friend_remove(uuid)', 'block_user(uuid)', 'my_invite_code()', 'accept_invite(text)',
    'feed(text,uuid,timestamptz,int)', 'mark_notifications_read()', 'can_message(uuid,uuid)', 'open_conversation(uuid)',
    'mark_read(uuid)', 'my_conversations()', 'search_people(text,int)', 'public_stats(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
