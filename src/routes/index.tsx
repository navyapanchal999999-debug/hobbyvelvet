import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { PinScreen } from "@/components/talk/PinScreen";
import { loginWithPin } from "@/lib/talk.functions";
import { destPath, markUnlocked } from "@/lib/pin-cache";
import { resolvePin } from "@/lib/unlock";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dot" },
      { name: "description", content: "Enter your PIN to continue." },
      { property: "og:title", content: "Dot" },
      { property: "og:description", content: "Enter your PIN to continue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  const router = useRouter();
  const qc = useQueryClient();
  const login = useServerFn(loginWithPin);

  // Fetch the next screens' code while the PIN is typed, so opening is instant.
  useEffect(() => {
    const ids = ["/_authenticated", "/_authenticated/chats", "/_authenticated/hobby", "/_authenticated/master", "/_authenticated/chat/$userId"] as const;
    for (const id of ids) {
      const route = router.routesById[id];
      void Promise.resolve(router.loadRouteChunk(route)).catch(() => undefined);
    }
  }, [router]);

  return (
    <PinScreen
      onSubmit={async (pin) => {
        const r = await resolvePin(pin, login, qc);
        if (!r.ok) return r.error;
        markUnlocked();
        await router.navigate({ to: destPath(r.dest), replace: true });
        return undefined;
      }}
    />
  );
}
