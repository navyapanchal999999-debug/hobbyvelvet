import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, RefreshCcw, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCall } from "@/lib/call-context";
import { useTalk } from "@/lib/talk-context";
import { TalkAvatar } from "./TalkAvatar";
import { cn } from "@/lib/utils";

function useClock(startedAt: number | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return null;
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function CallOverlay() {
  const { call, localStream, remoteStream, accept, decline, hangup, toggleMute, toggleCamera, flipCamera } = useCall();
  const { profileById } = useTalk();
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const clock = useClock(call?.phase === "active" ? call.startedAt : null);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream, call?.phase]);
  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream, call?.phase]);

  if (!call) return null;
  const peer = profileById(call.peerId);
  const showRemoteVideo = call.video && call.phase === "active" && !!remoteStream;
  const status =
    call.phase === "ended"
      ? call.note
      : call.phase === "active"
        ? clock
        : call.direction === "in" && call.phase === "ringing"
          ? `Incoming ${call.video ? "video" : "voice"} call`
          : call.phase === "ringing"
            ? "Ringing…"
            : "Connecting…";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-call text-foreground animate-rise">
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className={cn("absolute inset-0 h-full w-full object-cover", !showRemoteVideo && "opacity-0")}
      />
      {!showRemoteVideo && <div className="pointer-events-none absolute inset-0 aura" />}

      <div className="relative z-10 flex flex-col items-center px-6 pt-[max(env(safe-area-inset-top),3rem)] text-center">
        {!showRemoteVideo && (
          <div className={cn("mb-6 rounded-full", call.phase === "ringing" && "animate-ring")}>
            <TalkAvatar name={peer?.display_name} path={peer?.avatar_path} size={124} />
          </div>
        )}
        <h2 className="text-2xl font-semibold">{peer?.display_name ?? "Unknown"}</h2>
        <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">{status}</p>
      </div>

      {call.video && localStream && call.phase !== "ended" && (
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "absolute right-4 top-[max(env(safe-area-inset-top),1rem)] z-20 h-44 w-28 rounded-2xl object-cover shadow-float ring-1 ring-border",
            call.facing === "user" && "-scale-x-100",
            call.cameraOff && "opacity-30",
          )}
        />
      )}

      <div className="relative z-10 mt-auto px-6 pb-[max(env(safe-area-inset-bottom),2.5rem)]">
        {call.direction === "in" && call.phase === "ringing" ? (
          <div className="flex items-center justify-around">
            <div className="flex flex-col items-center gap-2">
              <Button variant="end" size="call" onClick={decline} aria-label="Decline">
                <PhoneOff />
              </Button>
              <span className="text-xs text-muted-foreground">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="accept" size="call" onClick={() => void accept()} aria-label="Accept" className="animate-ring">
                {call.video ? <Video /> : <Phone />}
              </Button>
              <span className="text-xs text-muted-foreground">Accept</span>
            </div>
          </div>
        ) : call.phase !== "ended" ? (
          <div className="glass mx-auto flex max-w-sm items-center justify-around rounded-full px-4 py-3 shadow-float">
            <Button variant="toggle" size="call" data-active={call.muted} onClick={toggleMute} aria-label={call.muted ? "Unmute" : "Mute"}>
              {call.muted ? <MicOff /> : <Mic />}
            </Button>
            {call.video && (
              <>
                <Button variant="toggle" size="call" data-active={call.cameraOff} onClick={toggleCamera} aria-label="Camera on or off">
                  {call.cameraOff ? <VideoOff /> : <Video />}
                </Button>
                <Button variant="toggle" size="call" onClick={() => void flipCamera()} aria-label="Flip camera">
                  <RefreshCcw />
                </Button>
              </>
            )}
            <Button variant="end" size="call" onClick={hangup} aria-label="End call">
              <PhoneOff />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
