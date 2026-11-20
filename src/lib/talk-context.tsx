import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { playTone } from "./sound";
import { lockSuppressed } from "./lock-guard";
import { consumeUnlocked, sendOffline } from "./pin-cache";
import { summariesKey } from "./chat-summaries";

export type Profile = Tables<"profiles">;
export type Message = Tables<"messages">;
export type Signal = { type: string; from: string; [k: string]: unknown };

type TalkCtx = {
  userId: string;
  me: Profile | null;
  isMaster: boolean;
  contacts: Profile[];
  contactsLoading: boolean;
  profileById: (id: string) => Profile | undefined;
  online: Set<string>;
  typingFrom: Set<string>;
  sendTyping: (to: string) => void;
  sendSignal: (to: string, type: string, data?: Record<string, unknown>) => Promise<void>;
  subscribeSignals: (fn: (s: Signal) => void) => () => void;
  activeChat: string | null;
  setActiveChat: (id: string | null) => void;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
};

/** Seen as online while the app is open (even locked or in a background tab). */
const STALE_MS = 5 * 60_000;
const HEARTBEAT_MS = 25_000;

const Ctx = createContext<TalkCtx | null>(null);

export function useTalk() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTalk must be used inside TalkProvider");
  return v;
}

export const messagesKey = (otherId: string) => ["messages", otherId] as const;

/** Messages hidden with "Delete for Me" never come back for that person. */
export const visibleTo = (me: string, m: Message) =>
  m.sender_id === me ? !m.deleted_by_sender : !m.deleted_by_recipient;

export async function fetchConversation(me: string, other: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(
      `and(sender_id.eq.${me},recipient_id.eq.${other},deleted_by_sender.eq.false),and(sender_id.eq.${other},recipient_id.eq.${me},deleted_by_recipient.eq.false)`,
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).reverse();
}

export async function fetchMe(userId: string) {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
}

export async function fetchContacts(userId: string) {
  const { data } = await supabase.from("profiles").select("*").neq("id", userId).order("display_name");
  return data ?? [];
}

export function TalkProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const qc = useQueryClient();
  const [presence, setPresence] = useState<Record<string, { online: boolean; last_seen: string }>>({});
  const [presenceTick, setPresenceTick] = useState(0);
  const [locked, setLocked] = useState(() => !consumeUnlocked());
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const listeners = useRef(new Set<(s: Signal) => void>());
  const outbound = useRef(new Map<string, RealtimeChannel>());
  const lastTypingSent = useRef<Record<string, number>>({});

  const meQ = useQuery({
    queryKey: ["me", userId],
    queryFn: () => fetchMe(userId),
    staleTime: 30_000,
  });
  const masterQ = useQuery({
    queryKey: ["isMaster", userId],
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      return !!data;
    },
    staleTime: Infinity,
  });
  const contactsQ = useQuery({
    queryKey: ["contacts", userId],
    queryFn: () => fetchContacts(userId),
    staleTime: 30_000,
  });

  const toneRef = useRef(1);
  toneRef.current = meQ.data?.notification_tone ?? 1;

  // Locking only covers the screen with the PIN pad: the person stays signed in and online.
  const lock = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setLocked(true);
  }, []);
  const unlock = useCallback(() => setLocked(false), []);

  // Lock the moment the app is hidden (tab switch, minimise, screen off).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && !lockSuppressed()) lock();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [lock]);

  // Online status: a heartbeat while the page exists; offline only when the tab is closed.
  useEffect(() => {
    let token: string | null = null;
    void supabase.auth.getSession().then(({ data }) => {
      token = data.session?.access_token ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user.id === userId) token = session.access_token;
    });
    const beat = () => void supabase.rpc("heartbeat");
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    const onPageHide = () => sendOffline(token);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      clearInterval(t);
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [userId]);

  // Live messages: new, sent from another device, and deletions.
  useEffect(() => {
    // Bursts of changes refresh the chat list (last message + unread counts) once.
    let refreshT: ReturnType<typeof setTimeout> | null = null;
    const refreshList = () => {
      if (refreshT) clearTimeout(refreshT);
      refreshT = setTimeout(() => void qc.invalidateQueries({ queryKey: summariesKey(userId) }), 120);
    };
    const addMsg = (m: Message, incoming: boolean) => {
      const other = m.sender_id === userId ? m.recipient_id : m.sender_id;
      qc.setQueryData<Message[]>(messagesKey(other), (old) =>
        old ? (old.some((x) => x.id === m.id) ? old : [...old, m]) : old,
      );
      refreshList();
      if (incoming) {
        playTone(toneRef.current);
        setTyping((t) => {
          if (!t[m.sender_id]) return t;
          const n = { ...t };
          delete n[m.sender_id];
          return n;
        });
      }
    };
    const updMsg = (m: Message) => {
      const other = m.sender_id === userId ? m.recipient_id : m.sender_id;
      qc.setQueryData<Message[]>(messagesKey(other), (old) =>
        old?.flatMap((x) => (x.id === m.id ? (visibleTo(userId, m) ? [m] : []) : [x])),
      );
      refreshList();
    };
    const ch = supabase
      .channel(`talk-msgs-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${userId}` },
        (p) => addMsg(p.new as Message, true),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `sender_id=eq.${userId}` },
        (p) => addMsg(p.new as Message, false),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `sender_id=eq.${userId}` },
        (p) => updMsg(p.new as Message),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `recipient_id=eq.${userId}` },
        (p) => updMsg(p.new as Message),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (!id) return;
        qc.setQueriesData<Message[]>({ queryKey: ["messages"] }, (old) => old?.filter((m) => m.id !== id));
        refreshList();
      })
      .subscribe();
    return () => {
      if (refreshT) clearTimeout(refreshT);
      void supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  // Presence rows + live updates; profile edits by others show up live too.
  useEffect(() => {
    let alive = true;
    void supabase
      .from("presence")
      .select("user_id, online, last_seen")
      .then(({ data }) => {
        if (!alive || !data) return;
        setPresence(Object.fromEntries(data.map((r) => [r.user_id, { online: r.online, last_seen: r.last_seen }])));
      });
    const ch = supabase
      .channel(`talk-presence-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" }, (p) => {
        const r = (p.new ?? {}) as { user_id?: string; online?: boolean; last_seen?: string };
        if (!r.user_id) return;
        setPresence((cur) => ({ ...cur, [r.user_id!]: { online: !!r.online, last_seen: r.last_seen ?? new Date().toISOString() } }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (p) => {
        const id = (p.new as { id?: string }).id;
        void qc.invalidateQueries({ queryKey: ["contacts", userId] });
        if (id === userId) void qc.invalidateQueries({ queryKey: ["me", userId] });
      })
      .subscribe();
    const t = setInterval(() => setPresenceTick((n) => n + 1), 30_000);
    return () => {
      alive = false;
      clearInterval(t);
      void supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  // Same people online → same Set object, so screens don't re-render for nothing.
  const onlineRef = useRef<Set<string>>(new Set());
  const online = useMemo(() => {
    const now = Date.now();
    const set = new Set<string>([userId]);
    for (const [id, r] of Object.entries(presence)) {
      if (r.online && now - new Date(r.last_seen).getTime() < STALE_MS) set.add(id);
    }
    const prev = onlineRef.current;
    if (prev.size === set.size && [...set].every((id) => prev.has(id))) return prev;
    onlineRef.current = set;
    return set;
    // presenceTick re-evaluates staleness over time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presence, presenceTick, userId]);

  // Personal inbox for typing and call signals.
  useEffect(() => {
    const ch = supabase
      .channel(`talk-inbox-${userId}`)
      .on("broadcast", { event: "sig" }, ({ payload }) => {
        const s = payload as Signal;
        if (!s?.from || s.from === userId) return;
        if (s.type === "typing") {
          setTyping((t) => ({ ...t, [s.from]: Date.now() + 3500 }));
          return;
        }
        if (s.type === "typing-stop") {
          setTyping((t) => {
            const n = { ...t };
            delete n[s.from];
            return n;
          });
          return;
        }
        listeners.current.forEach((fn) => fn(s));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId]);

  useEffect(() => {
    const t = setInterval(() => {
      setTyping((cur) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(cur)) if (v > now) next[k] = v;
        if (Object.keys(next).length === Object.keys(cur).length) return cur;
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const sendSignal = useCallback(
    async (to: string, type: string, data: Record<string, unknown> = {}) => {
      let ch = outbound.current.get(to);
      if (!ch) {
        ch = supabase.channel(`talk-inbox-${to}`);
        outbound.current.set(to, ch);
      }
      await ch.httpSend("sig", { type, from: userId, ...data }).catch(() => undefined);
    },
    [userId],
  );

  const sendTyping = useCallback(
    (to: string) => {
      const now = Date.now();
      if ((lastTypingSent.current[to] ?? 0) > now - 2500) return;
      lastTypingSent.current[to] = now;
      void sendSignal(to, "typing");
    },
    [sendSignal],
  );

  const subscribeSignals = useCallback((fn: (s: Signal) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const contacts = useMemo(() => contactsQ.data ?? [], [contactsQ.data]);
  const typingFrom = useMemo(() => new Set(Object.keys(typing)), [typing]);
  const value = useMemo<TalkCtx>(
    () => ({
      userId,
      me: meQ.data ?? null,
      isMaster: masterQ.data ?? false,
      contacts,
      contactsLoading: contactsQ.isLoading,
      profileById: (id) => contacts.find((c) => c.id === id) ?? (meQ.data?.id === id ? meQ.data : undefined),
      online,
      typingFrom,
      sendTyping,
      sendSignal,
      subscribeSignals,
      activeChat,
      setActiveChat,
      locked,
      lock,
      unlock,
    }),
    [userId, meQ.data, masterQ.data, contacts, contactsQ.isLoading, online, typingFrom, sendTyping, sendSignal, subscribeSignals, activeChat, locked, lock, unlock],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
