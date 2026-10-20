-- ===========================================================================
-- NOTIFICATIONS 2.0 — ROLLBACK of 20261019120000_notifications_v2_lifecycle.sql
--
-- Restores the pre-v2 schema and behaviour. Apply as `postgres` in the SQL
-- Editor inside BEGIN/COMMIT, and redeploy the previous frontend first (the
-- v2 frontend falls back to the legacy reads when its RPCs are missing, so
-- order is forgiving, but lifecycle actions disappear with the RPCs).
--
-- WHAT IS LOST: per-user Done/Saved state and player preferences (their tables
-- are dropped) and the v2 columns on the notification tables. NO notification
-- row and NO read receipt is deleted — the v2 migration never deleted any, so
-- every row it expired, resolved or merged reappears in the legacy inboxes.
-- To keep a copy of the lost state, first run:
--   CREATE TABLE private.nv2_admin_states_backup AS TABLE public.admin_notification_states;
--   CREATE TABLE private.nv2_user_states_backup  AS TABLE public.user_notification_states;
--   CREATE TABLE private.nv2_prefs_backup        AS TABLE public.notification_preferences;
-- ===========================================================================

DROP TRIGGER IF EXISTS admin_notifications_v2_classify    ON public.admin_notifications;
DROP TRIGGER IF EXISTS admin_notifications_v2_disposition ON public.admin_notifications;
DROP TRIGGER IF EXISTS user_notifications_v2_classify     ON public.user_notifications;
DROP TRIGGER IF EXISTS feedback_v2_notification_sync      ON public.feedback;
DROP TRIGGER IF EXISTS user_reports_v2_notification_sync  ON public.user_reports;
DROP TRIGGER IF EXISTS comments_v2_notification_sync      ON public.comments;
DROP TRIGGER IF EXISTS friendships_v2_notification_sync   ON public.friendships;

DROP FUNCTION IF EXISTS public.admin_get_notifications(text, integer, integer, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.admin_notification_counts();
DROP FUNCTION IF EXISTS public.admin_set_notification_state(uuid[], text, text);
DROP FUNCTION IF EXISTS public.admin_resolve_notifications(uuid[], text);
DROP FUNCTION IF EXISTS public.admin_reopen_notification(uuid);
DROP FUNCTION IF EXISTS public.get_my_notifications(text, integer, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.get_my_notification_summary();
DROP FUNCTION IF EXISTS public.set_my_notification_state(uuid[], text);
DROP FUNCTION IF EXISTS public.set_my_notification_preferences(text[]);

-- admin_unread_notification_count() back to its 20260803121000 body BEFORE
-- the row source it now reads is dropped.
CREATE OR REPLACE FUNCTION public.admin_unread_notification_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*)::int INTO _count
  FROM public.admin_notifications n
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.admin_notification_reads r
    WHERE r.notification_id = n.id
      AND r.admin_user_id = auth.uid()
  );

  RETURN _count;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_notification_inbox_rows();
DROP FUNCTION IF EXISTS public.my_notification_inbox_rows();
DROP FUNCTION IF EXISTS public.admin_notifications_v2_classify();
DROP FUNCTION IF EXISTS public.admin_notifications_v2_disposition();
DROP FUNCTION IF EXISTS public.user_notifications_v2_classify();
DROP FUNCTION IF EXISTS public.feedback_v2_notification_sync();
DROP FUNCTION IF EXISTS public.user_reports_v2_notification_sync();
DROP FUNCTION IF EXISTS public.comments_v2_notification_sync();
DROP FUNCTION IF EXISTS public.friendships_v2_notification_sync();
DROP FUNCTION IF EXISTS public.admin_notifications_v2_sync(text, text, boolean, text, text);
DROP FUNCTION IF EXISTS public.notification_admin_profile(uuid, text, jsonb, text, text, text);
DROP FUNCTION IF EXISTS public.notification_user_profile(text, text, jsonb);
DROP FUNCTION IF EXISTS public.notification_feedback_digest(uuid);

DROP TABLE IF EXISTS public.admin_notification_states;   -- drops its trigger, policies, publication membership
DROP TABLE IF EXISTS public.user_notification_states;
DROP TABLE IF EXISTS public.notification_preferences;
DROP FUNCTION IF EXISTS public.admin_notification_states_guard();
DROP FUNCTION IF EXISTS public.notification_priority_rank(text);
DROP FUNCTION IF EXISTS public.notification_try_uuid(text);

DROP POLICY IF EXISTS "Admins can refresh own admin notification receipts" ON public.admin_notification_reads;
REVOKE UPDATE (read_at) ON public.admin_notification_reads FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public' AND tablename = 'user_notification_reads') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.user_notification_reads;
  END IF;
END
$$;

-- feedback_update rows were created by v2; the legacy bell never rendered the
-- type (deny-by-default allowlist), so they are inert and are kept as history.

DROP INDEX IF EXISTS public.idx_admin_notifications_open_by_category;
DROP INDEX IF EXISTS public.idx_admin_notifications_activity;
DROP INDEX IF EXISTS public.idx_admin_notifications_subject;
DROP INDEX IF EXISTS public.idx_admin_notifications_open_dedupe;
DROP INDEX IF EXISTS public.idx_user_notifications_targeted;
DROP INDEX IF EXISTS public.idx_user_notifications_broadcast;
DROP INDEX IF EXISTS public.idx_user_notifications_subject;

ALTER TABLE public.admin_notifications
  DROP CONSTRAINT IF EXISTS admin_notifications_category_check,
  DROP CONSTRAINT IF EXISTS admin_notifications_priority_check,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS subject_type,
  DROP COLUMN IF EXISTS subject_id,
  DROP COLUMN IF EXISTS dedupe_key,
  DROP COLUMN IF EXISTS occurrence_count,
  DROP COLUMN IF EXISTS activity_at,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS resolved_at,
  DROP COLUMN IF EXISTS resolved_by,
  DROP COLUMN IF EXISTS resolution;

ALTER TABLE public.user_notifications
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS subject_type,
  DROP COLUMN IF EXISTS subject_id,
  DROP COLUMN IF EXISTS activity_at,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS resolved_at,
  DROP COLUMN IF EXISTS resolution;
