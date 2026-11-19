// Remembers which PINs belong to the person signed in on this device, so the
// lock screen can reopen instantly without a server round trip. The session
// token lives in the same storage, so this adds no extra exposure.
export type Dest = "master" | "chat" | "hobby";
const KEY = "dot-pin-cache";

export async function hashPin(userId: string, pin: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${pin}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function savePins(userId: string, hashes: Record<string, Dest>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ userId, hashes }));
  } catch {
    /* storage unavailable */
  }
}

export async function matchPin(userId: string, pin: string): Promise<Dest | null> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { userId: string; hashes: Record<string, Dest> };
    if (entry.userId !== userId) return null;
    return entry.hashes[await hashPin(userId, pin)] ?? null;
  } catch {
    return null;
  }
}

export const destPath = (d: Dest) => (d === "master" ? "/master" : d === "hobby" ? "/hobby" : "/chats");

// Set right before navigating in after a PIN, so the signed-in area opens unlocked.
let freshUnlock = false;
export function markUnlocked() {
  freshUnlock = true;
}
export function consumeUnlocked() {
  const v = freshUnlock;
  freshUnlock = false;
  return v;
}

/** Mark the person offline even while the page is closing. */
export function sendOffline(accessToken: string | null | undefined) {
  if (!accessToken) return;
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  try {
    void fetch(`${url}/rest/v1/rpc/go_offline`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${accessToken}` },
      body: "{}",
    }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
