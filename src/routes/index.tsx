import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PinPad } from "@/components/talk/PinPad";
import { supabase } from "@/integrations/supabase/client";
import { loginWithPin } from "@/lib/talk.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TALK" },
      { name: "description", content: "Enter your PIN to continue." },
      { property: "og:title", content: "TALK" },
      { property: "og:description", content: "Enter your PIN to continue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Home() {
  const navigate = useNavigate();
  const login = useServerFn(loginWithPin);
  const now = useNow();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  // Arriving here always means "locked".
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void supabase.auth.signOut({ scope: "local" });
    });
  }, []);

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await login({ data: { pin: value } });
      if (!res.ok) {
        setError(res.error);
        setShake((n) => n + 1);
        navigator.vibrate?.([30, 40, 30]);
        setTimeout(() => setPin(""), 420);
        return;
      }
      const { error: sErr } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });
      if (sErr) throw sErr;
      const to = res.destination === "master" ? "/master" : res.destination === "hobby" ? "/hobby" : "/chats";
      await navigate({ to, replace: true });
    } catch {
      setError("Couldn't connect. Try again.");
      setShake((n) => n + 1);
      setTimeout(() => setPin(""), 420);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="aura fixed inset-0 flex select-none flex-col items-center justify-between overflow-hidden px-6 pb-[max(env(safe-area-inset-bottom),2rem)] pt-[max(env(safe-area-inset-top),3.5rem)]">
      <div className="flex flex-col items-center text-center">
        <p className="font-display text-[64px] font-light leading-none tracking-tight tabular-nums">
          {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "\u00A0"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {now ? now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) : "\u00A0"}
        </p>
      </div>

      <div className="flex flex-col items-center">
        <p className="mb-6 h-5 text-sm font-medium text-muted-foreground" aria-live="polite">
          {busy ? "Unlocking…" : error ? <span className="text-destructive">{error}</span> : "Enter PIN"}
        </p>
        <PinPad
          key={shake}
          value={pin}
          onChange={(v) => {
            setError(null);
            setPin(v);
          }}
          onComplete={(v) => void submit(v)}
          disabled={busy}
          error={!!error}
        />
      </div>
      <div className="h-4" />
    </main>
  );
}
