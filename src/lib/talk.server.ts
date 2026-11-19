// Server-only helpers for TALK accounts. Never import from components.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const MASTER_PIN = "3202";
const MAX_FAILS = 8;
const WINDOW_MINUTES = 10;

export async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function randomPassword() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function emailFor(id: string) {
  return `${id}@talk.local`;
}

/** Sign in server-side with the stored random password and hand back the tokens. */
export async function issueSession(email: string, password: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error("Could not open session");
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

type Admin = Awaited<ReturnType<typeof getAdmin>>;

export async function tooManyAttempts(admin: Admin, ip: string) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await admin
    .from("pin_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);
  return (count ?? 0) >= MAX_FAILS;
}

export async function recordFailure(admin: Admin, ip: string) {
  await admin.from("pin_attempts").insert({ ip });
  const old = new Date(Date.now() - 24 * 3600_000).toISOString();
  await admin.from("pin_attempts").delete().lt("created_at", old);
}

/** Make sure the master account exists; returns its credentials. */
export async function ensureMaster(admin: Admin) {
  const { data: existing } = await admin
    .from("user_credentials")
    .select("user_id, password, email")
    .eq("chat_pin", MASTER_PIN)
    .maybeSingle();
  if (existing) return existing;

  const password = randomPassword();
  const id = crypto.randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: emailFor(id),
    password,
    email_confirm: true,
  });
  if (error || !created.user) throw new Error("Could not prepare master account");
  const userId = created.user.id;
  await admin.from("profiles").insert({ id: userId, display_name: "Master" });
  await admin.from("user_roles").insert({ user_id: userId, role: "admin" });
  const { error: credErr } = await admin
    .from("user_credentials")
    .insert({ user_id: userId, chat_pin: MASTER_PIN, hobby_pin: null, password, email: emailFor(id) });
  if (credErr) {
    await admin.auth.admin.deleteUser(userId);
    const { data: again } = await admin
      .from("user_credentials")
      .select("user_id, password, email")
      .eq("chat_pin", MASTER_PIN)
      .single();
    return again!;
  }
  return { user_id: userId, password, email: emailFor(id) as string | null };
}

export async function pinTaken(admin: Admin, pin: string, exceptUserId?: string) {
  if (pin === MASTER_PIN) return true;
  let q = admin
    .from("user_credentials")
    .select("user_id")
    .or(`chat_pin.eq.${pin},hobby_pin.eq.${pin}`);
  if (exceptUserId) q = q.neq("user_id", exceptUserId);
  const { data } = await q.limit(1);
  return (data?.length ?? 0) > 0;
}

/** SHA-256 of "userId:pin" — the device keeps these to reopen the lock screen instantly. */
export async function hashPin(userId: string, pin: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${pin}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
