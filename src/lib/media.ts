import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Bucket = "avatars" | "chat-media";
const cache = new Map<string, { url: string; exp: number }>();
const pending = new Map<string, Promise<string | null>>();

export async function signedUrl(bucket: Bucket, path: string) {
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const p = supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600)
    .then(({ data }) => {
      pending.delete(key);
      if (!data?.signedUrl) return null;
      cache.set(key, { url: data.signedUrl, exp: Date.now() + 50 * 60_000 });
      return data.signedUrl;
    });
  pending.set(key, p);
  return p;
}

export function useSignedUrl(bucket: Bucket, path: string | null | undefined) {
  const initial = path ? (cache.get(`${bucket}/${path}`)?.url ?? null) : null;
  const [url, setUrl] = useState<string | null>(initial);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void signedUrl(bucket, path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [bucket, path]);
  return url;
}

export function pairKey(a: string, b: string) {
  return [a, b].sort().join("_");
}

/** Shrink a photo before upload so it sends fast. */
export async function shrinkImage(file: File, max = 1600, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality));
}

export function extFor(type: string) {
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("png")) return "png";
  if (type.includes("gif")) return "gif";
  if (type.includes("webp")) return "webp";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("webm")) return "webm";
  if (type.includes("quicktime")) return "mov";
  if (type.includes("ogg")) return "ogg";
  return "bin";
}
