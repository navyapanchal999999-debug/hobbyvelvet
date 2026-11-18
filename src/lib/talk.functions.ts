import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MASTER_PIN,
  emailFor,
  ensureMaster,
  getAdmin,
  issueSession,
  pinTaken,
  randomPassword,
  recordFailure,
  tooManyAttempts,
} from "./talk.server";

const pinSchema = z.string().regex(/^\d{4}$/);

export type LoginResult =
  | { ok: true; destination: "master" | "chat" | "hobby"; access_token: string; refresh_token: string }
  | { ok: false; error: string };

export const loginWithPin = createServerFn({ method: "POST" })
  .inputValidator((input: { pin: string }) => z.object({ pin: pinSchema }).parse(input))
  .handler(async ({ data }): Promise<LoginResult> => {
    const admin = await getAdmin();
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";

    if (await tooManyAttempts(admin, ip)) {
      return { ok: false, error: "Too many tries. Wait a few minutes." };
    }

    if (data.pin === MASTER_PIN) {
      const master = await ensureMaster(admin);
      const tokens = await issueSession(await authEmail(admin, master.user_id), master.password);
      return { ok: true, destination: "master", ...tokens };
    }

    const { data: cred } = await admin
      .from("user_credentials")
      .select("user_id, password, chat_pin, hobby_pin")
      .or(`chat_pin.eq.${data.pin},hobby_pin.eq.${data.pin}`)
      .maybeSingle();

    if (!cred) {
      await recordFailure(admin, ip);
      return { ok: false, error: "Wrong PIN" };
    }

    const tokens = await issueSession(await authEmail(admin, cred.user_id), cred.password);
    return { ok: true, destination: cred.chat_pin === data.pin ? "chat" : "hobby", ...tokens };
  });

async function authEmail(admin: Awaited<ReturnType<typeof getAdmin>>, userId: string) {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data.user?.email ?? emailFor(userId);
}

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
    const { data: created, error } = await admin.auth.admin.createUser({
      email: emailFor(crypto.randomUUID()),
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
