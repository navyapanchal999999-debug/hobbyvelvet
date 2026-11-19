import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mic, Image as ImageIcon, Video } from "lucide-react";
import { useMemo } from "react";
import { TalkAvatar } from "@/components/talk/TalkAvatar";
import { MeHeader } from "@/components/talk/MeHeader";
import { supabase } from "@/integrations/supabase/client";
import { useTalk, type Message } from "@/lib/talk-context";

export const Route = createFileRoute("/_authenticated/chats")({
  head: () => ({
    meta: [
      { title: "Chats · Dot" },
      { name: "description", content: "Your private conversations." },
      { property: "og:title", content: "Chats · Dot" },
      { property: "og:description", content: "Your private conversations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatsPage,
});

function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function Preview({ m, mine }: { m: Message; mine: boolean }) {
  const prefix = mine ? "You: " : "";
  if (m.kind === "image") return <span className="flex items-center gap-1">{prefix}<ImageIcon className="h-3.5 w-3.5" /> Photo</span>;
  if (m.kind === "video") return <span className="flex items-center gap-1">{prefix}<Video className="h-3.5 w-3.5" /> Video</span>;
  if (m.kind === "audio") return <span className="flex items-center gap-1">{prefix}<Mic className="h-3.5 w-3.5" /> Voice message</span>;
  return <span className="truncate">{prefix}{m.body}</span>;
}

function ChatsPage() {
  const { userId, contacts, contactsLoading, online, typingFrom } = useTalk();
  const recentQ = useQuery({
    queryKey: ["recent", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(400);
      const last = new Map<string, Message>();
      for (const m of data ?? []) {
        const other = m.sender_id === userId ? m.recipient_id : m.sender_id;
        if (!last.has(other)) last.set(other, m);
      }
      return last;
    },
  });

  const rows = useMemo(() => {
    const last = recentQ.data ?? new Map<string, Message>();
    return [...contacts].sort((a, b) => {
      const la = last.get(a.id)?.created_at ?? "";
      const lb = last.get(b.id)?.created_at ?? "";
      if (la || lb) return lb.localeCompare(la);
      return a.display_name.localeCompare(b.display_name);
    }).map((p) => ({ p, last: last.get(p.id) }));
  }, [contacts, recentQ.data]);

  return (
    <div className="min-h-dvh bg-background">
      <MeHeader />
      <main className="mx-auto max-w-2xl px-2 pb-10 pt-2">
        {contactsLoading ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-24 text-center text-sm text-muted-foreground">No one here yet.</div>
        ) : (
          <ul>
            {rows.map(({ p, last }) => {
              const isTyping = typingFrom.has(p.id);
              return (
                <li key={p.id}>
                  <Link
                    to="/chat/$userId"
                    params={{ userId: p.id }}
                    className="flex items-center gap-3 rounded-2xl px-3 py-3 transition active:bg-accent hover:bg-card"
                  >
                    <TalkAvatar name={p.display_name} path={p.avatar_path} size={52} online={online.has(p.id)} />
                    <div className="min-w-0 flex-1 border-b border-border pb-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-semibold">{p.display_name}</p>
                        {last && <span className="shrink-0 text-[11px] text-muted-foreground">{timeLabel(last.created_at)}</span>}
                      </div>
                      <div className="mt-0.5 flex min-w-0 text-sm text-muted-foreground">
                        {isTyping ? (
                          <span className="text-primary">typing…</span>
                        ) : last ? (
                          <Preview m={last} mine={last.sender_id === userId} />
                        ) : (
                          <span>{online.has(p.id) ? "Online" : "Tap to start chatting"}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
