
-- Helper: returns true only if the topic is an admin-scoped channel AND caller is admin
CREATE OR REPLACE FUNCTION public.realtime_is_admin_topic(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _topic IS NULL THEN RETURN false; END IF;
  IF _topic NOT LIKE 'admin-%' AND _topic NOT LIKE 'bell-admin-%' THEN
    RETURN false;
  END IF;
  RETURN public.has_role(auth.uid(), 'admin');
END;
$$;

-- Replace existing realtime SELECT policy to also allow admin-scoped channels for admins only
DROP POLICY IF EXISTS "Realtime postgres_changes scoped to participants" ON realtime.messages;
CREATE POLICY "Realtime postgres_changes scoped to participants"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (extension = 'broadcast')
  OR (extension = 'presence')
  OR (
    extension = 'postgres_changes'
    AND (
      public.realtime_is_game_topic_player(topic)
      OR public.realtime_is_notification_topic_owner(topic)
      OR public.realtime_is_admin_topic(topic)
    )
  )
);
