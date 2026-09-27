import { useEffect, useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUid } from "@/lib/auth";
import type { Comment, Conversation, Friendship, Message, Notice, Person, Post, PostAttachment, PublicStats } from "@/lib/types";

export const BOT_USERNAME = "myemli_bot";
const PERSON_COLS = "id,username,first_name,last_name,avatar_url,bio,is_private,last_seen";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const sk = {
  person: (id: string) => ["person", id] as const,
  stats: (id: string) => ["stats", id] as const,
  friendships: ["friendships"] as const,
  feed: (scope: string, author?: string) => ["feed", scope, author ?? ""] as const,
  post: (id: string) => ["post", id] as const,
  comments: (id: string) => ["comments", id] as const,
  notices: ["notices"] as const,
  convs: ["convs"] as const,
  messages: (cid: string) => ["messages", cid] as const,
  invite: ["invite"] as const,
  search: (q: string) => ["people-search", q] as const,
};

export const fullName = (p?: Pick<Person, "first_name" | "last_name"> | null) =>
  p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || "Без имени" : "…";

export const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
      );

// ───────────── Люди

/** Профили подгружаются пачкой и кэшируются по одному */
async function fetchPeople(qc: QueryClient, ids: string[]) {
  const missing = ids.filter((id) => !qc.getQueryData(sk.person(id)));
  if (!missing.length) return;
  const rows = unwrap<Person[]>(await supabase.from("profiles").select(PERSON_COLS).in("id", missing));
  for (const r of rows) qc.setQueryData(sk.person(r.id), r);
}

export function usePeople(ids: string[]) {
  const qc = useQueryClient();
  const key = [...new Set(ids)].sort().join(",");
  const q = useQuery({
    queryKey: ["people", key],
    enabled: !!key,
    queryFn: async () => {
      await fetchPeople(qc, key.split(","));
      return true;
    },
    staleTime: 60_000,
  });
  return useMemo(() => {
    const map = new Map<string, Person>();
    for (const id of key.split(",")) {
      const p = qc.getQueryData<Person>(sk.person(id));
      if (p) map.set(id, p);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, q.dataUpdatedAt, qc]);
}

export function usePerson(id: string | undefined) {
  return useQuery({
    queryKey: sk.person(id ?? ""),
    enabled: !!id,
    queryFn: async () => unwrap<Person>(await supabase.from("profiles").select(PERSON_COLS).eq("id", id!).single()),
    staleTime: 30_000,
  });
}

export function usePublicStats(id: string) {
  return useQuery({
    queryKey: sk.stats(id),
    queryFn: async () => unwrap<PublicStats>(await supabase.rpc("public_stats", { uid: id })),
  });
}

export function useSearchPeople(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: sk.search(term),
    enabled: term.replace(/^@/, "").length >= 2,
    queryFn: async () => unwrap<Person[]>(await supabase.rpc("search_people", { q: term, lim: 30 })),
    staleTime: 30_000,
  });
}

// ───────────── Друзья

export function useFriendships() {
  const uid = useUid();
  const q = useQuery({
    queryKey: sk.friendships,
    queryFn: async () => unwrap<Friendship[]>(await supabase.from("friendships").select("*")),
  });
  return useMemo(() => {
    const rows = q.data ?? [];
    const other = (f: Friendship) => (f.requester === uid ? f.addressee : f.requester);
    return {
      ...q,
      friends: rows.filter((f) => f.status === "accepted").map(other),
      incoming: rows.filter((f) => f.status === "pending" && f.addressee === uid).map((f) => f.requester),
      outgoing: rows.filter((f) => f.status === "pending" && f.requester === uid).map((f) => f.addressee),
      relation(id: string): "self" | "friends" | "incoming" | "outgoing" | "none" {
        if (id === uid) return "self";
        const f = rows.find((r) => other(r) === id);
        if (!f) return "none";
        if (f.status === "accepted") return "friends";
        return f.requester === uid ? "outgoing" : "incoming";
      },
    };
  }, [q, uid]);
}

export function useFriendActions() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: sk.friendships });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["feed"] });
    qc.invalidateQueries({ queryKey: ["friends-of"] });
    qc.invalidateQueries({ queryKey: ["suggestions"] });
  };
  return {
    request: useMutation({
      mutationFn: async (id: string) => unwrap<string>(await supabase.rpc("friend_request", { target: id })),
      onSuccess: done,
    }),
    respond: useMutation({
      mutationFn: async ({ id, accept }: { id: string; accept: boolean }) =>
        unwrap(await supabase.rpc("friend_respond", { other: id, accept })),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await supabase.rpc("friend_remove", { other: id })),
      onSuccess: done,
    }),
    block: useMutation({
      mutationFn: async (id: string) => unwrap(await supabase.rpc("block_user", { target: id })),
      onSuccess: () => {
        done();
        qc.invalidateQueries({ queryKey: sk.convs });
      },
    }),
  };
}

export function useInviteLink() {
  return useQuery({
    queryKey: sk.invite,
    queryFn: async () => {
      const code = unwrap<string>(await supabase.rpc("my_invite_code"));
      return `https://t.me/${BOT_USERNAME}?start=ref_${code}`;
    },
    staleTime: Infinity,
  });
}

export async function acceptInvite(code: string) {
  return unwrap<string | null>(await supabase.rpc("accept_invite", { invite: code }));
}

// ───────────── Лента

const PAGE = 15;

export function useFeed(scope: "all" | "friends" | "user", author?: string) {
  return useInfiniteQuery({
    queryKey: sk.feed(scope, author),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap<Post[]>(
        await supabase.rpc("feed", { scope: scope === "user" ? "all" : scope, author: author ?? null, before: pageParam, lim: PAGE }),
      ),
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].created_at : undefined),
  });
}

/** Обновить пост во всех закэшированных лентах сразу */
function patchPost(qc: QueryClient, id: string, fn: (p: Post) => Post | null) {
  qc.setQueriesData<InfiniteData<Post[]>>({ queryKey: ["feed"] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => page.flatMap((p) => (p.id === id ? (fn(p) ? [fn(p)!] : []) : [p]))),
        }
      : data,
  );
  qc.setQueryData<Post>(sk.post(id), (p) => (p ? (fn(p) ?? undefined) : p));
}

export function usePost(id: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: sk.post(id),
    queryFn: async () => {
      for (const [, data] of qc.getQueriesData<InfiniteData<Post[]>>({ queryKey: ["feed"] })) {
        const hit = data?.pages.flat().find((p) => p.id === id);
        if (hit) return hit;
      }
      const { data: row, error } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return null;
      const [{ data: author }, { data: like }] = await Promise.all([
        supabase.from("profiles").select(PERSON_COLS).eq("id", row.author_id).single(),
        supabase.from("post_likes").select("post_id").eq("post_id", id).maybeSingle(),
      ]);
      return { ...row, author, liked: !!like } as Post;
    },
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (p: Post) => {
      if (p.liked) unwrap(await supabase.from("post_likes").delete().eq("post_id", p.id).eq("user_id", uid));
      else unwrap(await supabase.from("post_likes").insert({ post_id: p.id }));
    },
    onMutate: (p) =>
      patchPost(qc, p.id, (x) => ({ ...x, liked: !p.liked, like_count: Math.max(0, x.like_count + (p.liked ? -1 : 1)) })),
    onError: (_e, p) => patchPost(qc, p.id, (x) => ({ ...x, liked: p.liked, like_count: p.like_count })),
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { text: string | null; image_url: string | null; attachment: PostAttachment | null; visibility: "public" | "friends" }) =>
      unwrap(await supabase.from("posts").insert(p).select().single()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from("posts").delete().eq("id", id)),
    onMutate: (id) => patchPost(qc, id, () => null),
    onSettled: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });
}

export async function report(target: { post_id?: string; comment_id?: string; user_id?: string }, reason: string) {
  unwrap(await supabase.from("reports").insert({ ...target, reason }));
}

// ───────────── Комментарии

export function useComments(postId: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: sk.comments(postId),
    queryFn: async () => {
      const rows = unwrap<Comment[]>(await supabase.from("comments").select("*").eq("post_id", postId).order("created_at"));
      await fetchPeople(qc, [...new Set(rows.map((c) => c.author_id))]);
      return rows.map((c) => ({ ...c, author: qc.getQueryData<Person>(sk.person(c.author_id)) }));
    },
  });
}

export function useAddComment(postId: string) {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (text: string) => unwrap(await supabase.from("comments").insert({ post_id: postId, text }).select().single()),
    onMutate: (text) => {
      const me = qc.getQueryData<Person>(sk.person(uid));
      qc.setQueryData<Comment[]>(sk.comments(postId), (old) => [
        ...(old ?? []),
        { id: `temp-${Date.now()}`, post_id: postId, author_id: uid, text, created_at: new Date().toISOString(), author: me },
      ]);
      patchPost(qc, postId, (p) => ({ ...p, comment_count: p.comment_count + 1 }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: sk.comments(postId) }),
  });
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from("comments").delete().eq("id", id)),
    onMutate: (id) => {
      qc.setQueryData<Comment[]>(sk.comments(postId), (old) => old?.filter((c) => c.id !== id));
      patchPost(qc, postId, (p) => ({ ...p, comment_count: Math.max(0, p.comment_count - 1) }));
    },
  });
}

// ───────────── Уведомления

export function useNotices() {
  return useQuery({
    queryKey: sk.notices,
    queryFn: async () =>
      unwrap<Notice[]>(await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(60)),
  });
}

export async function markNoticesRead() {
  await supabase.rpc("mark_notifications_read");
}

// ───────────── Чаты

export function useConversations() {
  return useQuery({
    queryKey: sk.convs,
    queryFn: async () => unwrap<Conversation[]>(await supabase.rpc("my_conversations")),
  });
}

export async function openConversation(other: string) {
  return unwrap<string>(await supabase.rpc("open_conversation", { other }));
}

export async function markRead(cid: string) {
  await supabase.rpc("mark_read", { cid });
}

const MSG_PAGE = 40;

export function useMessages(cid: string) {
  return useInfiniteQuery({
    queryKey: sk.messages(cid),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase.from("messages").select("*").eq("conversation_id", cid).order("created_at", { ascending: false }).limit(MSG_PAGE);
      if (pageParam) q = q.lt("created_at", pageParam);
      return unwrap<Message[]>(await q);
    },
    getNextPageParam: (last) => (last.length === MSG_PAGE ? last[last.length - 1].created_at : undefined),
  });
}

/** Новое сообщение — в начало первой страницы (страницы идут от новых к старым) */
export function insertMessage(qc: QueryClient, m: Message) {
  qc.setQueryData<InfiniteData<Message[]>>(sk.messages(m.conversation_id), (data) => {
    if (!data) return data;
    if (data.pages.some((p) => p.some((x) => x.id === m.id))) {
      return { ...data, pages: data.pages.map((p) => p.map((x) => (x.id === m.id ? m : x))) };
    }
    return { ...data, pages: [[m, ...(data.pages[0] ?? [])], ...data.pages.slice(1)] };
  });
}

export function useSendMessage(cid: string) {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (m: { id: string; text: string | null; image_url?: string | null }) =>
      unwrap<Message>(await supabase.from("messages").insert({ conversation_id: cid, ...m }).select().single()),
    onMutate: (m) => {
      insertMessage(qc, {
        id: m.id,
        conversation_id: cid,
        sender_id: uid,
        text: m.text,
        image_url: m.image_url ?? null,
        created_at: new Date().toISOString(),
      });
    },
    onSuccess: (saved) => {
      insertMessage(qc, saved);
      qc.invalidateQueries({ queryKey: sk.convs });
    },
    onError: (_e, m) =>
      qc.setQueryData<InfiniteData<Message[]>>(sk.messages(cid), (data) =>
        data ? { ...data, pages: data.pages.map((p) => p.filter((x) => x.id !== m.id)) } : data,
      ),
  });
}

// ───────────── Реалтайм: чаты и уведомления обновляются сами

export function useRealtime() {
  const qc = useQueryClient();
  const uid = useUid();
  useEffect(() => {
    const ch = supabase
      .channel(`inbox:${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: sk.convs });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        insertMessage(qc, payload.new as Message);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: sk.notices });
        qc.invalidateQueries({ queryKey: sk.friendships });
        qc.invalidateQueries({ queryKey: ["challenges"] });
      })
      .subscribe();

    // «В сети»: отмечаемся, пока приложение открыто
    const ping = () => document.visibilityState === "visible" && supabase.rpc("touch_seen").then(() => {});
    ping();
    const t = setInterval(ping, 30_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [qc, uid]);
}

export function useUnreadCounts() {
  const convs = useConversations();
  const notices = useNotices();
  const messages = (convs.data ?? []).reduce((s, c) => s + (c.unread > 0 ? 1 : 0), 0);
  const unreadNotices = (notices.data ?? []).filter((n) => !n.read_at).length;
  return { messages, notices: unreadNotices, total: messages + unreadNotices };
}

// ───────────── Фото

/** Сжимаем фото на телефоне до ~1600px — быстрее грузится и не забивает хранилище */
export async function compressImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadImage(uid: string, file: File) {
  const blob = await compressImage(file);
  const path = `${uid}/${uuid()}.jpg`;
  unwrap(await supabase.storage.from("media").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" }));
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

// ───────────── Друзья друзей

export type PersonWithMutual = Person & { mutual?: boolean; mutual_count?: number };

export function useFriendsOf(id: string) {
  return useQuery({
    queryKey: ["friends-of", id],
    queryFn: async () => unwrap<PersonWithMutual[]>(await supabase.rpc("friends_of", { uid: id })),
  });
}

export function useSuggestions() {
  return useQuery({
    queryKey: ["suggestions"],
    queryFn: async () => unwrap<PersonWithMutual[]>(await supabase.rpc("suggested_friends", { lim: 20 })),
    staleTime: 60_000,
  });
}
