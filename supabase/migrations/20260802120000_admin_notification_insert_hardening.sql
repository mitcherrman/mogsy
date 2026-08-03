-- NOT1 Phase 1 — secure direct client INSERTs into admin_notifications.
--
-- Before this migration the INSERT policy was:
--
--   TO authenticated
--   WITH CHECK (auth.uid() IS NOT NULL
--               AND type = ANY (ARRAY['image_report','mod_delete_request',
--                                     'comment_report','user_report','feedback']))
--
-- Anonymous sign-in is enabled on this project, and an anonymous session carries
-- the `authenticated` role. So *any visitor* could write rows into the moderation
-- queue with arbitrary title/message/metadata, unrated and unattributed.
--
-- Every existing producer was traced before narrowing the policy:
--
--   1. check_and_auto_hide_image()    (image_reports AFTER INSERT)
--   2. check_and_auto_hide_comment()  (comment_reports AFTER INSERT)
--   3. notify_admins_on_feedback()    (feedback AFTER INSERT)
--   4. notify_admins_on_user_report() (user_reports AFTER INSERT)
--        -> All four are SECURITY DEFINER and owned by the table owner. No table
--           here sets FORCE ROW LEVEL SECURITY, so the owner bypasses RLS and
--           these paths are unaffected by any policy change. They keep working.
--
--   5. src/pages/AdminPlay.tsx  -> type 'mod_delete_request', sent by a MODERATOR
--        -> A genuine privileged workflow: moderators request a delete, admins
--           approve it in AdminModeratorConfig. This is the one direct client
--           insert the product actually needs, so the new policy preserves it
--           and pins it to that single type.
--
--   6. src/pages/SwipePreset.tsx -> type 'image_report', sent by ANY user
--        -> This is the path that forced the policy open. It is replaced below:
--           the per-report notification now comes from the trigger that already
--           fires on the same INSERT, exactly as the per-report 'comment_report'
--           notification does since 20260523081658. The client insert is removed
--           in the same commit, so behaviour is preserved with no client rights.

-- 1) Emit the per-report image notification from the trigger instead of the client.
--    Mirrors check_and_auto_hide_comment(). The >= 10 auto-hide branch below is
--    unchanged from 20260224071249.
CREATE OR REPLACE FUNCTION public.check_and_auto_hide_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _report_count integer;
  _item_name text;
  _item_id uuid;
BEGIN
  SELECT COUNT(*) INTO _report_count
  FROM public.image_reports
  WHERE image_id = NEW.image_id;

  SELECT pi.name, pi.id INTO _item_name, _item_id
  FROM public.preset_items pi
  JOIN public.preset_item_images pii ON pii.preset_item_id = pi.id
  WHERE pii.id = NEW.image_id;

  -- Per-report notification so admins see incoming reports immediately.
  -- Replaces the direct client insert that used to live in SwipePreset.tsx.
  INSERT INTO public.admin_notifications (type, title, message, metadata)
  VALUES (
    'image_report',
    'Image reported: ' || COALESCE(left(_item_name, 100), 'Unknown'),
    'A user reported an image for "' || COALESCE(left(_item_name, 100), 'Unknown')
      || '" as not representative. (' || _report_count || ' total)',
    jsonb_build_object('image_id', NEW.image_id, 'item_id', _item_id,
                       'report_count', _report_count)
  );

  -- Auto-hide if threshold reached
  IF _report_count >= 10 THEN
    UPDATE public.preset_item_images
    SET is_hidden = true
    WHERE id = NEW.image_id AND is_hidden = false;

    -- Only notify if we actually hid it (wasn't already hidden)
    IF FOUND THEN
      INSERT INTO public.admin_notifications (type, title, message, metadata)
      VALUES (
        'image_report_critical',
        'Image auto-hidden: ' || COALESCE(left(_item_name, 100), 'Unknown'),
        'An image for "' || COALESCE(left(_item_name, 100), 'Unknown') || '" received '
          || _report_count || ' reports and was automatically hidden.',
        jsonb_build_object('image_id', NEW.image_id, 'report_count', _report_count)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE preserves the existing ACL, but re-assert it so the grant
-- state is readable from this migration alone.
REVOKE EXECUTE ON FUNCTION public.check_and_auto_hide_image() FROM anon, authenticated, public;

-- 2) Narrow the INSERT policy to the single workflow that genuinely needs a
--    direct client write. Anonymous and ordinary authenticated sessions no
--    longer hold INSERT on this table at all.
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.admin_notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.admin_notifications;
DROP POLICY IF EXISTS "Authenticated users can insert allowed notification types" ON public.admin_notifications;

CREATE POLICY "Moderators can raise delete requests"
  ON public.admin_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    type = 'mod_delete_request'
    AND (
      public.has_role(auth.uid(), 'moderator'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'master_admin'::app_role)
    )
  );

-- SELECT / UPDATE policies are deliberately untouched: both already require
-- has_role(auth.uid(), 'admin'). Per-admin read state is a later phase.

-- 3) Index the unread/recent access pattern used by AdminNotifications,
--    UserNotificationBell's admin section and AdminDiagnostics' unread count.
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread_recent
  ON public.admin_notifications (is_read, created_at DESC);
