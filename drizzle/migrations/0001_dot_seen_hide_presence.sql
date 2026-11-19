ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by_sender boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_by_recipient boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS messages_unread_idx ON public.messages (recipient_id, seen_at);

DROP POLICY IF EXISTS "Participants delete messages" ON public.messages;
CREATE POLICY "Sender deletes unseen messages" ON public.messages
  FOR DELETE TO authenticated
  USING (auth.uid() = sender_id AND seen_at IS NULL);

CREATE OR REPLACE FUNCTION public.mark_seen(_other uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.messages SET seen_at = now()
   WHERE recipient_id = auth.uid() AND sender_id = _other AND seen_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.hide_messages(_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.messages SET deleted_by_sender = true
   WHERE id = ANY(_ids) AND sender_id = auth.uid();
  UPDATE public.messages SET deleted_by_recipient = true
   WHERE id = ANY(_ids) AND recipient_id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.hide_all_sent(_other uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.messages SET deleted_by_sender = true
   WHERE sender_id = auth.uid() AND recipient_id = _other AND deleted_by_sender = false;
END $$;

CREATE TABLE IF NOT EXISTS public.presence (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  online boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.presence TO authenticated;
GRANT ALL ON public.presence TO service_role;
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read presence" ON public.presence
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.heartbeat()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.presence (user_id, online, last_seen)
  VALUES (auth.uid(), true, now())
  ON CONFLICT (user_id) DO UPDATE SET online = true, last_seen = now();
$$;

CREATE OR REPLACE FUNCTION public.go_offline()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.presence SET online = false, last_seen = now() WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.mark_seen(uuid), public.hide_messages(uuid[]), public.hide_all_sent(uuid), public.heartbeat(), public.go_offline() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_seen(uuid), public.hide_messages(uuid[]), public.hide_all_sent(uuid), public.heartbeat(), public.go_offline() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

ALTER TABLE public.user_credentials ADD COLUMN IF NOT EXISTS email text;
UPDATE public.user_credentials c SET email = u.email FROM auth.users u WHERE u.id = c.user_id AND c.email IS NULL;

CREATE POLICY "Avatars own upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatars own delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);