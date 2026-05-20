-- Tighten user_notifications SELECT so targeted notifications are only visible to their intended recipient
DROP POLICY IF EXISTS "Authenticated can read broadcast notifications" ON public.user_notifications;

CREATE POLICY "Users can read broadcast or own targeted notifications"
ON public.user_notifications
FOR SELECT
TO authenticated
USING (
  target_type = 'all'
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (profile_id IS NOT NULL AND public.is_profile_owner(profile_id))
);