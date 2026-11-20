import { memo, useEffect, useRef, useState } from "react";
import { Check, Pause, Play, X } from "lucide-react";
import { useSignedUrl } from "@/lib/media";
import type { Message } from "@/lib/talk-context";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/time";

function fmt(sec: number) {
  if (!isFinite(sec)) return "0:00";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function VoiceNote({ url, mine }: { url: string | null; mine: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => setPos(a.currentTime);
    const onMeta = () => {
      if (isFinite(a.duration)) setDur(a.duration);
      else {
        // Some recorders don't write duration; seek far to make the browser compute it.
        a.currentTime = 1e6;
        a.addEventListener("timeupdate", function fix() {
          a.removeEventListener("timeupdate", fix);
          setDur(a.duration);
          a.currentTime = 0;
        });
      }
    };
    const onEnd = () => {
      setPlaying(false);
      setPos(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, [url]);
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;
  return (
    <div className="flex w-56 items-center gap-3 py-1">
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        disabled={!url}
        onClick={(e) => {
          e.stopPropagation();
          const a = ref.current;
          if (!a) return;
          if (a.paused) void a.play().then(() => setPlaying(true));
          else {
            a.pause();
            setPlaying(false);
          }
        }}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          mine ? "bg-bubble-out-foreground/15" : "bg-foreground/10",
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <div className="flex-1">
        <div className={cn("h-1 rounded-full", mine ? "bg-bubble-out-foreground/20" : "bg-foreground/15")}>
          <div className={cn("h-1 rounded-full", mine ? "bg-bubble-out-foreground" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[11px] tabular-nums opacity-70">{fmt(playing || pos ? pos : dur)}</p>
      </div>
      {url && <audio ref={ref} src={url} preload="metadata" />}
    </div>
  );
}

export function ImageViewer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-call/95 animate-rise" onClick={onClose}>
      <button aria-label="Close" className="absolute right-4 top-[max(env(safe-area-inset-top),1rem)] rounded-full p-2 hover:bg-accent">
        <X className="h-6 w-6" />
      </button>
      <img src={url} alt="" className="max-h-full max-w-full object-contain" />
    </div>
  );
}

type Props = {
  m: Message;
  mine: boolean;
  selectMode: boolean;
  selected: boolean;
  /** Arrived while the chat was open: animate it in. */
  fresh?: boolean;
  onLongPress: (id: string) => void;
  onTap: (id: string) => void;
};

/** Memoised: typing, presence and other bubbles changing never re-render this one. */
export const MessageBubble = memo(function MessageBubble({ m, mine, selectMode, selected, fresh, onLongPress, onTap }: Props) {
  const url = useSignedUrl("chat-media", m.media_path);
  const [viewer, setViewer] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);
  const time = fmtTime(m.created_at);
  const isMedia = m.kind === "image" || m.kind === "video";

  return (
    <div
      className={cn(
        "flex w-full px-3 py-0.5 transition-colors duration-150",
        fresh && "bubble-in",
        mine ? "justify-end" : "justify-start",
        selected && "bg-primary/10",
      )}
      onClick={() => {
        if (selectMode) onTap(m.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress(m.id);
      }}
      onPointerDown={() => {
        moved.current = false;
        timer.current = setTimeout(() => {
          if (!moved.current) {
            navigator.vibrate?.(15);
            onLongPress(m.id);
          }
        }, 480);
      }}
      onPointerMove={() => {
        moved.current = true;
        if (timer.current) clearTimeout(timer.current);
      }}
      onPointerUp={() => timer.current && clearTimeout(timer.current)}
      onPointerCancel={() => timer.current && clearTimeout(timer.current)}
    >
      {selectMode && (
        <span
          className={cn(
            "mr-2 mt-2 flex h-5 w-5 shrink-0 items-center justify-center self-start rounded-full border",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50",
          )}
        >
          {selected && <Check className="h-3 w-3" />}
        </span>
      )}
      <div
        className={cn(
          "relative max-w-[80%] select-none rounded-[20px] text-[15px] leading-snug shadow-sm",
          mine
            ? "rounded-br-md bg-bubble-out text-bubble-out-foreground"
            : "rounded-bl-md bg-bubble-in text-bubble-in-foreground",
          isMedia ? "overflow-hidden p-1" : "px-3.5 py-2",
        )}
      >
        {m.kind === "image" && (
          url ? (
            <img
              src={url}
              alt=""
              loading="lazy"
              onClick={(e) => {
                if (selectMode) return;
                e.stopPropagation();
                setViewer(true);
              }}
              className="max-h-80 w-full min-w-40 rounded-[16px] object-cover"
            />
          ) : (
            <div className="h-48 w-56 animate-pulse rounded-[16px] bg-foreground/10" />
          )
        )}
        {m.kind === "video" && (
          url ? (
            <video src={url} controls playsInline preload="metadata" className="max-h-80 w-64 rounded-[16px] bg-call" />
          ) : (
            <div className="h-48 w-56 animate-pulse rounded-[16px] bg-foreground/10" />
          )
        )}
        {m.kind === "audio" && <VoiceNote url={url} mine={mine} />}
        {m.body && <p className={cn("whitespace-pre-wrap break-words", isMedia && "px-2 pt-1")}>{m.body}</p>}
        <span
          className={cn(
            "block text-right text-[10px] tabular-nums opacity-60",
            isMedia && !m.body ? "absolute bottom-2 right-3 rounded-full bg-call/60 px-1.5 text-foreground opacity-100" : "mt-0.5",
          )}
        >
          {time}
        </span>
      </div>
      {viewer && url && <ImageViewer url={url} onClose={() => setViewer(false)} />}
    </div>
  );
});
