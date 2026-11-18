import { useNavigate } from "@tanstack/react-router";
import { Bell, Gamepad2, Lock, MessageCircle, MoreVertical, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TalkAvatar } from "./TalkAvatar";
import { IconAction } from "./IconAction";
import { ToneSheet } from "./ToneSheet";
import { useTalk } from "@/lib/talk-context";

export function MeHeader({ extra }: { extra?: ReactNode }) {
  const { me, isMaster, lock } = useTalk();
  const navigate = useNavigate();
  const [toneOpen, setToneOpen] = useState(false);
  return (
    <header className="glass sticky top-0 z-30 border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-3">
        <TalkAvatar name={me?.display_name} path={me?.avatar_path} size={42} online />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-semibold">{me?.display_name ?? "\u00A0"}</p>
          <p className="text-xs text-online">Online</p>
        </div>
        {extra}
        <IconAction label="Go to Hobby" onClick={() => void navigate({ to: "/hobby" })}>
          <Gamepad2 />
        </IconAction>
        <IconAction label="Lock App" onClick={lock}>
          <Lock />
        </IconAction>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconAction label="More options">
              <MoreVertical />
            </IconAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => setToneOpen(true)}>
              <Bell className="mr-2 h-4 w-4" /> Message tone
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void navigate({ to: "/chats" })}>
              <MessageCircle className="mr-2 h-4 w-4" /> Chats
            </DropdownMenuItem>
            {isMaster && (
              <DropdownMenuItem onSelect={() => void navigate({ to: "/master" })}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Manage users
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ToneSheet open={toneOpen} onOpenChange={setToneOpen} />
    </header>
  );
}
