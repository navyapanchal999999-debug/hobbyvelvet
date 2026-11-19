import { useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PinScreen } from "./PinScreen";
import { useTalk } from "@/lib/talk-context";
import { loginWithPin } from "@/lib/talk.functions";
import { destPath, markUnlocked } from "@/lib/pin-cache";
import { resolvePin } from "@/lib/unlock";

/** PIN screen drawn over the app. The person stays signed in and online underneath. */
export function LockOverlay() {
  const { unlock, isMaster } = useTalk();
  const router = useRouter();
  const qc = useQueryClient();
  const login = useServerFn(loginWithPin);
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="fixed inset-0 z-[120] bg-background">
      <PinScreen
        onSubmit={async (pin) => {
          const r = await resolvePin(pin, login, qc);
          if (!r.ok) return r.error;
          if (r.switched) {
            // Someone else unlocked this device: open their space.
            markUnlocked();
            await router.navigate({ to: destPath(r.dest), replace: true });
            await router.invalidate();
            return;
          }
          unlock();
          const inHobby = path.startsWith("/hobby");
          if (r.dest === "hobby" && !inHobby) void router.navigate({ to: "/hobby" });
          else if (r.dest !== "hobby" && inHobby) void router.navigate({ to: isMaster || r.dest === "master" ? "/master" : "/chats" });
        }}
      />
    </div>
  );
}
