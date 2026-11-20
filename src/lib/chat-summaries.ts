import { supabase } from "@/integrations/supabase/client";
import { newMessagesLabel } from "./time";

export type Summary = {
  other_id: string;
  last_id: string;
  last_kind: string;
  last_body: string | null;
  last_sender: string;
  last_at: string;
  unread: number;
};

export const summariesKey = (userId: string) => ["summaries", userId] as const;

/** One row per conversation: latest visible message + unread incoming count. */
export async function fetchSummaries(): Promise<Map<string, Summary>> {
  const { data, error } = await supabase.rpc("chat_summaries");
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.other_id, r as Summary]));
}

export function totalUnread(map: Map<string, Summary> | undefined) {
  let n = 0;
  if (map) for (const s of map.values()) n += s.unread;
  return n;
}

export type ListLine =
  | { type: "unread"; label: string }
  | { type: "message"; kind: string; body: string | null; mine: boolean }
  | { type: "empty" };

/**
 * What the chat list shows under a name. Unread incoming messages are never
 * previewed: only "N New Messages" until the conversation is opened.
 */
export function listLine(s: Summary | undefined, me: string): ListLine {
  if (!s) return { type: "empty" };
  if (s.unread > 0) return { type: "unread", label: newMessagesLabel(s.unread) };
  return { type: "message", kind: s.last_kind, body: s.last_body, mine: s.last_sender === me };
}
