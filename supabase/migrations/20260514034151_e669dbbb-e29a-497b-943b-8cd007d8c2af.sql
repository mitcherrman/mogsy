-- Enable RLS on realtime.messages and add channel-scoped policies
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Helper to check game membership by topic suffix (topic format: "game:<uuid>")
CREATE OR REPLACE FUNCTION public.realtime_is_game_topic_player(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _game_id uuid;
BEGIN
  IF _topic IS NULL OR position(':' in _topic) = 0 THEN
    RETURN false;
  END IF;
  BEGIN
    _game_id := split_part(_topic, ':', 2)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN public.is_game_player(_game_id);
END;
$$;

-- Helper: notification topic format "notifications:<user_uuid>"
CREATE OR REPLACE FUNCTION public.realtime_is_notification_topic_owner(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
BEGIN
  IF _topic IS NULL OR position(':' in _topic) = 0 THEN
    RETURN false;
  END IF;
  BEGIN
    _user_id := split_part(_topic, ':', 2)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN _user_id = auth.uid();
END;
$$;

DROP POLICY IF EXISTS "Authenticated can read realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated can read realtime messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Public/system topics anyone signed in can listen on (postgres_changes
  -- on tables already enforce their own RLS for row visibility).
  (extension = 'postgres_changes')
  OR public.realtime_is_game_topic_player(topic)
  OR public.realtime_is_notification_topic_owner(topic)
);

DROP POLICY IF EXISTS "Authenticated can send realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated can send realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.realtime_is_game_topic_player(topic)
  OR public.realtime_is_notification_topic_owner(topic)
);
