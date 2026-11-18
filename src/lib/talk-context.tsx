import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { playTone } from "./sound";
import { lockSuppressed } from "./lock-guard";

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
  lock: () => void;
};

const Ctx = createContext<TalkCtx | null>(null);

export function useTalk() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTalk must be used inside TalkProvider");
  return v;
}

export const messagesKey = (otherId: string) => ["messages", otherId] as const;

export async function fetchConversation(me: string, other: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).reverse();
}

export function TalkProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const listeners = useRef(new Set<(s: Signal) => void>());
  const outbound = useRef(new Map<string, RealtimeChannel>());
  const lastTypingSent = useRef<Record<string, number>>({});

  const meQ = useQuery({
    queryKey: ["me", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data;
    },
  });
  const masterQ = useQuery({
    queryKey: ["isMaster", userId],
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      return !!data;
    },
  });
  const contactsQ = useQuery({
    queryKey: ["contacts", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").neq("id", userId).order("display_name");
      return data ?? [];
    },
  });

  const toneRef = useRef(1);
  toneRef.current = meQ.data?.notification_tone ?? 1;

  const lock = useCallback(() => {
    void navigate({ to: "/" });
    void supabase.auth.signOut({ scope: "local" });
  }, [navigate]);

  // Lock the moment the app is hidden (tab switch, minimise, screen off).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && !lockSuppressed()) lock();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [lock]);

  // Live messages: new, sent from another device, and deletions.
  useEffect(() => {
    const addMsg = (m: Message, incoming: boolean) => {
      const other = m.sender_id === userId ? m.recipient_id : m.sender_id;
      qc.setQueryData<Message[]>(messagesKey(other), (old) =>
        old ? (old.some((x) => x.id === m.id) ? old : [...old, m]) : old,
      );
      void qc.invalidateQueries({ queryKey: ["recent", userId] });
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
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (!id) return;
        qc.setQueriesData<Message[]>({ queryKey: ["messages"] }, (old) => old?.filter((m) => m.id !== id));
        void qc.invalidateQueries({ queryKey: ["recent", userId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  // Presence: who has the app open and unlocked right now.
  useEffect(() => {
    const ch = supabase.channel("talk-presence", { config: { presence: { key: userId } } });
    ch.on("presence", { event: "sync" }, () => {
      setOnline(new Set(Object.keys(ch.presenceState())));
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") void ch.track({ at: Date.now() });
    });
    return () => {
      void ch.untrack();
      void supabase.removeChannel(ch);
    };
  }, [userId]);

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

  const contacts = contactsQ.data ?? [];
  const value = useMemo<TalkCtx>(
    () => ({
      userId,
      me: meQ.data ?? null,
      isMaster: masterQ.data ?? false,
      contacts,
      contactsLoading: contactsQ.isLoading,
      profileById: (id) => contacts.find((c) => c.id === id) ?? (meQ.data?.id === id ? meQ.data : undefined),
      online,
      typingFrom: new Set(Object.keys(typing)),
      sendTyping,
      sendSignal,
      subscribeSignals,
      activeChat,
      setActiveChat,
      lock,
    }),
    [userId, meQ.data, masterQ.data, contacts, contactsQ.isLoading, online, typing, sendTyping, sendSignal, subscribeSignals, activeChat, lock],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
