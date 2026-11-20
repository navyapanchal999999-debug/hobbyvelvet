import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TalkAvatar } from "./TalkAvatar";
import { supabase } from "@/integrations/supabase/client";
import { allowPicker } from "@/lib/lock-guard";
import { shrinkImage } from "@/lib/media";
import { savePins } from "@/lib/pin-cache";
import { useTalk } from "@/lib/talk-context";
import { getMyPins, updateMyPins } from "@/lib/talk.functions";

const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

/** A person edits their own photo, name, date of birth and PINs. */
export function ProfileSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { me, userId, isMaster } = useTalk();
  const qc = useQueryClient();
  const loadPins = useServerFn(getMyPins);
  const savePinsFn = useServerFn(updateMyPins);
  const pinsQ = useQuery({ queryKey: ["myPins", userId], queryFn: () => loadPins(), enabled: open && !isMaster });

  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [chatPin, setChatPin] = useState("");
  const [hobbyPin, setHobbyPin] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(me?.display_name ?? "");
    setDob(me?.dob ?? "");
    setPhoto(null);
    setErr(null);
  }, [open, me]);
  useEffect(() => {
    if (pinsQ.data) {
      setChatPin(pinsQ.data.chatPin);
      setHobbyPin(pinsQ.data.hobbyPin);
    }
  }, [pinsQ.data]);
  useEffect(() => {
    if (!photo) return setPreview(null);
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  const save = async () => {
    setErr(null);
    if (!name.trim()) return setErr("Enter a display name.");
    const pinsChanged = !isMaster && pinsQ.data && (chatPin !== pinsQ.data.chatPin || hobbyPin !== pinsQ.data.hobbyPin);
    if (pinsChanged) {
      if (chatPin.length !== 4 || hobbyPin.length !== 4) return setErr("Both PINs need 4 digits.");
      if (chatPin === hobbyPin) return setErr("Chat PIN and Hobby PIN must be different.");
    }
    setBusy(true);
    try {
      let avatar_path = me?.avatar_path ?? null;
      if (photo) {
        const blob = await shrinkImage(photo, 512, 0.86);
        const path = `${userId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw new Error("Photo upload failed.");
        avatar_path = path;
      }
      if (pinsChanged) {
        const r = await savePinsFn({ data: { chatPin, hobbyPin } });
        if (!r.ok) throw new Error(r.error);
        savePins(userId, r.hashes);
        qc.setQueryData(["myPins", userId], { chatPin, hobbyPin });
      }
      const patch = { display_name: name.trim().slice(0, 40), dob: dob || null, avatar_path };
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw new Error("Couldn't save your profile.");
      qc.setQueryData(["me", userId], (old: typeof me) => (old ? { ...old, ...patch } : old));
      toast("Profile saved");
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border bg-popover pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <SheetHeader>
          <SheetTitle>My profile</SheetTitle>
        </SheetHeader>
        <div className="mt-4 grid gap-4">
          <button
            type="button"
            onClick={() => {
              allowPicker();
              fileRef.current?.click();
            }}
            className="press relative mx-auto rounded-full"
            aria-label="Change profile photo"
          >
            <TalkAvatar name={name || me?.display_name} path={me?.avatar_path} src={preview} size={92} />
            <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow">
              <Camera className="h-4 w-4" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setPhoto(f);
            }}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="pf-name">Display name</Label>
            <Input id="pf-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl bg-secondary" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-dob">Date of birth</Label>
            <Input id="pf-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="h-11 rounded-xl bg-secondary" />
          </div>
          {!isMaster && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pf-cp">Chat PIN</Label>
                <Input id="pf-cp" inputMode="numeric" autoComplete="off" value={chatPin} disabled={pinsQ.isLoading} onChange={(e) => setChatPin(onlyDigits(e.target.value))} className="h-11 rounded-xl bg-secondary text-center font-mono tracking-[0.5em]" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-hp">Hobby PIN</Label>
                <Input id="pf-hp" inputMode="numeric" autoComplete="off" value={hobbyPin} disabled={pinsQ.isLoading} onChange={(e) => setHobbyPin(onlyDigits(e.target.value))} className="h-11 rounded-xl bg-secondary text-center font-mono tracking-[0.5em]" />
              </div>
            </div>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button onClick={() => void save()} disabled={busy} className="h-12 rounded-2xl text-base">
            {busy ? <Loader2 className="animate-spin" /> : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
