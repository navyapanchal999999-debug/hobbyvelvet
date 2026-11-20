CREATE OR REPLACE FUNCTION public.chat_summaries()
RETURNS TABLE(other_id uuid, last_id uuid, last_kind text, last_body text, last_sender uuid, last_at timestamptz, unread integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT m.id, m.kind, m.body, m.sender_id, m.recipient_id, m.created_at, m.seen_at,
           CASE WHEN m.sender_id = auth.uid() THEN m.recipient_id ELSE m.sender_id END AS other
    FROM public.messages m
    WHERE (m.sender_id = auth.uid() AND NOT m.deleted_by_sender)
       OR (m.recipient_id = auth.uid() AND NOT m.deleted_by_recipient)
  ),
  counts AS (
    SELECT other, count(*)::int AS n
    FROM visible
    WHERE recipient_id = auth.uid() AND seen_at IS NULL
    GROUP BY other
  ),
  latest AS (
    SELECT DISTINCT ON (other) other, id, kind, body, sender_id, created_at
    FROM visible
    ORDER BY other, created_at DESC
  )
  SELECT l.other, l.id, l.kind, l.body, l.sender_id, l.created_at, COALESCE(c.n, 0)
  FROM latest l LEFT JOIN counts c ON c.other = l.other;
$$;

REVOKE ALL ON FUNCTION public.chat_summaries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_summaries() TO authenticated;