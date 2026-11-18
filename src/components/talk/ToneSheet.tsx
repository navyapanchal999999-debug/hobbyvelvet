import { Check, Volume2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { TONES, playTone } from "@/lib/sound";
import { useTalk } from "@/lib/talk-context";
import { cn } from "@/lib/utils";

export function ToneSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { me, userId } = useTalk();
  const qc = useQueryClient();
  const current = me?.notification_tone ?? 1;

  const choose = async (n: number) => {
    playTone(n);
    qc.setQueryData(["me", userId], (old: typeof me) => (old ? { ...old, notification_tone: n } : old));
    const { error } = await supabase.from("profiles").update({ notification_tone: n }).eq("id", userId);
    if (error) toast("Couldn't save tone");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-border bg-popover pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <SheetHeader>
          <SheetTitle>Message tone</SheetTitle>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {TONES.map((t, i) => {
            const n = i + 1;
            const active = n === current;
            return (
              <button
                key={t.name}
                onClick={() => void choose(n)}
                className={cn(
                  "flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm ring-1 transition",
                  active ? "bg-primary/15 ring-primary text-foreground" : "bg-secondary ring-border text-muted-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  {t.name}
                </span>
                {active && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
