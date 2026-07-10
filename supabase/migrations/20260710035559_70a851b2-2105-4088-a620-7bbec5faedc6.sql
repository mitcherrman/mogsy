DROP POLICY IF EXISTS "Realtime postgres_changes scoped to participants" ON realtime.messages;

CREATE POLICY "Realtime scoped to participants"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    extension = 'postgres_changes'
    AND (
      public.realtime_is_game_topic_player(topic)
      OR public.realtime_is_notification_topic_owner(topic)
      OR public.realtime_is_admin_topic(topic)
    )
  )
  OR (
    extension IN ('broadcast', 'presence')
    AND (
      public.realtime_is_game_topic_player(topic)
      OR public.realtime_is_notification_topic_owner(topic)
      OR public.realtime_is_admin_topic(topic)
    )
  )
);