import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { TalkProvider } from "@/lib/talk-context";
import { CallProvider } from "@/lib/call-context";
import { CallOverlay } from "@/components/talk/CallOverlay";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/" });
    return { userId: data.session.user.id };
  },
  component: SignedInLayout,
});

function SignedInLayout() {
  const { userId } = Route.useRouteContext();
  return (
    <TalkProvider key={userId} userId={userId}>
      <CallProvider>
        <Outlet />
        <CallOverlay />
      </CallProvider>
    </TalkProvider>
  );
}
