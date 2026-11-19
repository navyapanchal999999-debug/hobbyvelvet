import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/talk/IconAction";
import { GAMES, type Game } from "@/lib/games";
import { useTalk } from "@/lib/talk-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/hobby")({
  head: () => ({
    meta: [
      { title: "Hobby · Dot" },
      { name: "description", content: "20 sports and games with step-by-step rules." },
      { property: "og:title", content: "Hobby · Dot" },
      { property: "og:description", content: "20 sports and games with step-by-step rules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HobbyPage,
});

function Guide({ game, onClose }: { game: Game; onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = game.steps[i]!;
  const last = i === game.steps.length - 1;
  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-border animate-rise">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-4xl">{game.emoji}</span>
        <div>
          <h2 className="font-display text-xl font-semibold">{game.name}</h2>
          <p className="text-xs text-muted-foreground">{game.players} · How to Play</p>
        </div>
      </div>
      <div className="mb-4 flex gap-1.5">
        {game.steps.map((_, k) => (
          <span key={k} className={cn("h-1 flex-1 rounded-full", k <= i ? "bg-primary" : "bg-secondary")} />
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step {i + 1} of {game.steps.length}</p>
      <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
      <p className="mt-2 min-h-12 text-muted-foreground">{step.text}</p>
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" className="flex-1 rounded-xl" disabled={i === 0} onClick={() => setI(i - 1)}>
          <ChevronLeft /> Back
        </Button>
        <Button className="flex-1 rounded-xl" onClick={() => (last ? onClose() : setI(i + 1))}>
          {last ? "Done" : <>Next <ChevronRight /></>}
        </Button>
      </div>
    </div>
  );
}

function HobbyPage() {
  const { lock } = useTalk();
  const [open, setOpen] = useState<Game | null>(null);
  return (
    <div className="min-h-dvh bg-background">
      <header className="glass sticky top-0 z-30 border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-2 px-2">
          <IconAction label="Back to Home" onClick={lock}>
            <ArrowLeft />
          </IconAction>
          <p className="font-display text-[15px] font-semibold">Back to Home</p>
        </div>
      </header>
      <main className="mx-auto grid max-w-2xl gap-4 px-4 pb-16 pt-4">
        {open && <Guide key={open.id} game={open} onClose={() => setOpen(null)} />}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {GAMES.map((game) => (
            <li key={game.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(game);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={cn(
                  "flex w-full flex-col items-start gap-2 rounded-2xl bg-card p-4 text-left ring-1 ring-border transition active:scale-[0.98] hover:bg-accent",
                  open?.id === game.id && "ring-primary",
                )}
              >
                <span className="text-3xl">{game.emoji}</span>
                <span className="font-semibold">{game.name}</span>
                <span className="text-xs text-muted-foreground">{game.players}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
