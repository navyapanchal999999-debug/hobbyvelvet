import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useTalk, type Signal } from "./talk-context";
import { startRinging, stopRinging } from "./sound";
import { holdLock } from "./lock-guard";

export type CallPhase = "ringing" | "connecting" | "active" | "ended";
export type CallState = {
  id: string;
  peerId: string;
  video: boolean;
  direction: "in" | "out";
  phase: CallPhase;
  startedAt: number | null;
  muted: boolean;
  cameraOff: boolean;
  facing: "user" | "environment";
  note?: string;
};

type CallCtx = {
  call: CallState | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (peerId: string, video: boolean) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  flipCamera: () => Promise<void>;
};

const Ctx = createContext<CallCtx | null>(null);
export function useCall() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCall must be used inside CallProvider");
  return v;
}

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

export function CallProvider({ children }: { children: ReactNode }) {
  const { sendSignal, subscribeSignals, online, userId } = useTalk();
  const [call, setCall] = useState<CallState | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const callRef = useRef<CallState | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const offerRef = useRef<string | null>(null);
  const iceQueue = useRef<RTCIceCandidateInit[]>([]);
  const releaseLock = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((patch: Partial<CallState> | null) => {
    if (patch === null) {
      callRef.current = null;
      setCall(null);
      return;
    }
    callRef.current = callRef.current ? { ...callRef.current, ...patch } : null;
    setCall(callRef.current);
  }, []);

  const cleanup = useCallback(
    (note?: string) => {
      stopRinging();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      pcRef.current?.close();
      pcRef.current = null;
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
      setLocalStream(null);
      setRemoteStream(null);
      offerRef.current = null;
      iceQueue.current = [];
      releaseLock.current?.();
      releaseLock.current = null;
      if (callRef.current) {
        update({ phase: "ended", note: note ?? "Call ended" });
        setTimeout(() => update(null), 1400);
      }
    },
    [update],
  );

  const makePeer = useCallback(
    (peerId: string, callId: string) => {
      const pc = new RTCPeerConnection(ICE);
      pc.onicecandidate = (e) => {
        if (e.candidate) void sendSignal(peerId, "call-ice", { callId, candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        setRemoteStream(e.streams[0] ?? new MediaStream([e.track]));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected" && callRef.current?.phase !== "active") {
          update({ phase: "active", startedAt: Date.now() });
        }
        if (pc.connectionState === "failed") {
          void sendSignal(peerId, "call-end", { callId });
          cleanup("Connection lost");
        }
      };
      pcRef.current = pc;
      return pc;
    },
    [sendSignal, update, cleanup],
  );

  const getMedia = async (video: boolean, facing: "user" | "environment" = "user") => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
    localRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  const flushIce = async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;
    for (const c of iceQueue.current.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
  };

  const startCall = useCallback(
    async (peerId: string, video: boolean) => {
      if (callRef.current) return;
      if (!online.has(peerId)) {
        toast("They're offline right now");
        return;
      }
      const id = crypto.randomUUID();
      callRef.current = {
        id, peerId, video, direction: "out", phase: "ringing", startedAt: null,
        muted: false, cameraOff: false, facing: "user",
      };
      setCall(callRef.current);
      releaseLock.current = holdLock();
      try {
        const stream = await getMedia(video);
        const pc = makePeer(peerId, id);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal(peerId, "call-offer", { callId: id, video, sdp: offer.sdp });
        startRinging("outgoing");
        timeoutRef.current = setTimeout(() => {
          if (callRef.current?.phase === "ringing") {
            void sendSignal(peerId, "call-end", { callId: id });
            cleanup("No answer");
          }
        }, 45_000);
      } catch {
        cleanup(video ? "Camera or microphone blocked" : "Microphone blocked");
      }
    },
    [online, makePeer, sendSignal, cleanup],
  );

  const accept = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.direction !== "in" || !offerRef.current) return;
    stopRinging();
    update({ phase: "connecting" });
    try {
      const stream = await getMedia(c.video);
      const pc = makePeer(c.peerId, c.id);
      await pc.setRemoteDescription({ type: "offer", sdp: offerRef.current });
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(c.peerId, "call-answer", { callId: c.id, sdp: answer.sdp });
    } catch {
      void sendSignal(c.peerId, "call-end", { callId: c.id });
      cleanup("Could not start the call");
    }
  }, [makePeer, sendSignal, cleanup, update]);

  const decline = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    void sendSignal(c.peerId, "call-decline", { callId: c.id });
    cleanup("Declined");
  }, [sendSignal, cleanup]);

  const hangup = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    void sendSignal(c.peerId, "call-end", { callId: c.id });
    cleanup("Call ended");
  }, [sendSignal, cleanup]);

  const toggleMute = useCallback(() => {
    const s = localRef.current;
    if (!s || !callRef.current) return;
    const muted = !callRef.current.muted;
    s.getAudioTracks().forEach((t) => (t.enabled = !muted));
    update({ muted });
  }, [update]);

  const toggleCamera = useCallback(() => {
    const s = localRef.current;
    if (!s || !callRef.current) return;
    const cameraOff = !callRef.current.cameraOff;
    s.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
    update({ cameraOff });
  }, [update]);

  const flipCamera = useCallback(async () => {
    const c = callRef.current;
    const s = localRef.current;
    const pc = pcRef.current;
    if (!c || !s || !c.video) return;
    const facing = c.facing === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: facing } } })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } }));
      const track = fresh.getVideoTracks()[0];
      if (!track) throw new Error("no camera");
      const old = s.getVideoTracks()[0];
      const sender = pc?.getSenders().find((x) => x.track?.kind === "video");
      await sender?.replaceTrack(track);
      if (old) {
        s.removeTrack(old);
        old.stop();
      }
      track.enabled = !c.cameraOff;
      s.addTrack(track);
      const next = new MediaStream(s.getTracks());
      localRef.current = next;
      setLocalStream(next);
      update({ facing });
    } catch {
      toast("Couldn't switch camera");
    }
  }, [update]);

  useEffect(() => {
    return subscribeSignals(async (s: Signal) => {
      const c = callRef.current;
      const callId = s["callId"] as string | undefined;
      switch (s.type) {
        case "call-offer": {
          if (c) {
            void sendSignal(s.from, "call-busy", { callId });
            return;
          }
          offerRef.current = s["sdp"] as string;
          callRef.current = {
            id: callId!, peerId: s.from, video: !!s["video"], direction: "in", phase: "ringing",
            startedAt: null, muted: false, cameraOff: false, facing: "user",
          };
          setCall(callRef.current);
          releaseLock.current = holdLock();
          startRinging("incoming");
          timeoutRef.current = setTimeout(() => {
            if (callRef.current?.phase === "ringing") cleanup("Missed call");
          }, 45_000);
          return;
        }
        case "call-answer": {
          if (!c || c.id !== callId || !pcRef.current) return;
          stopRinging();
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          update({ phase: "connecting" });
          await pcRef.current.setRemoteDescription({ type: "answer", sdp: s["sdp"] as string });
          await flushIce();
          return;
        }
        case "call-ice": {
          if (!c || c.id !== callId) return;
          const cand = s["candidate"] as RTCIceCandidateInit;
          if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(cand).catch(() => undefined);
          else iceQueue.current.push(cand);
          return;
        }
        case "call-decline":
          if (c?.id === callId) cleanup("Declined");
          return;
        case "call-busy":
          if (c?.id === callId) cleanup("Busy on another call");
          return;
        case "call-end":
          if (c && c.id === callId) cleanup(c.phase === "ringing" && c.direction === "in" ? "Missed call" : "Call ended");
          return;
      }
    });
  }, [subscribeSignals, sendSignal, cleanup, update]);

  // End any call if this screen goes away (lock).
  useEffect(() => () => {
    const c = callRef.current;
    if (c) void sendSignal(c.peerId, "call-end", { callId: c.id });
    stopRinging();
    pcRef.current?.close();
    localRef.current?.getTracks().forEach((t) => t.stop());
    releaseLock.current?.();
  }, [sendSignal, userId]);

  return (
    <Ctx.Provider
      value={{ call, localStream, remoteStream, startCall, accept, decline, hangup, toggleMute, toggleCamera, flipCamera }}
    >
      {children}
    </Ctx.Provider>
  );
}
