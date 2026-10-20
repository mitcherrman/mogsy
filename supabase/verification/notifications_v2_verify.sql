-- ===========================================================================
-- NOTIFICATIONS 2.0 — VERIFY. Run AFTER the migration commits (read-only).
-- Every *_ok column must be true; the counts describe the new inboxes.
-- ===========================================================================
SELECT
  -- Every row classified.
  NOT EXISTS (SELECT 1 FROM public.admin_notifications WHERE category IS NULL OR priority IS NULL) AS admin_classified_ok,
  NOT EXISTS (SELECT 1 FROM public.user_notifications  WHERE category IS NULL)                     AS user_classified_ok,
  -- Unresolved action work never carries an expiry.
  NOT EXISTS (SELECT 1 FROM public.admin_notifications
              WHERE category = 'action' AND resolved_at IS NULL AND expires_at IS NOT NULL)        AS action_never_expires_ok,
  -- At most one open item per deduplicated subject.
  NOT EXISTS (SELECT dedupe_key FROM public.admin_notifications
              WHERE dedupe_key IS NOT NULL AND resolved_at IS NULL
              GROUP BY dedupe_key HAVING count(*) > 1)                                             AS dedupe_ok,
  -- is_read still means disposition, and every disposition is mirrored.
  NOT EXISTS (SELECT 1 FROM public.admin_notifications
              WHERE type IN ('mod_delete_request','mod_action') AND is_read AND resolved_at IS NULL) AS disposition_mirrored_ok,
  -- RLS on, minimal grants, no client DELETE/TRUNCATE on state.
  (SELECT bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
    WHERE s.nspname = 'public'
      AND c.relname IN ('admin_notification_states','user_notification_states','notification_preferences')) AS rls_ok,
  NOT has_table_privilege('authenticated', 'public.admin_notification_states', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.admin_notification_states', 'TRUNCATE')
    AND NOT has_table_privilege('authenticated', 'public.user_notification_states', 'TRUNCATE')
    AND NOT has_table_privilege('anon', 'public.user_notification_states', 'SELECT')               AS grants_ok,
  NOT has_function_privilege('anon', 'public.get_my_notifications(text, integer, timestamptz, uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.admin_get_notifications(text, integer, integer, timestamptz, uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.set_my_notification_state(uuid[], text)', 'EXECUTE') AS function_grants_ok,
  (SELECT count(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
     AND tablename IN ('admin_notification_states','user_notification_states','user_notification_reads')) = 3 AS realtime_ok,
  (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (
     'admin_notifications_v2_classify','user_notifications_v2_classify','admin_notification_states_guard',
     'admin_notifications_v2_disposition','feedback_v2_notification_sync','user_reports_v2_notification_sync',
     'comments_v2_notification_sync','friendships_v2_notification_sync')) = 8                    AS triggers_ok,
  (to_regclass('public.preset_item_images') IS NULL OR EXISTS (
     SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'preset_item_images_v2_notification_sync')) AS image_trigger_ok,
  NOT has_function_privilege('anon', 'public.admin_get_notification(uuid)', 'EXECUTE')                AS permalink_grant_ok,
  -- The shape of the new inboxes (shared view; per-admin read/done is personal).
  (SELECT count(*) FROM public.admin_notifications WHERE category = 'action' AND resolved_at IS NULL) AS action_required_open,
  (SELECT count(*) FROM public.admin_notifications WHERE category = 'community' AND resolved_at IS NULL
     AND (expires_at IS NULL OR expires_at > now()))                                              AS community_open,
  (SELECT count(*) FROM public.admin_notifications WHERE category = 'platform' AND resolved_at IS NULL
     AND (expires_at IS NULL OR expires_at > now()))                                              AS platform_open,
  (SELECT count(*) FROM public.admin_notifications WHERE resolution = 'merged')                    AS merged_duplicates,
  (SELECT count(*) FROM public.user_notifications WHERE target_type = 'all'
     AND category IN ('announcement','account','security') AND (expires_at IS NULL OR expires_at > now())) AS live_broadcasts;
