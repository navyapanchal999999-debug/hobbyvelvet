import { useEffect, useState } from "react";
import { PinPad } from "./PinPad";
import { fmtTime } from "@/lib/time";
import { cn } from "@/lib/utils";

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

type Props = {
  /** Return an error message to shake, or nothing on success. */
  onSubmit: (pin: string) => Promise<string | void>;
  className?: string;
};

/** Clock + on-screen keypad. Used for the Home screen and the lock screen. */
export function PinScreen({ onSubmit, className }: Props) {
  const now = useNow();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    let err: string | void;
    try {
      err = await onSubmit(value);
    } catch {
      err = "Couldn't connect. Try again.";
    }
    setBusy(false);
    if (err) {
      setError(err);
      setShake((n) => n + 1);
      navigator.vibrate?.([30, 40, 30]);
      setTimeout(() => setPin(""), 420);
    }
  };

  return (
    <main
      className={cn(
        "aura fixed inset-0 flex select-none flex-col items-center justify-between overflow-hidden px-6 pb-[max(env(safe-area-inset-bottom),2rem)] pt-[max(env(safe-area-inset-top),3.5rem)]",
        className,
      )}
    >
      <div className="flex flex-col items-center text-center">
        <p className="font-display text-[56px] font-light leading-none tracking-tight tabular-nums">
          {now ? fmtTime(now) : "\u00A0"}
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
