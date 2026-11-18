import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckSquare, Gamepad2, Loader2, Lock, MoreVertical, Phone, Trash2, Video, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Composer } from "@/components/talk/Composer";
import { IconAction } from "@/components/talk/IconAction";
import { MessageBubble } from "@/components/talk/MessageBubble";
import { TalkAvatar } from "@/components/talk/TalkAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useCall } from "@/lib/call-context";
import { extFor, pairKey, shrinkImage } from "@/lib/media";
import { fetchConversation, messagesKey, useTalk, type Message } from "@/lib/talk-context";

export const Route = createFileRoute("/_authenticated/chat/$userId")({
  head: () => ({
    meta: [
      { title: "Chat · TALK" },
      { name: "description", content: "Private conversation." },
      { property: "og:title", content: "Chat · TALK" },
      { property: "og:description", content: "Private conversation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

/** Height of the on-screen keyboard, read from the visual viewport. */
function useKeyboardOffset() {
  const [off, setOff] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fn = () => setOff(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener("resize", fn);
    vv.addEventListener("scroll", fn);
    fn();
    return () => {
      vv.removeEventListener("resize", fn);
      vv.removeEventListener("scroll", fn);
    };
  }, []);
  return off;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

type Pending = { id: string; label: string };

function ChatPage() {
  const { userId: otherId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const talk = useTalk();
  const { startCall, call } = useCall();
  const me = talk.userId;
  const peer = talk.profileById(otherId);
  const isOnline = talk.online.has(otherId);
  const isTyping = talk.typingFrom.has(otherId);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: messagesKey(otherId),
    queryFn: () => fetchConversation(me, otherId),
  });

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmSel, setConfirmSel] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [composerH, setComposerH] = useState(72);
  const kb = useKeyboardOffset();
  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  useEffect(() => {
    talk.setActiveChat(otherId);
    return () => talk.setActiveChat(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId]);

  // Keep the page itself still; only the message list scrolls.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
      document.body.style.overflow = "";
    };
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    if (atBottom.current) scrollToBottom();
  }, [messages.length, pending.length, kb, composerH, isTyping, scrollToBottom]);

  useLayoutEffect(() => {
    if (!isLoading) scrollToBottom();
  }, [isLoading, scrollToBottom]);

  const addLocal = (m: Message) => {
    qc.setQueryData<Message[]>(messagesKey(otherId), (old) =>
      old ? (old.some((x) => x.id === m.id) ? old : [...old, m]) : [m],
    );
    void qc.invalidateQueries({ queryKey: ["recent", me] });
  };

  const insert = async (row: Partial<Message> & { kind: Message["kind"] }) => {
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: me, recipient_id: otherId, ...row })
      .select()
      .single();
    if (error || !data) {
      toast("Message not sent");
      return;
    }
    atBottom.current = true;
    addLocal(data);
  };

  const sendText = (text: string) => {
    void talk.sendSignal(otherId, "typing-stop");
    void insert({ kind: "text", body: text });
  };

  const upload = async (blob: Blob, kind: "image" | "video" | "audio", label: string) => {
    const pid = crypto.randomUUID();
    atBottom.current = true;
    setPending((p) => [...p, { id: pid, label }]);
    try {
      const path = `${pairKey(me, otherId)}/${crypto.randomUUID()}.${extFor(blob.type)}`;
      const { error } = await supabase.storage
        .from("chat-media")
        .upload(path, blob, { contentType: blob.type || undefined, upsert: false });
      if (error) throw error;
      await insert({ kind, media_path: path });
    } catch {
      toast("Upload failed");
    } finally {
      setPending((p) => p.filter((x) => x.id !== pid));
    }
  };

  const sendFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast("File is larger than 50 MB");
      return;
    }
    if (file.type.startsWith("image/")) await upload(await shrinkImage(file), "image", "Sending photo…");
    else if (file.type.startsWith("video/")) await upload(file, "video", "Sending video…");
    else toast("Only photos and videos");
  };

  const removeMedia = async (rows: Message[]) => {
    const paths = rows.map((m) => m.media_path).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from("chat-media").remove(paths);
  };

  const deleteSelected = async () => {
    const ids = [...selected];
    const rows = messages.filter((m) => selected.has(m.id));
    const { error } = await supabase.from("messages").delete().in("id", ids);
    if (error) return toast("Couldn't delete");
    qc.setQueryData<Message[]>(messagesKey(otherId), (old) => old?.filter((m) => !selected.has(m.id)));
    void removeMedia(rows);
    void qc.invalidateQueries({ queryKey: ["recent", me] });
    setSelected(new Set());
    setSelectMode(false);
  };

  const deleteAll = async () => {
    const rows = messages;
    const { error } = await supabase
      .from("messages")
      .delete()
      .or(`and(sender_id.eq.${me},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me})`);
    if (error) return toast("Couldn't delete");
    qc.setQueryData<Message[]>(messagesKey(otherId), []);
    void removeMedia(rows);
    void qc.invalidateQueries({ queryKey: ["recent", me] });
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      if (n.size === 0) setSelectMode(false);
      return n;
    });

  const statusLine = isTyping ? `${peer?.display_name ?? "They"} is typing...` : isOnline ? "Online" : "Offline";
  const callDisabled = !isOnline || !!call;

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="glass relative z-30 border-b border-border pt-[env(safe-area-inset-top)]">
        {selectMode ? (
          <div className="mx-auto flex h-16 max-w-2xl items-center gap-2 px-2">
            <IconAction label="Cancel selection" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>
              <X />
            </IconAction>
            <p className="flex-1 font-display font-semibold">{selected.size} selected</p>
            <IconAction label="Delete selected" disabled={!selected.size} onClick={() => setConfirmSel(true)} className="text-destructive">
              <Trash2 />
            </IconAction>
          </div>
        ) : (
          <div className="mx-auto flex h-16 max-w-2xl items-center gap-1 px-1.5">
            <IconAction label="Back to chats" onClick={() => void navigate({ to: "/chats" })}>
              <ArrowLeft />
            </IconAction>
            <TalkAvatar name={peer?.display_name} path={peer?.avatar_path} size={38} online={isOnline} />
            <div className="ml-1.5 min-w-0 flex-1">
              <p className="truncate font-display text-[15px] font-semibold leading-tight">{peer?.display_name ?? "\u00A0"}</p>
              <p className={`truncate text-xs ${isTyping ? "text-primary" : isOnline ? "text-online" : "text-muted-foreground"}`}>
                {statusLine}
              </p>
            </div>
            <IconAction label={isOnline ? "Video call" : "Video call (offline)"} disabled={callDisabled} onClick={() => void startCall(otherId, true)}>
              <Video />
            </IconAction>
            <IconAction label={isOnline ? "Voice call" : "Voice call (offline)"} disabled={callDisabled} onClick={() => void startCall(otherId, false)}>
              <Phone />
            </IconAction>
            <IconAction label="Go to Hobby" onClick={() => void navigate({ to: "/hobby" })}>
              <Gamepad2 />
            </IconAction>
            <IconAction label="Lock App" onClick={talk.lock}>
              <Lock />
            </IconAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconAction label="Chat options" className="w-8">
                  <MoreVertical />
                </IconAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onSelect={() => setSelectMode(true)}>
                  <CheckSquare className="mr-2 h-4 w-4" /> Select Messages to Delete
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmAll(true)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete All Messages
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: composerH + kb + 12 }}
      >
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-end pt-4">
          {isLoading ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : messages.length === 0 && pending.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Say hi to {peer?.display_name ?? "them"}.</p>
          ) : (
            messages.map((m, i) => {
              const showDay = i === 0 || new Date(messages[i - 1].created_at).toDateString() !== new Date(m.created_at).toDateString();
              const mine = m.sender_id === me;
              return (
                <Fragment key={m.id}>
                  {showDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-muted-foreground">
                        {dayLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    m={m}
                    mine={mine}
                    selectMode={selectMode}
                    selected={selected.has(m.id)}
                    onLongPress={() => {
                      setSelectMode(true);
                      setSelected((s) => new Set(s).add(m.id));
                    }}
                    onTap={() => mine && toggle(m.id)}
                  />
                </Fragment>
              );
            })
          )}
          {pending.map((p) => (
            <div key={p.id} className="flex justify-end px-3 py-0.5">
              <div className="flex items-center gap-2 rounded-[20px] rounded-br-md bg-bubble-out/60 px-3.5 py-2 text-sm text-bubble-out-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {p.label}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex px-3 py-1">
              <div className="flex items-center gap-1 rounded-[20px] rounded-bl-md bg-bubble-in px-4 py-3">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {!selectMode && (
        <Composer
          draftKey={otherId}
          bottom={kb}
          onHeight={setComposerH}
          onTyping={() => talk.sendTyping(otherId)}
          onSendText={sendText}
          onSendFile={(f) => void sendFile(f)}
          onSendVoice={(b) => void upload(b, "audio", "Sending voice message…")}
        />
      )}

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent className="rounded-3xl border-border bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all messages?</AlertDialogTitle>
            <AlertDialogDescription>This clears the whole chat for both of you.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void deleteAll()}>
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmSel} onOpenChange={setConfirmSel}>
        <AlertDialogContent className="rounded-3xl border-border bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} message{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>They will disappear for both of you.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void deleteSelected()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
