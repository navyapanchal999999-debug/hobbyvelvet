import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, MessageCircle, Trash2, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconAction } from "@/components/talk/IconAction";
import { MeHeader } from "@/components/talk/MeHeader";
import { TalkAvatar } from "@/components/talk/TalkAvatar";
import { supabase } from "@/integrations/supabase/client";
import { allowPicker } from "@/lib/lock-guard";
import { shrinkImage } from "@/lib/media";
import { useTalk } from "@/lib/talk-context";
import { createTalkUser, deleteTalkUser, listManagedUsers, type ManagedUser } from "@/lib/talk.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/master")({
  head: () => ({
    meta: [
      { title: "Manage users · TALK" },
      { name: "description", content: "Create and remove people." },
      { property: "og:title", content: "Manage users · TALK" },
      { property: "og:description", content: "Create and remove people." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MasterPage,
});

const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const create = useServerFn(createTalkUser);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"boy" | "girl">("boy");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [chatPin, setChatPin] = useState("");
  const [hobbyPin, setHobbyPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) return setPreview(null);
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr("Enter a display name.");
    if (!dob) return setErr("Pick a date of birth.");
    if (chatPin.length !== 4 || hobbyPin.length !== 4) return setErr("Both PINs need 4 digits.");
    if (chatPin === hobbyPin) return setErr("Chat PIN and Hobby PIN must be different.");
    setBusy(true);
    let avatarPath: string | null = null;
    try {
      if (photo) {
        const blob = await shrinkImage(photo, 512, 0.86);
        avatarPath = `${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("avatars").upload(avatarPath, blob, { contentType: "image/jpeg" });
        if (error) throw new Error("Photo upload failed.");
      }
      const res = await create({
        data: { displayName: name.trim(), dob, gender, avatarPath, chatPin, hobbyPin },
      });
      if (!res.ok) {
        if (avatarPath) await supabase.storage.from("avatars").remove([avatarPath]);
        setErr(res.error);
        return;
      }
      toast(`${name.trim()} created`);
      setName(""); setDob(""); setGender("boy"); setPhoto(null); setChatPin(""); setHobbyPin("");
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-3xl bg-card p-5 ring-1 ring-border">
      <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold">
        <UserPlus className="h-5 w-5 text-primary" /> Create New User
      </h2>

      <div className="mb-5 flex items-center gap-4">
        <button
          type="button"
          onClick={() => { allowPicker(); fileRef.current?.click(); }}
          className="relative rounded-full"
          aria-label="Choose profile picture"
        >
          <TalkAvatar name={name || "?"} src={preview} size={76} />
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
            <Camera className="h-3.5 w-3.5" />
          </span>
        </button>
        <div className="text-sm text-muted-foreground">Profile Picture<br /><span className="text-xs">Optional</span></div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      </div>

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="dn">User Display Name</Label>
          <Input id="dn" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" className="h-11 rounded-xl bg-secondary" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="dob">Date of Birth</Label>
            <Input id="dob" type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} className="h-11 rounded-xl bg-secondary" />
          </div>
          <div className="grid gap-1.5">
            <Label>Gender</Label>
            <div className="grid h-11 grid-cols-2 rounded-xl bg-secondary p-1">
              {(["boy", "girl"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  aria-pressed={gender === g}
                  className={cn(
                    "rounded-lg text-sm font-medium capitalize transition",
                    gender === g ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cp">Chat PIN</Label>
            <Input id="cp" inputMode="numeric" autoComplete="off" value={chatPin} onChange={(e) => setChatPin(onlyDigits(e.target.value))} placeholder="4 digits" className="h-11 rounded-xl bg-secondary text-center font-mono tracking-[0.5em]" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hp">Hobby PIN</Label>
            <Input id="hp" inputMode="numeric" autoComplete="off" value={hobbyPin} onChange={(e) => setHobbyPin(onlyDigits(e.target.value))} placeholder="4 digits" className="h-11 rounded-xl bg-secondary text-center font-mono tracking-[0.5em]" />
          </div>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button type="submit" disabled={busy} className="h-12 rounded-2xl text-base">
          {busy ? <Loader2 className="animate-spin" /> : "Create User"}
        </Button>
      </div>
    </form>
  );
}

function UserRow({ u, onDelete }: { u: ManagedUser; onDelete: () => void }) {
  const { online } = useTalk();
  const a = age(u.dob);
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-border">
      <TalkAvatar name={u.display_name} path={u.avatar_path} size={48} online={online.has(u.id)} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{u.display_name}</p>
        <p className="text-xs capitalize text-muted-foreground">
          {u.gender ?? ""}{a !== null ? ` · ${a} yrs` : ""}
        </p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          Chat {u.chat_pin} · Hobby {u.hobby_pin ?? "—"}
        </p>
      </div>
      <Button variant="soft" size="sm" className="rounded-full text-destructive" onClick={onDelete}>
        <Trash2 /> Delete User
      </Button>
    </li>
  );
}

function MasterPage() {
  const { isMaster, userId } = useTalk();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listManagedUsers);
  const del = useServerFn(deleteTalkUser);
  const [target, setTarget] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const roleQ = useQuery({
    queryKey: ["isMaster", userId],
    queryFn: async () => !!(await supabase.rpc("has_role", { _user_id: userId, _role: "admin" })).data,
  });
  useEffect(() => {
    if (roleQ.data === false) void navigate({ to: "/chats", replace: true });
  }, [roleQ.data, navigate]);

  const usersQ = useQuery({ queryKey: ["managed"], queryFn: () => list(), enabled: isMaster });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["managed"] });
    void qc.invalidateQueries({ queryKey: ["contacts", userId] });
  };

  const confirmDelete = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await del({ data: { userId: target.id } });
      toast(`${target.display_name} deleted`);
      setTarget(null);
      refresh();
    } catch {
      toast("Couldn't delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <MeHeader
        extra={
          <IconAction label="Chats" onClick={() => void navigate({ to: "/chats" })}>
            <MessageCircle />
          </IconAction>
        }
      />
      <main className="mx-auto grid max-w-2xl gap-6 px-4 pb-16 pt-5">
        <CreateUserForm onCreated={refresh} />
        <section>
          <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Users {usersQ.data ? `(${usersQ.data.length})` : ""}
          </h2>
          {usersQ.isLoading ? (
            <div className="h-20 animate-pulse rounded-2xl bg-card" />
          ) : !usersQ.data?.length ? (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border">No users yet.</p>
          ) : (
            <ul className="grid gap-2">
              {usersQ.data.map((u) => <UserRow key={u.id} u={u} onDelete={() => setTarget(u)} />)}
            </ul>
          )}
        </section>
      </main>

      <Dialog open={!!target} onOpenChange={(o) => !o && !deleting && setTarget(null)}>
        <DialogContent className="max-w-[340px] rounded-3xl border-border bg-popover">
          <DialogHeader>
            <DialogTitle>You are accepted to delete.</DialogTitle>
            <DialogDescription>
              {target?.display_name} and all their messages will be removed permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="soft" className="flex-1 rounded-xl sm:flex-none" onClick={() => setTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1 rounded-xl sm:flex-none" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
