import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { TalkProvider, useTalk } from "@/lib/talk-context";
import { CallProvider } from "@/lib/call-context";
import { CallOverlay } from "@/components/talk/CallOverlay";
import { LockOverlay } from "@/components/talk/LockOverlay";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/" });
    return { userId: data.session.user.id };
  },
  component: SignedInLayout,
});

function LockGate() {
  const { locked } = useTalk();
  return (
    <>
      <div inert={locked} aria-hidden={locked} className={locked ? "invisible" : undefined}>
        <Outlet />
        <CallOverlay />
      </div>
      {locked && <LockOverlay />}
    </>
  );
}

function SignedInLayout() {
  const { userId } = Route.useRouteContext();
  return (
    <TalkProvider key={userId} userId={userId}>
      <CallProvider>
        <LockGate />
      </CallProvider>
    </TalkProvider>
  );
}
