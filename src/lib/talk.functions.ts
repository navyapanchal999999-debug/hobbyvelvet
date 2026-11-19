import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MASTER_PIN,
  emailFor,
  ensureMaster,
  getAdmin,
  hashPin,
  issueSession,
  pinTaken,
  randomPassword,
  recordFailure,
  tooManyAttempts,
} from "./talk.server";

const pinSchema = z.string().regex(/^\d{4}$/);

type Dest = "master" | "chat" | "hobby";
type MiniProfile = { id: string; display_name: string; avatar_path: string | null };

export type LoginResult =
  | {
      ok: true;
      destination: Dest;
      userId: string;
      /** Tokens are only sent when the device must switch to another person. */
      access_token: string | null;
      refresh_token: string | null;
      hashes: Record<string, Dest>;
      profile: MiniProfile | null;
    }
  | { ok: false; error: string };

export const loginWithPin = createServerFn({ method: "POST" })
  .inputValidator((input: { pin: string; currentUserId?: string | null }) =>
    z.object({ pin: pinSchema, currentUserId: z.string().uuid().nullish() }).parse(input),
  )
  .handler(async ({ data }): Promise<LoginResult> => {
    const admin = await getAdmin();
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";

    const isMasterPin = data.pin === MASTER_PIN;
    // Run the throttle check and the PIN lookup together to keep unlock under a second.
    const [blocked, credRes] = await Promise.all([
      tooManyAttempts(admin, ip),
      isMasterPin
        ? ensureMaster(admin).then((m) => ({ data: { ...m, chat_pin: MASTER_PIN, hobby_pin: null as string | null } }))
        : admin
            .from("user_credentials")
            .select("user_id, password, chat_pin, hobby_pin, email")
            .or(`chat_pin.eq.${data.pin},hobby_pin.eq.${data.pin}`)
            .maybeSingle(),
    ]);
    if (blocked) return { ok: false, error: "Too many tries. Wait a few minutes." };

    const cred = credRes.data;
    if (!cred) {
      await recordFailure(admin, ip);
      return { ok: false, error: "Wrong PIN" };
    }

    const destination: Dest = isMasterPin ? "master" : cred.chat_pin === data.pin ? "chat" : "hobby";
    const sameUser = data.currentUserId === cred.user_id;

    const [tokens, profileRes, hashes] = await Promise.all([
      sameUser
        ? Promise.resolve({ access_token: null, refresh_token: null })
        : (async () => {
            const email = cred.email ?? (await authEmail(admin, cred.user_id));
            if (!cred.email) await admin.from("user_credentials").update({ email }).eq("user_id", cred.user_id);
            return issueSession(email, cred.password);
          })(),
      admin.from("profiles").select("id, display_name, avatar_path").eq("id", cred.user_id).maybeSingle(),
      (async () => {
        const h: Record<string, Dest> = {};
        h[await hashPin(cred.user_id, cred.chat_pin)] = isMasterPin ? "master" : "chat";
        if (cred.hobby_pin) h[await hashPin(cred.user_id, cred.hobby_pin)] = "hobby";
        return h;
      })(),
    ]);

    return { ok: true, destination, userId: cred.user_id, ...tokens, hashes, profile: profileRes.data ?? null };
  });

async function authEmail(admin: Awaited<ReturnType<typeof getAdmin>>, userId: string) {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data.user?.email ?? emailFor(userId);
}

const pinsSchema = z.object({ chatPin: pinSchema, hobbyPin: pinSchema });

/** A person changes their own Chat PIN and Hobby PIN. */
export const updateMyPins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof pinsSchema>) => pinsSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; hashes: Record<string, Dest> } | { ok: false; error: string }> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (isAdmin) return { ok: false, error: "The master PIN can't be changed." };
    if (data.chatPin === data.hobbyPin) return { ok: false, error: "Chat PIN and Hobby PIN must be different." };
    const admin = await getAdmin();
    if (await pinTaken(admin, data.chatPin, context.userId)) return { ok: false, error: "That Chat PIN is already in use." };
    if (await pinTaken(admin, data.hobbyPin, context.userId)) return { ok: false, error: "That Hobby PIN is already in use." };
    const { error } = await admin
      .from("user_credentials")
      .update({ chat_pin: data.chatPin, hobby_pin: data.hobbyPin })
      .eq("user_id", context.userId);
    if (error) return { ok: false, error: "Couldn't save the new PINs." };
    return {
      ok: true,
      hashes: {
        [await hashPin(context.userId, data.chatPin)]: "chat",
        [await hashPin(context.userId, data.hobbyPin)]: "hobby",
      },
    };
  });

/** Current PINs of the signed-in person (to prefill the profile page). */
export const getMyPins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data } = await admin
      .from("user_credentials")
      .select("chat_pin, hobby_pin")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { chatPin: data?.chat_pin ?? "", hobbyPin: data?.hobby_pin ?? "" };
  });

async function assertMaster(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Only the master can do this");
}

export type ManagedUser = {
  id: string;
  display_name: string;
  dob: string | null;
  gender: string | null;
  avatar_path: string | null;
  chat_pin: string;
  hobby_pin: string | null;
  created_at: string;
};

export const listManagedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    await assertMaster(context);
    const admin = await getAdmin();
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name, dob, gender, avatar_path, created_at")
      .neq("id", context.userId)
      .order("created_at", { ascending: false });
    const { data: creds } = await admin.from("user_credentials").select("user_id, chat_pin, hobby_pin");
    const byId = new Map((creds ?? []).map((c) => [c.user_id, c]));
    return (profiles ?? []).map((p) => ({
      ...p,
      chat_pin: byId.get(p.id)?.chat_pin ?? "",
      hobby_pin: byId.get(p.id)?.hobby_pin ?? null,
    }));
  });

const createSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  gender: z.enum(["boy", "girl"]),
  avatarPath: z.string().max(200).nullable(),
  chatPin: pinSchema,
  hobbyPin: pinSchema,
});

export const createTalkUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof createSchema>) => createSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string }> => {
    await assertMaster(context);
    if (data.chatPin === data.hobbyPin) return { ok: false, error: "Chat PIN and Hobby PIN must be different." };
    const admin = await getAdmin();
    if (await pinTaken(admin, data.chatPin)) return { ok: false, error: "That Chat PIN is already in use." };
    if (await pinTaken(admin, data.hobbyPin)) return { ok: false, error: "That Hobby PIN is already in use." };

    const password = randomPassword();
    const email = emailFor(crypto.randomUUID());
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !created.user) return { ok: false, error: "Could not create the account." };
    const id = created.user.id;

    const { error: pErr } = await admin.from("profiles").insert({
      id,
      display_name: data.displayName,
      dob: data.dob,
      gender: data.gender,
      avatar_path: data.avatarPath,
    });
    const { error: cErr } = pErr
      ? { error: pErr }
      : await admin.from("user_credentials").insert({
          user_id: id,
          chat_pin: data.chatPin,
          hobby_pin: data.hobbyPin,
          password,
          email,
        });
    if (pErr || cErr) {
      await admin.auth.admin.deleteUser(id);
      return { ok: false, error: "Could not save the account. Try different PINs." };
    }
    await admin.from("user_roles").insert({ user_id: id, role: "user" });
    return { ok: true };
  });

export const deleteTalkUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMaster(context);
    if (data.userId === context.userId) throw new Error("The master account cannot be deleted");
    const admin = await getAdmin();

    const { data: profile } = await admin
      .from("profiles")
      .select("avatar_path")
      .eq("id", data.userId)
      .maybeSingle();
    if (profile?.avatar_path) await admin.storage.from("avatars").remove([profile.avatar_path]);

    // Remove shared chat files for every conversation this person was part of.
    const { data: folders } = await admin.storage.from("chat-media").list("", { limit: 1000 });
    for (const f of folders ?? []) {
      if (!f.name.split("_").includes(data.userId)) continue;
      const { data: files } = await admin.storage.from("chat-media").list(f.name, { limit: 1000 });
      const paths = (files ?? []).map((x) => `${f.name}/${x.name}`);
      if (paths.length) await admin.storage.from("chat-media").remove(paths);
    }

    const { error } = await admin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error("Could not delete the user");
    return { ok: true };
  });
