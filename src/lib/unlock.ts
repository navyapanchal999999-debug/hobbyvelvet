import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { matchPin, savePins, sendOffline, type Dest } from "./pin-cache";
import type { LoginResult } from "./talk.functions";

type LoginFn = (opts: { data: { pin: string; currentUserId?: string | null } }) => Promise<LoginResult>;
export type Resolved = { ok: true; dest: Dest; userId: string; switched: boolean } | { ok: false; error: string };

/**
 * Turn a PIN into "who" and "where". The person already signed in on this device
 * is matched locally (instant); anyone else goes to the server once.
 */
export async function resolvePin(pin: string, login: LoginFn, qc: QueryClient): Promise<Resolved> {
  const { data } = await supabase.auth.getSession();
  const current = data.session?.user.id ?? null;
  if (current) {
    const local = await matchPin(current, pin);
    if (local) return { ok: true, dest: local, userId: current, switched: false };
  }

  const res = await login({ data: { pin, currentUserId: current } });
  if (!res.ok) return res;
  savePins(res.userId, res.hashes);

  const switched = res.userId !== current;
  if (switched) {
    if (!res.access_token || !res.refresh_token) return { ok: false, error: "Couldn't connect. Try again." };
    // The person leaving this device goes offline right away.
    if (current) sendOffline(data.session?.access_token);
    qc.clear();
    const { error } = await supabase.auth.setSession({
      access_token: res.access_token,
      refresh_token: res.refresh_token,
    });
    if (error) return { ok: false, error: "Couldn't connect. Try again." };
  }
  if (res.profile) qc.setQueryData(["me", res.userId], (old: unknown) => old ?? res.profile);
  qc.setQueryData(["isMaster", res.userId], res.destination === "master" ? true : (old: unknown) => old);
  return { ok: true, dest: res.destination, userId: res.userId, switched };
}
