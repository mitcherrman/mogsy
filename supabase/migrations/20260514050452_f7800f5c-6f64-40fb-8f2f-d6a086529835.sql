DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.admin_notifications;

CREATE POLICY "Authenticated users can insert allowed notification types"
  ON public.admin_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND type IN ('image_report', 'mod_delete_request')
  );