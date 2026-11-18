import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mic, Paperclip, SendHorizontal, Smile, Keyboard, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmojiPanel } from "./EmojiPanel";
import { allowPicker } from "@/lib/lock-guard";
import { cn } from "@/lib/utils";

const drafts = new Map<string, string>();

type Props = {
  draftKey: string;
  bottom: number;
  onSendText: (text: string) => void;
  onSendFile: (file: File) => void;
  onSendVoice: (blob: Blob) => void;
  onTyping: () => void;
  onHeight: (h: number) => void;
};

function pickMime() {
  const opts = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"];
  return opts.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export function Composer({ draftKey, bottom, onSendText, onSendFile, onSendVoice, onTyping, onHeight }: Props) {
  const [text, setText] = useState(() => drafts.get(draftKey) ?? "");
  const [emoji, setEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [cancelHint, setCancelHint] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rec = useRef({
    mr: null as MediaRecorder | null,
    stream: null as MediaStream | null,
    chunks: [] as Blob[],
    start: 0,
    startX: 0,
    released: false,
    cancelled: false,
    timer: null as ReturnType<typeof setInterval> | null,
  });

  useEffect(() => {
    setText(drafts.get(draftKey) ?? "");
  }, [draftKey]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    onHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [onHeight]);

  // Auto-grow up to 5 lines.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 132) + "px";
  }, [text, recording]);

  const update = (v: string) => {
    setText(v);
    drafts.set(draftKey, v);
    if (v.trim()) onTyping();
  };

  const send = () => {
    const v = text.trim();
    if (!v) return;
    onSendText(v);
    update("");
  };

  const stopTimer = () => {
    if (rec.current.timer) clearInterval(rec.current.timer);
    rec.current.timer = null;
  };

  const startRec = async (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = rec.current;
    r.released = false;
    r.cancelled = false;
    r.startX = e.clientX;
    r.chunks = [];
    setCancelHint(false);
    setRecSecs(0);
    setRecording(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (r.released) {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        toast("Hold the mic to record");
        return;
      }
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mr.ondataavailable = (ev) => ev.data.size && r.chunks.push(ev.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const long = Date.now() - r.start > 700;
        if (!r.cancelled && long && r.chunks.length) {
          onSendVoice(new Blob(r.chunks, { type: mr.mimeType || mime || "audio/webm" }));
        }
        r.mr = null;
      };
      r.mr = mr;
      r.stream = stream;
      r.start = Date.now();
      mr.start(250);
      r.timer = setInterval(() => setRecSecs(Math.floor((Date.now() - r.start) / 1000)), 250);
    } catch {
      setRecording(false);
      toast("Microphone is blocked");
    }
  };

  const endRec = () => {
    const r = rec.current;
    r.released = true;
    stopTimer();
    setRecording(false);
    if (r.mr && r.mr.state !== "inactive") r.mr.stop();
  };

  const moveRec = (e: React.PointerEvent) => {
    const r = rec.current;
    if (!recording) return;
    const cancel = r.startX - e.clientX > 90;
    r.cancelled = cancel;
    setCancelHint(cancel);
  };

  const hasText = text.trim().length > 0;

  return (
    <div
      ref={boxRef}
      className="fixed inset-x-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] transition-[bottom] duration-200 ease-out"
      style={{ bottom }}
    >
      <div className="glass mx-auto max-w-2xl overflow-hidden rounded-[28px] shadow-float">
        {emoji && !recording && <EmojiPanel onPick={(e) => update(text + e)} />}
        <div className="flex items-end gap-1 p-1.5">
          {recording ? (
            <div className="flex h-11 flex-1 items-center gap-3 px-3">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
              <span className="font-mono text-sm tabular-nums">
                {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
              </span>
              <span className={cn("ml-auto flex items-center gap-1 text-xs", cancelHint ? "text-destructive" : "text-muted-foreground")}>
                {cancelHint ? <><Trash2 className="h-3.5 w-3.5" /> Release to cancel</> : "‹ Slide to cancel"}
              </span>
            </div>
          ) : (
            <>
              <button
                type="button"
                aria-label={emoji ? "Show keyboard" : "Emoji"}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setEmoji((v) => !v);
                  if (emoji) taRef.current?.focus();
                  else taRef.current?.blur();
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                {emoji ? <Keyboard className="h-[22px] w-[22px]" /> : <Smile className="h-[22px] w-[22px]" />}
              </button>
              <textarea
                ref={taRef}
                rows={1}
                value={text}
                enterKeyHint="send"
                placeholder="Message"
                onFocus={() => setEmoji(false)}
                onChange={(e) => update(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                className="no-scrollbar max-h-[132px] min-h-11 flex-1 resize-none bg-transparent px-1 py-[11px] leading-[22px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              {!hasText && (
                <button
                  type="button"
                  aria-label="Send photo or video"
                  onClick={() => {
                    allowPicker();
                    fileRef.current?.click();
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <Paperclip className="h-[21px] w-[21px]" />
                </button>
              )}
            </>
          )}
          {hasText && !recording ? (
            <button
              type="button"
              aria-label="Send"
              onPointerDown={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow transition active:scale-90"
            >
              <SendHorizontal className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Hold to record a voice message"
              onPointerDown={(e) => void startRec(e)}
              onPointerUp={endRec}
              onPointerCancel={() => {
                rec.current.cancelled = true;
                endRec();
              }}
              onPointerMove={moveRec}
              onContextMenu={(e) => e.preventDefault()}
              className={cn(
                "flex h-11 w-11 shrink-0 touch-none select-none items-center justify-center rounded-full transition",
                recording ? "scale-125 bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
              )}
            >
              <Mic className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onSendFile(f);
        }}
      />
    </div>
  );
}
