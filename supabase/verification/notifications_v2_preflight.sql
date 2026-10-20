-- ===========================================================================
-- NOTIFICATIONS 2.0 — PREFLIGHT. READ-ONLY. Run BEFORE the migration.
--
-- Answers "what will the cleanup do to the inboxes?" from today's data, using
-- the same rules as 20261019120000_notifications_v2_lifecycle.sql. Nothing is
-- written. One row comes back so the Supabase SQL Editor shows all of it.
--
-- The backfill DELETES NOTHING. Every number below is a row that changes
-- inbox placement (expired / resolved / merged), and every such row stays
-- queryable under Completed (admins) or History (players).
--
-- For an exact dry run instead of an estimate:
--   BEGIN;
--   <paste the migration>
--   <paste notifications_v2_verify.sql>
--   ROLLBACK;
-- ===========================================================================
WITH a AS (
  SELECT n.*,
    CASE
      WHEN n.type IN ('comment_report','image_report','image_report_critical','user_report','mod_delete_request','mod_action') THEN 'action'
      WHEN n.type = 'feedback' AND f.entry_intent IN ('question_report','page_report') THEN 'action'
      WHEN n.type = 'feedback' AND f.type = 'bug' AND f.severity = 'blocking' THEN 'action'
      WHEN n.type = 'feedback' THEN 'community'
      ELSE 'platform'
    END AS category,
    f.status AS fb_status, f.is_archived AS fb_archived, f.id AS fb_id
  FROM public.admin_notifications n
  LEFT JOIN public.feedback f ON f.id::text = n.metadata ->> 'feedback_id'
),
u AS (
  SELECT n.*,
    CASE
      WHEN n.type IN ('friend_request','friend_accepted') THEN 'social'
      WHEN n.type IN ('comment_reply','comment_reaction') THEN 'comment'
      WHEN n.type = 'warning' THEN 'account'
      WHEN n.type IN ('general','update','lol_quiz','quiz_broadcast','combat_lab','lol_patch','esports_quiz','lol_site_notice') THEN 'announcement'
      WHEN n.type IN ('new_item','elo_milestone','new_league','promotion','spotlight') THEN 'legacy'
      ELSE 'other'
    END AS category
  FROM public.user_notifications n
)
SELECT
  (SELECT count(*) FROM a)                                                    AS admin_rows_total,
  (SELECT count(*) FROM a WHERE category = 'action')                          AS admin_action_rows,
  (SELECT count(*) FROM a WHERE category = 'community')                       AS admin_community_rows,
  (SELECT count(*) FROM a WHERE category = 'platform')                        AS admin_platform_rows,
  (SELECT count(*) FROM a WHERE category = 'community' AND created_at < now() - interval '30 days') AS admin_community_will_expire,
  (SELECT count(*) FROM a WHERE category = 'platform'  AND created_at < now() - interval '7 days')  AS admin_platform_will_expire,
  (SELECT count(*) FROM a WHERE type IN ('mod_delete_request','mod_action') AND is_read)            AS mod_requests_resolved,
  (SELECT count(*) FROM a WHERE type = 'feedback' AND (fb_status IN ('completed','declined') OR fb_archived)) AS feedback_resolved,
  (SELECT count(*) FROM a WHERE type = 'feedback' AND fb_id IS NULL)                                AS feedback_subject_missing,
  -- Alerts whose record is gone. The migration KEEPS each one and resolves it
  -- as 'subject_deleted' (Completed, "Record deleted"), tagged
  -- metadata.resolution_source = 'v2_backfill_missing_subject'. Listed so the
  -- owner can see exactly which rows that is.
  (SELECT string_agg(a.id::text || ' (' || a.type || ', ' || to_char(a.created_at, 'YYYY-MM-DD') || ')', '; ' ORDER BY a.created_at)
     FROM a
    WHERE (a.type = 'feedback' AND a.fb_id IS NULL)
       OR (a.type = 'user_report' AND NOT EXISTS (
             SELECT 1 FROM public.user_reports r WHERE r.id::text = a.metadata ->> 'user_report_id'))
       OR (a.type = 'comment_report' AND NOT EXISTS (
             SELECT 1 FROM public.comments c WHERE c.id::text = a.metadata ->> 'comment_id')))  AS missing_subject_notifications,
  (SELECT count(*) FROM a JOIN public.user_reports r ON r.id::text = a.metadata ->> 'user_report_id'
     WHERE a.type = 'user_report' AND r.status <> 'pending')                                        AS user_reports_resolved,
  (SELECT count(*) - count(DISTINCT metadata ->> 'comment_id') FROM a WHERE type = 'comment_report') AS comment_reports_merged,
  (SELECT count(*) - count(DISTINCT metadata ->> 'image_id') FROM a WHERE type IN ('image_report','image_report_critical')) AS image_reports_merged,
  -- What stays in Action Required: the number the owner should expect to see.
  (SELECT count(*) FROM a WHERE category = 'action'
     AND NOT (type IN ('mod_delete_request','mod_action') AND is_read)
     AND NOT (type = 'feedback' AND (fb_status IN ('completed','declined') OR fb_archived))) AS action_required_upper_bound,
  (SELECT min(created_at) FROM a WHERE category = 'action')                   AS oldest_action_row,
  (SELECT count(*) FROM u)                                                    AS user_rows_total,
  (SELECT count(*) FROM u WHERE category = 'legacy')                          AS user_legacy_rows_hidden,
  (SELECT count(*) FROM u WHERE category = 'announcement' AND created_at < now() - interval '30 days') AS user_announcements_will_expire,
  (SELECT count(*) FROM u LEFT JOIN public.friendships f ON f.id::text = u.metadata ->> 'friendship_id'
     WHERE u.type = 'friend_request' AND (f.id IS NULL OR f.status <> 'pending'))                   AS friend_requests_no_longer_actionable,
  (SELECT count(*) FROM public.admin_notification_reads)                      AS admin_receipts_untouched,
  (SELECT count(*) FROM public.user_notification_reads)                       AS user_receipts_untouched;
