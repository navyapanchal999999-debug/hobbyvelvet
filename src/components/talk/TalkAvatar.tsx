import { cn } from "@/lib/utils";
import { useSignedUrl } from "@/lib/media";

type Props = {
  name?: string | null | undefined;
  path?: string | null | undefined;
  src?: string | null | undefined;
  size?: number | undefined;
  online?: boolean | undefined;
  className?: string | undefined;
};

export function TalkAvatar({ name, path, src, size = 40, online, className }: Props) {
  const signed = useSignedUrl("avatars", src ? null : path);
  const url = src ?? signed;
  const initials = (name ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <div className="h-full w-full overflow-hidden rounded-full bg-secondary ring-1 ring-border">
        {url ? (
          <img src={url} alt={name ?? ""} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-display font-semibold text-muted-foreground"
            style={{ fontSize: size * 0.36 }}
          >
            {initials}
          </div>
        )}
      </div>
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 block rounded-full ring-2 ring-background",
            online ? "bg-online" : "bg-muted-foreground/50",
          )}
          style={{ width: Math.max(9, size * 0.26), height: Math.max(9, size * 0.26) }}
        />
      )}
    </div>
  );
}
