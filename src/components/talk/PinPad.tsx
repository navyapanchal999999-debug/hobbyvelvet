import { useEffect } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { unlockAudio } from "@/lib/sound";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onComplete: (v: string) => void;
  disabled?: boolean;
  error?: boolean;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
const LETTERS: Record<string, string> = {
  "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ",
};

export function PinPad({ value, onChange, onComplete, disabled, error }: Props) {
  const press = (k: string) => {
    if (disabled) return;
    unlockAudio();
    navigator.vibrate?.(8);
    if (k === "del") return onChange(value.slice(0, -1));
    if (!k || value.length >= 4) return;
    const next = value + k;
    onChange(next);
    if (next.length === 4) onComplete(next);
  };

  // Desktop convenience: physical number keys (no on-screen system keyboard involved).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex flex-col items-center">
      <div className={cn("mb-10 flex gap-5", error && "animate-shake")} aria-label={`${value.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-3.5 w-3.5 rounded-full border transition-all duration-200",
              i < value.length
                ? error
                  ? "scale-110 border-destructive bg-destructive"
                  : "scale-110 border-primary bg-primary shadow-glow"
                : "border-muted-foreground/40",
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-4">
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onPointerDown={(e) => {
                e.preventDefault();
                press(k);
              }}
              aria-label={k === "del" ? "Delete digit" : k}
              className={cn(
                "flex h-[76px] w-[76px] select-none flex-col items-center justify-center rounded-full transition-all duration-100 active:scale-95 active:bg-key-pressed disabled:opacity-40",
                k === "del" ? "text-muted-foreground active:bg-transparent" : "bg-key ring-1 ring-border",
              )}
            >
              {k === "del" ? (
                <Delete className="h-6 w-6" />
              ) : (
                <>
                  <span className="font-display text-[28px] font-light leading-none">{k}</span>
                  <span className="mt-1 h-3 text-[9px] font-semibold tracking-[0.2em] text-muted-foreground">
                    {LETTERS[k] ?? ""}
                  </span>
                </>
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
