-- ===========================================================================
-- NOTIFICATIONS 2.0 (issue #92) — one lifecycle for admin and player inboxes.
--
-- WHAT WAS WRONG
--
--   * A notification could only ever be unread or read. Nothing left an inbox:
--     "Mark all read" cleared the dot and left every row in place, so both the
--     bell and /admin/operations?section=notifications grew without bound.
--   * Both surfaces read the latest N rows (30 / 50) and filtered afterwards.
--     A burst of old or suppressed rows therefore STARVED newer and more
--     important ones out of the window — the page could look empty while an
--     unresolved report sat at row 51.
--   * "Read" and "resolved" were conflated. A report that had been looked at
--     looked handled; a report that had been handled stayed in the queue.
--   * Ten reports on one comment were ten separate rows.
--
-- WHAT THIS ADDS (additive only — no row is deleted, no column dropped)
--
--   Lifecycle, per RECIPIENT (never global):
--     unread   no read receipt, or the receipt predates new activity on the row
--     read     receipt exists (existing receipt tables, unchanged meaning)
--     done     *_notification_states.done_at  — leaves MY active inbox only
--     saved    *_notification_states.saved_at — kept, survives expiry
--   Lifecycle, per NOTIFICATION (shared):
--     expired  expires_at <= now(); category-based default set on insert
--     resolved resolved_at — the UNDERLYING issue was handled, synced from the
--              workflow that owns it (feedback status, user_reports status,
--              comment moderation, friendship state, mod-request disposition)
--
--   Admin categories: action (reports, moderation, critical problems — NEVER
--   expire, cannot be marked done while unresolved), community (feedback and
--   suggestions, 30 days), platform (routine, 7 days).
--   Player categories: social, feedback, progress, announcement (all mutable
--   by the player), account and security (never mutable).
--
--   Server-side inbox RPCs filter BEFORE they paginate (keyset, not offset), so
--   done / expired / muted rows can never consume the page.
--
-- WHAT IS PRESERVED
--
--   * admin_notification_reads remains the ONLY source of admin read state, one
--     row per (notification, admin), written for auth.uid() only.
--   * admin_notifications.is_read keeps its single meaning: moderator-request
--     disposition. It is not read or written here except by the BEFORE UPDATE
--     trigger that mirrors a disposition into resolved_at.
--   * Every existing producer (the SECURITY DEFINER report/feedback/social
--     triggers) is untouched. Classification happens in BEFORE INSERT triggers
--     that cannot fail the producer: every lookup is wrapped so a notification
--     bug can never block a player's report.
--   * The old frontend keeps working against this schema unchanged (it selects
--     explicit columns and upserts receipts with ignoreDuplicates).
--
-- Apply as `postgres`, in the Supabase SQL Editor, wrapped in BEGIN/COMMIT.
-- Do NOT use `supabase db push`: repo and remote ledger have drifted versions.
-- Preflight (read-only scope report): supabase/verification/notifications_v2_preflight.sql
-- Verification:                       supabase/verification/notifications_v2_verify.sql
-- Rollback:                           supabase/verification/notifications_v2_rollback.sql
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------

-- A uuid from untrusted jsonb text, or NULL. Producers write uuids, but the
-- classifier must never raise on a malformed metadata value.
CREATE OR REPLACE FUNCTION public.notification_try_uuid(_value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF _value IS NULL OR _value = '' THEN
    RETURN NULL;
  END IF;
  RETURN _value::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_priority_rank(_priority text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _priority
    WHEN 'critical' THEN 0
    WHEN 'urgent'   THEN 0
    WHEN 'high'     THEN 1
    WHEN 'normal'   THEN 2
    ELSE 3
  END
$$;

REVOKE ALL ON FUNCTION public.notification_try_uuid(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_priority_rank(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_priority_rank(text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 1. Shared lifecycle columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS category         text,
  ADD COLUMN IF NOT EXISTS priority         text,
  ADD COLUMN IF NOT EXISTS subject_type     text,
  ADD COLUMN IF NOT EXISTS subject_id       text,
  ADD COLUMN IF NOT EXISTS dedupe_key       text,
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS activity_at      timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at       timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by      uuid,
  ADD COLUMN IF NOT EXISTS resolution       text;

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS category     text,
  ADD COLUMN IF NOT EXISTS subject_type text,
  ADD COLUMN IF NOT EXISTS subject_id   text,
  ADD COLUMN IF NOT EXISTS activity_at  timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at   timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS resolution   text;

COMMENT ON COLUMN public.admin_notifications.category IS
  'action | community | platform. action = reports, moderation, critical problems: '
  'never expires and cannot be marked done while unresolved.';
COMMENT ON COLUMN public.admin_notifications.resolved_at IS
  'The UNDERLYING issue was handled (shared by all admins). Not read state, not '
  'done state. Synced from the owning workflow; see notifications_v2 migration.';
COMMENT ON COLUMN public.admin_notifications.activity_at IS
  'Last time something happened on this item. A deduplicated repeat bumps it, '
  'which makes the item unread again for an admin whose receipt is older.';
COMMENT ON COLUMN public.user_notifications.category IS
  'social | feedback | progress | announcement | account | security | comment | legacy | other. '
  'Only the first six are ever shown to players; account/security cannot be muted.';


-- ---------------------------------------------------------------------------
-- 2. Classification — the single statement of the category/expiry policy.
--    src/lib/notifications/policy.ts mirrors it and a test pins the two.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notification_admin_profile(
  _id uuid,
  _type text,
  _metadata jsonb,
  _feedback_intent text,
  _feedback_type text,
  _feedback_severity text
)
RETURNS TABLE (category text, priority text, subject_type text, subject_id text, dedupe_key text, ttl interval)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    v.category, v.priority, v.subject_type, v.subject_id, v.dedupe_key,
    CASE v.category
      WHEN 'action'    THEN NULL::interval
      WHEN 'community' THEN interval '30 days'
      ELSE interval '7 days'
    END
  FROM (
    SELECT
      CASE
        WHEN _type IN ('comment_report', 'image_report', 'image_report_critical',
                       'user_report', 'mod_delete_request', 'mod_action')
          THEN 'action'
        WHEN _type = 'feedback' AND (
               _feedback_intent IN ('question_report', 'page_report')
            OR (_feedback_type = 'bug' AND _feedback_severity = 'blocking'))
          THEN 'action'
        WHEN _type = 'feedback' THEN 'community'
        ELSE 'platform'
      END AS category,
      CASE
        WHEN _type = 'image_report_critical' THEN 'critical'
        WHEN _type = 'comment_report' AND COALESCE((_metadata ->> 'auto_hidden')::boolean, false) THEN 'critical'
        WHEN _type = 'feedback' AND _feedback_type = 'bug' AND _feedback_severity = 'blocking' THEN 'critical'
        WHEN _type IN ('comment_report', 'user_report', 'mod_delete_request', 'mod_action') THEN 'high'
        WHEN _type = 'feedback' AND (_feedback_intent IN ('question_report', 'page_report')
                                     OR _feedback_severity = 'major') THEN 'high'
        WHEN _type = 'image_report' THEN 'normal'
        WHEN _type = 'feedback' THEN 'normal'
        ELSE 'low'
      END AS priority,
      CASE
        WHEN _type = 'comment_report' THEN 'comment'
        WHEN _type IN ('image_report', 'image_report_critical') THEN 'image'
        WHEN _type = 'user_report' THEN 'user_report'
        WHEN _type IN ('mod_delete_request', 'mod_action') THEN 'mod_request'
        WHEN _type = 'feedback' THEN 'feedback'
      END AS subject_type,
      CASE
        WHEN _type = 'comment_report' THEN _metadata ->> 'comment_id'
        WHEN _type IN ('image_report', 'image_report_critical') THEN _metadata ->> 'image_id'
        WHEN _type = 'user_report' THEN _metadata ->> 'user_report_id'
        WHEN _type IN ('mod_delete_request', 'mod_action') THEN _id::text
        WHEN _type = 'feedback' THEN _metadata ->> 'feedback_id'
      END AS subject_id,
      -- Only per-report rows about the SAME thing collapse. Feedback and user
      -- reports carry their own per-row workflow status, so they never merge.
      CASE
        WHEN _type = 'comment_report' AND _metadata ? 'comment_id'
          THEN 'comment:' || (_metadata ->> 'comment_id')
        WHEN _type IN ('image_report', 'image_report_critical') AND _metadata ? 'image_id'
          THEN 'image:' || (_metadata ->> 'image_id')
      END AS dedupe_key
  ) v
$$;

CREATE OR REPLACE FUNCTION public.notification_user_profile(_type text, _priority text, _metadata jsonb)
RETURNS TABLE (category text, subject_type text, subject_id text, ttl interval)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    v.category, v.subject_type, v.subject_id,
    CASE
      WHEN v.category = 'legacy' THEN interval '0'
      WHEN _type = 'friend_request' THEN interval '30 days'
      WHEN v.category IN ('social', 'comment', 'other') THEN interval '7 days'
      WHEN v.category IN ('account', 'security') THEN interval '90 days'
      WHEN v.category = 'announcement' AND _priority = 'low' THEN interval '7 days'
      ELSE interval '30 days'
    END
  FROM (
    SELECT
      CASE
        WHEN _type IN ('friend_request', 'friend_accepted') THEN 'social'
        WHEN _type IN ('comment_reply', 'comment_reaction') THEN 'comment'
        WHEN _type = 'feedback_update' THEN 'feedback'
        WHEN _type IN ('achievement_unlocked', 'progression_milestone') THEN 'progress'
        WHEN _type = 'warning' THEN 'account'
        WHEN _type = 'security_notice' THEN 'security'
        WHEN _type IN ('general', 'update', 'lol_quiz', 'quiz_broadcast', 'combat_lab',
                       'lol_patch', 'esports_quiz', 'lol_site_notice') THEN 'announcement'
        WHEN _type IN ('new_item', 'elo_milestone', 'new_league', 'promotion', 'spotlight') THEN 'legacy'
        ELSE 'other'
      END AS category,
      CASE
        WHEN _type = 'friend_request' THEN 'friendship'
        WHEN _type = 'feedback_update' THEN 'feedback'
      END AS subject_type,
      CASE
        WHEN _type = 'friend_request' THEN _metadata ->> 'friendship_id'
        WHEN _type = 'feedback_update' THEN _metadata ->> 'feedback_id'
      END AS subject_id
  ) v
$$;

REVOKE ALL ON FUNCTION public.notification_admin_profile(uuid, text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_user_profile(text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Question/page-report context an admin needs to triage WITHOUT opening the
-- record: the problem, the question, the answers and whether evidence exists.
-- Bounded so a hostile report_context cannot bloat the admin feed.
CREATE OR REPLACE FUNCTION public.notification_feedback_digest(_feedback_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'entry_intent',     f.entry_intent,
    'type',             f.type,
    'severity',         f.severity,
    'status',           f.status,
    'reason',           left(f.report_context ->> 'reason', 40),
    'question_prompt',  left(f.report_context ->> 'prompt', 300),
    'selected_answer',  left(f.report_context ->> 'selected_answer', 160),
    'canonical_answer', left(f.report_context ->> 'canonical_answer', 160),
    'has_evidence',     (f.evidence_url IS NOT NULL OR f.screenshot_path IS NOT NULL
                         OR f.report_context ? 'answer_evidence'),
    'mode',             left(f.report_context ->> 'mode', 60),
    'page_url',         left(f.page_url, 200)
  ))
  FROM public.feedback f
  WHERE f.id = _feedback_id
$$;

REVOKE ALL ON FUNCTION public.notification_feedback_digest(uuid) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. BEFORE INSERT classifiers (+ admin deduplication)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_notifications_v2_classify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p record;
  _digest jsonb;
  _existing uuid;
BEGIN
  NEW.activity_at := COALESCE(NEW.activity_at, NEW.created_at, now());
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);

  BEGIN
    IF NEW.type = 'feedback' THEN
      _digest := public.notification_feedback_digest(
        public.notification_try_uuid(NEW.metadata ->> 'feedback_id'));
      IF _digest IS NOT NULL THEN
        NEW.metadata := NEW.metadata || jsonb_build_object('feedback', _digest);
      END IF;
    END IF;

    SELECT * INTO _p FROM public.notification_admin_profile(
      NEW.id, NEW.type, NEW.metadata,
      _digest ->> 'entry_intent', _digest ->> 'type', _digest ->> 'severity');

    NEW.category     := COALESCE(NEW.category, _p.category);
    NEW.priority     := COALESCE(NEW.priority, _p.priority);
    NEW.subject_type := COALESCE(NEW.subject_type, _p.subject_type);
    NEW.subject_id   := COALESCE(NEW.subject_id, _p.subject_id);
    NEW.dedupe_key   := COALESCE(NEW.dedupe_key, _p.dedupe_key);
    IF NEW.expires_at IS NULL AND _p.ttl IS NOT NULL THEN
      NEW.expires_at := NEW.activity_at + _p.ttl;
    END IF;

    -- Deduplicate onto the open item for the same subject. Serialised per key
    -- so two concurrent reports cannot both miss each other.
    IF NEW.dedupe_key IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('admin_notifications:' || NEW.dedupe_key));
      SELECT n.id INTO _existing
      FROM public.admin_notifications n
      WHERE n.dedupe_key = NEW.dedupe_key
        AND n.resolved_at IS NULL
      ORDER BY n.activity_at DESC
      LIMIT 1;

      IF _existing IS NOT NULL THEN
        UPDATE public.admin_notifications n
        SET activity_at      = now(),
            occurrence_count = n.occurrence_count + 1,
            title            = NEW.title,
            message          = NEW.message,
            metadata         = n.metadata || NEW.metadata,
            type             = CASE WHEN public.notification_priority_rank(NEW.priority)
                                         < public.notification_priority_rank(n.priority)
                                    THEN NEW.type ELSE n.type END,
            priority         = CASE WHEN public.notification_priority_rank(NEW.priority)
                                         < public.notification_priority_rank(n.priority)
                                    THEN NEW.priority ELSE n.priority END
        WHERE n.id = _existing;
        RETURN NULL;  -- merged; the producer's own row (the report) is unaffected
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    -- Never fail the producer. Fall back to a visible, never-expiring item.
    NEW.category := COALESCE(NEW.category, 'action');
    NEW.priority := COALESCE(NEW.priority, 'normal');
  END;

  NEW.category := COALESCE(NEW.category, 'platform');
  NEW.priority := COALESCE(NEW.priority, 'normal');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_notifications_v2_classify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p record;
BEGIN
  NEW.activity_at := COALESCE(NEW.activity_at, NEW.created_at, now());
  BEGIN
    SELECT * INTO _p FROM public.notification_user_profile(NEW.type, NEW.priority, COALESCE(NEW.metadata, '{}'::jsonb));
    NEW.category     := COALESCE(NEW.category, _p.category);
    NEW.subject_type := COALESCE(NEW.subject_type, _p.subject_type);
    NEW.subject_id   := COALESCE(NEW.subject_id, _p.subject_id);
    IF NEW.expires_at IS NULL AND _p.ttl IS NOT NULL THEN
      NEW.expires_at := NEW.activity_at + _p.ttl;
    END IF;
  EXCEPTION WHEN others THEN
    NEW.category := COALESCE(NEW.category, 'other');
  END;
  NEW.category := COALESCE(NEW.category, 'other');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_notifications_v2_classify() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_notifications_v2_classify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_notifications_v2_classify ON public.admin_notifications;
CREATE TRIGGER admin_notifications_v2_classify
  BEFORE INSERT ON public.admin_notifications
  FOR EACH ROW EXECUTE FUNCTION public.admin_notifications_v2_classify();

DROP TRIGGER IF EXISTS user_notifications_v2_classify ON public.user_notifications;
CREATE TRIGGER user_notifications_v2_classify
  BEFORE INSERT ON public.user_notifications
  FOR EACH ROW EXECUTE FUNCTION public.user_notifications_v2_classify();


-- ---------------------------------------------------------------------------
-- 4. Per-recipient state (done / saved). Read state stays in the receipt tables.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_notification_states (
  notification_id uuid NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  admin_user_id   uuid NOT NULL,
  done_at         timestamptz,
  saved_at        timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, admin_user_id)
);

CREATE TABLE IF NOT EXISTS public.user_notification_states (
  notification_id uuid NOT NULL REFERENCES public.user_notifications(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  done_at         timestamptz,
  saved_at        timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

COMMENT ON TABLE public.admin_notification_states IS
  'Per-admin done/saved state. One admin''s Done never changes another admin''s inbox. '
  'An unresolved action-category item cannot be marked done (trigger-enforced).';
COMMENT ON TABLE public.user_notification_states IS
  'Per-player done/saved state. Dismissing a broadcast never deletes it for anyone else.';

CREATE INDEX IF NOT EXISTS idx_admin_notification_states_admin
  ON public.admin_notification_states (admin_user_id, notification_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_states_user
  ON public.user_notification_states (user_id, notification_id);

ALTER TABLE public.admin_notification_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read own notification states" ON public.admin_notification_states;
CREATE POLICY "Admins read own notification states"
  ON public.admin_notification_states FOR SELECT TO authenticated
  USING (auth.uid() = admin_user_id AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins insert own notification states" ON public.admin_notification_states;
CREATE POLICY "Admins insert own notification states"
  ON public.admin_notification_states FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = admin_user_id AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins update own notification states" ON public.admin_notification_states;
CREATE POLICY "Admins update own notification states"
  ON public.admin_notification_states FOR UPDATE TO authenticated
  USING (auth.uid() = admin_user_id AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = admin_user_id AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users read own notification states" ON public.user_notification_states;
CREATE POLICY "Users read own notification states"
  ON public.user_notification_states FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- The EXISTS runs under the caller's own RLS on user_notifications, so a state
-- row can only be created for a notification the caller may already see.
DROP POLICY IF EXISTS "Users insert own notification states" ON public.user_notification_states;
CREATE POLICY "Users insert own notification states"
  ON public.user_notification_states FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.user_notifications n WHERE n.id = notification_id)
  );

DROP POLICY IF EXISTS "Users update own notification states" ON public.user_notification_states;
CREATE POLICY "Users update own notification states"
  ON public.user_notification_states FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No DELETE policy and no DELETE grant: "undone" clears done_at instead, so the
-- history of a decision is never silently erased by a client.
-- Same reasoning as 20260803121000: the default privileges hand `authenticated`
-- everything, including TRUNCATE (not filtered by RLS). Revoke, then grant the
-- minimum. UPDATE is column-scoped so the key can never be rewritten.
REVOKE ALL ON public.admin_notification_states FROM anon, authenticated;
REVOKE ALL ON public.user_notification_states FROM anon, authenticated;
GRANT SELECT, INSERT ON public.admin_notification_states TO authenticated;
GRANT SELECT, INSERT ON public.user_notification_states TO authenticated;
GRANT UPDATE (done_at, saved_at, updated_at) ON public.admin_notification_states TO authenticated;
GRANT UPDATE (done_at, saved_at, updated_at) ON public.user_notification_states TO authenticated;

-- Unresolved Action Required work cannot be "done" away — by the RPC or by a
-- direct write. It leaves the inbox by being resolved, never by being hidden.
CREATE OR REPLACE FUNCTION public.admin_notification_states_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the act of SETTING done is refused. A stale done_at left over from
  -- before a reopen is inert (the inbox ignores done on unresolved action
  -- items), and must not block saving the item.
  IF NEW.done_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.done_at IS NULL)
     AND EXISTS (
    SELECT 1 FROM public.admin_notifications n
    WHERE n.id = NEW.notification_id
      AND n.category = 'action'
      AND n.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'notification_unresolved_action: resolve the underlying item first'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_notification_states_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_notification_states_guard ON public.admin_notification_states;
CREATE TRIGGER admin_notification_states_guard
  BEFORE INSERT OR UPDATE ON public.admin_notification_states
  FOR EACH ROW EXECUTE FUNCTION public.admin_notification_states_guard();

-- Re-reading after new activity (a deduplicated repeat report) must move the
-- receipt forward. Own row, read_at only — the identity columns stay immutable
-- and there is still no DELETE, so "mark unread" remains a service-role act.
DROP POLICY IF EXISTS "Admins can refresh own admin notification receipts" ON public.admin_notification_reads;
CREATE POLICY "Admins can refresh own admin notification receipts"
  ON public.admin_notification_reads FOR UPDATE TO authenticated
  USING (auth.uid() = admin_user_id AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = admin_user_id AND public.has_role(auth.uid(), 'admin'::app_role));
GRANT UPDATE (read_at) ON public.admin_notification_reads TO authenticated;


-- ---------------------------------------------------------------------------
-- 5. Player preferences — optional categories only
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id          uuid PRIMARY KEY,
  muted_categories text[] NOT NULL DEFAULT '{}'::text[],
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- account and security are deliberately absent: they cannot be muted, by
  -- any client, by construction.
  CONSTRAINT notification_preferences_mutable_only
    CHECK (muted_categories <@ ARRAY['social', 'feedback', 'progress', 'announcement']::text[])
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users read own notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users insert own notification preferences"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users update own notification preferences"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.notification_preferences FROM anon, authenticated;
GRANT SELECT, INSERT ON public.notification_preferences TO authenticated;
GRANT UPDATE (muted_categories, updated_at) ON public.notification_preferences TO authenticated;


-- ---------------------------------------------------------------------------
-- 6. Resolution sync — the owning workflow decides "handled", never a read.
-- ---------------------------------------------------------------------------

-- 6a. Moderator request disposition (admin_resolve_mod_request sets is_read).
CREATE OR REPLACE FUNCTION public.admin_notifications_v2_disposition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.type IN ('mod_delete_request', 'mod_action')
     AND NEW.is_read AND NOT COALESCE(OLD.is_read, false)
     AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
    NEW.resolved_by := auth.uid();
    NEW.resolution  := CASE WHEN NEW.message LIKE '%[DENIED]' THEN 'denied' ELSE 'approved' END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_notifications_v2_disposition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_notifications_v2_disposition ON public.admin_notifications;
CREATE TRIGGER admin_notifications_v2_disposition
  BEFORE UPDATE OF is_read ON public.admin_notifications
  FOR EACH ROW EXECUTE FUNCTION public.admin_notifications_v2_disposition();

-- Shared resolve/reopen used by the sync triggers below. Reopen only touches
-- rows that were resolved BY A SYNC (never a manual admin resolution).
CREATE OR REPLACE FUNCTION public.admin_notifications_v2_sync(
  _subject_type text, _subject_id text, _resolved boolean, _resolution text, _status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _resolved THEN
    UPDATE public.admin_notifications n
    SET resolved_at = now(),
        resolved_by = auth.uid(),
        resolution  = _resolution,
        metadata    = CASE WHEN _status IS NULL THEN n.metadata
                           ELSE jsonb_set(COALESCE(n.metadata, '{}'::jsonb), '{feedback,status}', to_jsonb(_status), true) END
    WHERE n.subject_type = _subject_type AND n.subject_id = _subject_id AND n.resolved_at IS NULL;
  ELSE
    UPDATE public.admin_notifications n
    SET resolved_at = NULL, resolved_by = NULL, resolution = NULL, activity_at = now(),
        metadata    = CASE WHEN _status IS NULL THEN n.metadata
                           ELSE jsonb_set(COALESCE(n.metadata, '{}'::jsonb), '{feedback,status}', to_jsonb(_status), true) END
    WHERE n.subject_type = _subject_type AND n.subject_id = _subject_id
      AND n.resolved_at IS NOT NULL
      AND n.resolution IN ('completed', 'declined', 'archived', 'resolved_report', 'dismissed_report');
  END IF;
  -- Keep the review status shown in the inbox current even while still open.
  IF _status IS NOT NULL THEN
    UPDATE public.admin_notifications n
    SET metadata = jsonb_set(COALESCE(n.metadata, '{}'::jsonb), '{feedback,status}', to_jsonb(_status), true)
    WHERE n.subject_type = _subject_type AND n.subject_id = _subject_id
      AND (n.metadata #>> '{feedback,status}') IS DISTINCT FROM _status;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_notifications_v2_sync(text, text, boolean, text, text) FROM PUBLIC, anon, authenticated;

-- 6b. Feedback (including question and page reports). completed/declined or
--     archived = handled. Also tells the PLAYER their report moved, once per
--     status change, superseding the previous update for the same report.
CREATE OR REPLACE FUNCTION public.feedback_v2_notification_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _closed boolean;
  _label text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.admin_notifications_v2_sync('feedback', OLD.id::text, true, 'subject_deleted');
    RETURN OLD;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.is_archived IS NOT DISTINCT FROM OLD.is_archived THEN
    RETURN NEW;
  END IF;

  _closed := NEW.status IN ('completed', 'declined') OR COALESCE(NEW.is_archived, false);
  PERFORM public.admin_notifications_v2_sync(
    'feedback', NEW.id::text, _closed,
    CASE WHEN NEW.status IN ('completed', 'declined') THEN NEW.status ELSE 'archived' END,
    NEW.status);

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.profile_id IS NOT NULL
     AND NEW.status IN ('in-progress', 'planned', 'completed', 'declined') THEN
    _label := CASE NEW.status
      WHEN 'in-progress' THEN 'In progress'
      WHEN 'planned'     THEN 'Planned'
      WHEN 'completed'   THEN 'Resolved'
      WHEN 'declined'    THEN 'Closed'
    END;

    UPDATE public.user_notifications u
    SET resolved_at = now(), resolution = 'superseded'
    WHERE u.type = 'feedback_update'
      AND u.subject_type = 'feedback' AND u.subject_id = NEW.id::text
      AND u.resolved_at IS NULL;

    INSERT INTO public.user_notifications (
      title, message, type, profile_id, target_type, sent_by_user_id, is_sent,
      action_url, priority, metadata
    ) VALUES (
      'Update on your report: ' || _label,
      '"' || left(COALESCE(NULLIF(NEW.title, ''), 'Your submission'), 120) || '" is now ' || _label || '.',
      'feedback_update',
      NEW.profile_id,
      'user',
      public.system_notification_actor(),
      true,
      '/feedback',
      'normal',
      jsonb_build_object('feedback_id', NEW.id, 'status', NEW.status)
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN others THEN
  -- The admin's status change is the source of truth and must always land.
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.feedback_v2_notification_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS feedback_v2_notification_sync ON public.feedback;
CREATE TRIGGER feedback_v2_notification_sync
  AFTER UPDATE OF status, is_archived OR DELETE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.feedback_v2_notification_sync();

-- 6c. User reports — per-row status owned by AdminUserReports.
CREATE OR REPLACE FUNCTION public.user_reports_v2_notification_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.admin_notifications_v2_sync('user_report', OLD.id::text, true, 'subject_deleted');
    RETURN OLD;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.admin_notifications_v2_sync(
      'user_report', NEW.id::text, NEW.status <> 'pending',
      CASE WHEN NEW.status = 'dismissed' THEN 'dismissed_report' ELSE 'resolved_report' END);
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.user_reports_v2_notification_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_reports_v2_notification_sync ON public.user_reports;
CREATE TRIGGER user_reports_v2_notification_sync
  AFTER UPDATE OF status OR DELETE ON public.user_reports
  FOR EACH ROW EXECUTE FUNCTION public.user_reports_v2_notification_sync();

-- 6d. Comment moderation. An admin hide, an admin restore of an auto-hidden
--     comment, or a delete all mean the report was dealt with. The automatic
--     threshold hide (hidden_by_admin = false) is NOT a resolution: it is an
--     escalation, already raised to critical by the dedupe merge.
CREATE OR REPLACE FUNCTION public.comments_v2_notification_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.admin_notifications_v2_sync('comment', OLD.id::text, true, 'subject_deleted');
    RETURN OLD;
  END IF;
  IF NEW.hidden_by_admin AND NOT OLD.hidden_by_admin THEN
    PERFORM public.admin_notifications_v2_sync('comment', NEW.id::text, true, 'hidden_by_admin');
  ELSIF OLD.is_hidden AND NOT NEW.is_hidden THEN
    PERFORM public.admin_notifications_v2_sync('comment', NEW.id::text, true, 'restored');
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.comments_v2_notification_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS comments_v2_notification_sync ON public.comments;
CREATE TRIGGER comments_v2_notification_sync
  AFTER UPDATE OF is_hidden, hidden_by_admin OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comments_v2_notification_sync();

-- 6e. Friend requests stop being actionable the moment the request is
--     accepted, declined, cancelled or the friendship row disappears.
CREATE OR REPLACE FUNCTION public.friendships_v2_notification_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _resolution text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _id := OLD.id;
    _resolution := 'withdrawn';
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
    _id := NEW.id;
    _resolution := NEW.status;  -- accepted | declined
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.user_notifications u
  SET resolved_at = now(), resolution = _resolution
  WHERE u.type = 'friend_request'
    AND u.subject_type = 'friendship' AND u.subject_id = _id::text
    AND u.resolved_at IS NULL;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN others THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.friendships_v2_notification_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS friendships_v2_notification_sync ON public.friendships;
CREATE TRIGGER friendships_v2_notification_sync
  AFTER UPDATE OF status OR DELETE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.friendships_v2_notification_sync();


-- ---------------------------------------------------------------------------
-- 7. Inbox row sources (INVOKER: the caller's own RLS applies throughout)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_notification_inbox_rows()
RETURNS TABLE (
  id uuid, type text, category text, priority text, title text, message text,
  metadata jsonb, created_at timestamptz, activity_at timestamptz,
  occurrence_count integer, subject_type text, subject_id text,
  expires_at timestamptz, resolved_at timestamptz, resolution text,
  is_read boolean, done_at timestamptz, saved_at timestamptz,
  is_expired boolean, state text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    n.id, n.type, COALESCE(n.category, 'platform'), COALESCE(n.priority, 'normal'),
    n.title, n.message, COALESCE(n.metadata, '{}'::jsonb), n.created_at,
    COALESCE(n.activity_at, n.created_at), n.occurrence_count, n.subject_type, n.subject_id,
    n.expires_at, n.resolved_at, n.resolution,
    (r.read_at IS NOT NULL AND r.read_at >= COALESCE(n.activity_at, n.created_at)) AS is_read,
    s.done_at, s.saved_at,
    (n.expires_at IS NOT NULL AND n.expires_at <= now()) AS is_expired,
    CASE
      WHEN n.resolved_at IS NOT NULL THEN 'resolved'
      -- Unresolved Action Required work stays active whatever its age or state.
      WHEN COALESCE(n.category, 'platform') = 'action' THEN 'active'
      WHEN s.done_at IS NOT NULL THEN 'done'
      WHEN n.expires_at IS NOT NULL AND n.expires_at <= now() AND s.saved_at IS NULL THEN 'expired'
      ELSE 'active'
    END AS state
  FROM public.admin_notifications n
  LEFT JOIN public.admin_notification_reads r
    ON r.notification_id = n.id AND r.admin_user_id = auth.uid()
  LEFT JOIN public.admin_notification_states s
    ON s.notification_id = n.id AND s.admin_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.my_notification_inbox_rows()
RETURNS TABLE (
  id uuid, type text, category text, priority text, title text, message text,
  image_url text, action_url text, metadata jsonb, created_at timestamptz,
  activity_at timestamptz, expires_at timestamptz, resolved_at timestamptz,
  resolution text, is_read boolean, done_at timestamptz, saved_at timestamptz,
  is_expired boolean, is_muted boolean, state text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH me AS (
    SELECT p.id AS profile_id, p.created_at
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  ),
  prefs AS (
    SELECT COALESCE(
      (SELECT np.muted_categories FROM public.notification_preferences np WHERE np.user_id = auth.uid()),
      '{}'::text[]) AS muted
  )
  SELECT
    n.id, n.type, n.category, COALESCE(n.priority, 'normal'), n.title, n.message,
    n.image_url, n.action_url, COALESCE(n.metadata, '{}'::jsonb), n.created_at,
    COALESCE(n.activity_at, n.created_at), n.expires_at, n.resolved_at, n.resolution,
    (r.notification_id IS NOT NULL) AS is_read,
    s.done_at, s.saved_at,
    (n.expires_at IS NOT NULL AND n.expires_at <= now()) AS is_expired,
    (n.category = ANY (prefs.muted)) AS is_muted,
    CASE
      WHEN n.resolved_at IS NOT NULL THEN 'resolved'
      WHEN s.done_at IS NOT NULL THEN 'done'
      WHEN n.expires_at IS NOT NULL AND n.expires_at <= now() AND s.saved_at IS NULL THEN 'expired'
      ELSE 'active'
    END AS state
  FROM public.user_notifications n
  CROSS JOIN me
  CROSS JOIN prefs
  LEFT JOIN public.user_notification_reads r
    ON r.notification_id = n.id AND r.user_id = auth.uid()
  LEFT JOIN public.user_notification_states s
    ON s.notification_id = n.id AND s.user_id = auth.uid()
  -- Recipient scoping lives HERE, not only in RLS: an admin's RLS returns
  -- every player's targeted rows, and none of them belong in the admin's own
  -- player inbox.
  WHERE n.category IN ('social', 'feedback', 'progress', 'announcement', 'account', 'security')
    AND (
      (n.target_type = 'all' AND n.created_at >= me.created_at)
      OR (n.target_type = 'user' AND n.profile_id = me.profile_id)
    )
$$;

REVOKE ALL ON FUNCTION public.admin_notification_inbox_rows() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_notification_inbox_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_notification_inbox_rows() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_notification_inbox_rows() TO authenticated;


-- ---------------------------------------------------------------------------
-- 8. Admin RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_notifications(
  _tab text DEFAULT 'action',
  _limit integer DEFAULT 30,
  _cursor_rank integer DEFAULT NULL,
  _cursor_at timestamptz DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, type text, category text, priority text, title text, message text,
  metadata jsonb, created_at timestamptz, activity_at timestamptz,
  occurrence_count integer, subject_type text, subject_id text,
  expires_at timestamptz, resolved_at timestamptz, resolution text,
  is_read boolean, is_done boolean, is_saved boolean, is_expired boolean,
  state text, sort_rank integer, sort_at timestamptz
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _tab NOT IN ('action', 'community', 'platform', 'completed', 'saved') THEN
    RAISE EXCEPTION 'unknown tab: %', _tab USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  WITH t AS (
    SELECT x.*,
      CASE WHEN _tab = 'action' THEN public.notification_priority_rank(x.priority) ELSE 0 END AS rank_,
      CASE WHEN _tab = 'completed'
           THEN COALESCE(x.resolved_at, x.done_at, x.expires_at, x.activity_at)
           ELSE x.activity_at END AS at_
    FROM public.admin_notification_inbox_rows() x
    WHERE CASE _tab
      WHEN 'completed' THEN x.state <> 'active'
      WHEN 'saved'     THEN x.saved_at IS NOT NULL
      ELSE x.category = _tab AND x.state = 'active'
    END
  )
  SELECT t.id, t.type, t.category, t.priority, t.title, t.message, t.metadata,
         t.created_at, t.activity_at, t.occurrence_count, t.subject_type, t.subject_id,
         t.expires_at, t.resolved_at, t.resolution,
         t.is_read, t.done_at IS NOT NULL, t.saved_at IS NOT NULL, t.is_expired,
         t.state, t.rank_, t.at_
  FROM t
  WHERE _cursor_at IS NULL
     OR t.rank_ > _cursor_rank
     OR (t.rank_ = _cursor_rank AND (t.at_, t.id) < (_cursor_at, _cursor_id))
  ORDER BY t.rank_ ASC, t.at_ DESC, t.id DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 30), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_notification_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT jsonb_build_object(
    'action_unresolved', count(*) FILTER (WHERE x.category = 'action' AND x.state = 'active'),
    'action_unread',     count(*) FILTER (WHERE x.category = 'action' AND x.state = 'active' AND NOT x.is_read),
    'action_critical',   count(*) FILTER (WHERE x.category = 'action' AND x.state = 'active' AND x.priority = 'critical'),
    'community_active',  count(*) FILTER (WHERE x.category = 'community' AND x.state = 'active'),
    'community_unread',  count(*) FILTER (WHERE x.category = 'community' AND x.state = 'active' AND NOT x.is_read),
    'platform_active',   count(*) FILTER (WHERE x.category = 'platform' AND x.state = 'active'),
    'platform_unread',   count(*) FILTER (WHERE x.category = 'platform' AND x.state = 'active' AND NOT x.is_read),
    'saved',             count(*) FILTER (WHERE x.saved_at IS NOT NULL),
    'unread_total',      count(*) FILTER (WHERE x.state = 'active' AND NOT x.is_read)
  ) INTO _out
  FROM public.admin_notification_inbox_rows() x;
  RETURN _out;
END;
$$;

-- Same signature and grants as 20260803121000; v2 meaning: unread items that
-- are still in this admin's ACTIVE inbox. Done, expired and resolved items no
-- longer hold the badge up. Existing callers (useAdminAttention,
-- AdminDiagnostics, the deployed bell) become correct without a change.
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
  FROM public.admin_notification_inbox_rows() x
  WHERE x.state = 'active' AND NOT x.is_read;
  RETURN _count;
END;
$$;

COMMENT ON FUNCTION public.admin_unread_notification_count() IS
  'Unread items in the CALLING admin''s active inbox (v2: excludes done, expired '
  'and resolved). Takes no arguments by design -- the subject is always auth.uid().';

-- Single and bulk lifecycle actions for the CALLING admin. With _ids NULL and a
-- _tab, applies to every active item in that tab (bounded).
CREATE OR REPLACE FUNCTION public.admin_set_notification_state(
  _ids uuid[],
  _action text,
  _tab text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _targets uuid[];
  _skipped integer := 0;
  _applied integer := 0;
BEGIN
  IF NOT public.has_role(_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _action NOT IN ('read', 'done', 'undone', 'save', 'unsave') THEN
    RAISE EXCEPTION 'unknown action: %', _action USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT array_agg(x.id) INTO _targets
  FROM (
    SELECT x.id
    FROM public.admin_notification_inbox_rows() x
    WHERE (_ids IS NOT NULL AND x.id = ANY (_ids))
       OR (_ids IS NULL AND _tab IS NOT NULL AND x.state = 'active'
           AND (x.category = _tab OR _tab = 'all'))
    LIMIT 1000
  ) x;

  IF _targets IS NULL THEN
    RETURN jsonb_build_object('applied', 0, 'skipped', 0);
  END IF;

  IF _action = 'done' THEN
    SELECT count(*) INTO _skipped
    FROM public.admin_notifications n
    WHERE n.id = ANY (_targets) AND n.category = 'action' AND n.resolved_at IS NULL;
    SELECT array_agg(n.id) INTO _targets
    FROM public.admin_notifications n
    WHERE n.id = ANY (_targets) AND NOT (n.category = 'action' AND n.resolved_at IS NULL);
    IF _targets IS NULL THEN
      RETURN jsonb_build_object('applied', 0, 'skipped', _skipped);
    END IF;
  END IF;

  IF _action IN ('read', 'done') THEN
    INSERT INTO public.admin_notification_reads (notification_id, admin_user_id)
    SELECT t, _uid FROM unnest(_targets) t
    ON CONFLICT (notification_id, admin_user_id) DO UPDATE SET read_at = now();
  END IF;

  IF _action = 'done' THEN
    INSERT INTO public.admin_notification_states (notification_id, admin_user_id, done_at)
    SELECT t, _uid, now() FROM unnest(_targets) t
    ON CONFLICT (notification_id, admin_user_id)
      DO UPDATE SET done_at = COALESCE(admin_notification_states.done_at, now());
  ELSIF _action = 'undone' THEN
    UPDATE public.admin_notification_states s SET done_at = NULL
    WHERE s.admin_user_id = _uid AND s.notification_id = ANY (_targets);
  ELSIF _action = 'save' THEN
    INSERT INTO public.admin_notification_states (notification_id, admin_user_id, saved_at)
    SELECT t, _uid, now() FROM unnest(_targets) t
    ON CONFLICT (notification_id, admin_user_id)
      DO UPDATE SET saved_at = COALESCE(admin_notification_states.saved_at, now());
  ELSIF _action = 'unsave' THEN
    UPDATE public.admin_notification_states s SET saved_at = NULL
    WHERE s.admin_user_id = _uid AND s.notification_id = ANY (_targets);
  END IF;

  _applied := cardinality(_targets);
  RETURN jsonb_build_object('applied', _applied, 'skipped', _skipped);
END;
$$;

-- Explicit, shared resolution for alerts that have NO workflow of their own
-- (comment / image reports, platform notices). Feedback, user reports and
-- moderator requests are refused: their own workflow is the authority, and the
-- inbox links there instead.
CREATE OR REPLACE FUNCTION public.admin_resolve_notifications(
  _ids uuid[],
  _resolution text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  _resolved integer;
  _refused integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _resolution NOT IN ('dismissed', 'actioned') THEN
    RAISE EXCEPTION 'unknown resolution: %', _resolution USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT count(*) INTO _refused
  FROM public.admin_notifications n
  WHERE n.id = ANY (_ids) AND n.resolved_at IS NULL
    AND n.subject_type IN ('feedback', 'user_report', 'mod_request');

  WITH done AS (
    UPDATE public.admin_notifications n
    SET resolved_at = now(), resolved_by = auth.uid(), resolution = _resolution
    WHERE n.id = ANY (_ids) AND n.resolved_at IS NULL
      AND n.subject_type IS DISTINCT FROM 'feedback'
      AND n.subject_type IS DISTINCT FROM 'user_report'
      AND n.subject_type IS DISTINCT FROM 'mod_request'
    RETURNING n.id
  )
  SELECT count(*) INTO _resolved FROM done;

  -- The acting admin has plainly seen what they resolved.
  INSERT INTO public.admin_notification_reads (notification_id, admin_user_id)
  SELECT t, auth.uid() FROM unnest(_ids) t
  WHERE EXISTS (SELECT 1 FROM public.admin_notifications n WHERE n.id = t)
  ON CONFLICT (notification_id, admin_user_id) DO UPDATE SET read_at = now();

  RETURN jsonb_build_object('resolved', _resolved, 'refused', _refused);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reopen_notification(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.admin_notifications n
  SET resolved_at = NULL, resolved_by = NULL, resolution = NULL, activity_at = now()
  WHERE n.id = _id AND n.resolution IN ('dismissed', 'actioned');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_notifications(text, integer, integer, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_notification_counts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_notification_state(uuid[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_notifications(uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reopen_notification(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_unread_notification_count() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_get_notifications(text, integer, integer, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notification_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_notification_state(uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_notifications(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reopen_notification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unread_notification_count() TO authenticated;


-- ---------------------------------------------------------------------------
-- 9. Player RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_notifications(
  _view text DEFAULT 'inbox',
  _limit integer DEFAULT 30,
  _cursor_at timestamptz DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, type text, category text, priority text, title text, message text,
  image_url text, action_url text, metadata jsonb, created_at timestamptz,
  activity_at timestamptz, expires_at timestamptz, resolved_at timestamptz,
  resolution text, is_read boolean, is_done boolean, is_saved boolean,
  is_expired boolean, state text, sort_at timestamptz
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _view NOT IN ('inbox', 'saved', 'history') THEN
    RAISE EXCEPTION 'unknown view: %', _view USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  SELECT x.id, x.type, x.category, x.priority, x.title, x.message, x.image_url,
         x.action_url, x.metadata, x.created_at, x.activity_at, x.expires_at,
         x.resolved_at, x.resolution, x.is_read, x.done_at IS NOT NULL,
         x.saved_at IS NOT NULL, x.is_expired, x.state, x.activity_at
  FROM public.my_notification_inbox_rows() x
  WHERE CASE _view
      WHEN 'inbox'   THEN x.state = 'active' AND NOT x.is_muted
      WHEN 'saved'   THEN x.saved_at IS NOT NULL
      ELSE x.state <> 'active' OR x.is_muted
    END
    AND (_cursor_at IS NULL OR (x.activity_at, x.id) < (_cursor_at, _cursor_id))
  ORDER BY x.activity_at DESC, x.id DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 30), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_notification_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT jsonb_build_object(
    'unread',     count(*) FILTER (WHERE x.state = 'active' AND NOT x.is_muted AND NOT x.is_read),
    'active',     count(*) FILTER (WHERE x.state = 'active' AND NOT x.is_muted),
    'actionable', count(*) FILTER (WHERE x.state = 'active' AND NOT x.is_muted AND x.type = 'friend_request'),
    'saved',      count(*) FILTER (WHERE x.saved_at IS NOT NULL)
  ) INTO _out
  FROM public.my_notification_inbox_rows() x;
  RETURN _out;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_notification_state(
  _ids uuid[],
  _action text
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _targets uuid[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _action NOT IN ('read', 'done', 'undone', 'save', 'unsave', 'read_all', 'done_all') THEN
    RAISE EXCEPTION 'unknown action: %', _action USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Only notifications in the caller's OWN inbox can be targeted.
  SELECT array_agg(x.id) INTO _targets
  FROM (
    SELECT x.id FROM public.my_notification_inbox_rows() x
    WHERE CASE
      WHEN _action IN ('read_all', 'done_all') THEN x.state = 'active' AND NOT x.is_muted
      ELSE x.id = ANY (COALESCE(_ids, '{}'::uuid[]))
    END
    LIMIT 1000
  ) x;

  IF _targets IS NULL THEN
    RETURN 0;
  END IF;

  IF _action IN ('read', 'read_all', 'done', 'done_all') THEN
    INSERT INTO public.user_notification_reads (notification_id, user_id)
    SELECT t, _uid FROM unnest(_targets) t
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  END IF;

  IF _action IN ('done', 'done_all') THEN
    INSERT INTO public.user_notification_states (notification_id, user_id, done_at)
    SELECT t, _uid, now() FROM unnest(_targets) t
    ON CONFLICT (notification_id, user_id)
      DO UPDATE SET done_at = COALESCE(user_notification_states.done_at, now()), updated_at = now();
  ELSIF _action = 'undone' THEN
    UPDATE public.user_notification_states s SET done_at = NULL, updated_at = now()
    WHERE s.user_id = _uid AND s.notification_id = ANY (_targets);
  ELSIF _action = 'save' THEN
    INSERT INTO public.user_notification_states (notification_id, user_id, saved_at)
    SELECT t, _uid, now() FROM unnest(_targets) t
    ON CONFLICT (notification_id, user_id)
      DO UPDATE SET saved_at = COALESCE(user_notification_states.saved_at, now()), updated_at = now();
  ELSIF _action = 'unsave' THEN
    UPDATE public.user_notification_states s SET saved_at = NULL, updated_at = now()
    WHERE s.user_id = _uid AND s.notification_id = ANY (_targets);
  END IF;

  RETURN cardinality(_targets);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_notifications(text, integer, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_notification_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_my_notification_state(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(text, integer, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_notification_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_notification_state(uuid[], text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 10. Indexes — the active-inbox access paths, not "latest N"
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_admin_notifications_open_by_category
  ON public.admin_notifications (category, activity_at DESC, id DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_notifications_activity
  ON public.admin_notifications (activity_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_subject
  ON public.admin_notifications (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_open_dedupe
  ON public.admin_notifications (dedupe_key)
  WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_targeted
  ON public.user_notifications (profile_id, activity_at DESC, id DESC)
  WHERE target_type = 'user';
CREATE INDEX IF NOT EXISTS idx_user_notifications_broadcast
  ON public.user_notifications (activity_at DESC, id DESC)
  WHERE target_type = 'all';
CREATE INDEX IF NOT EXISTS idx_user_notifications_subject
  ON public.user_notifications (subject_type, subject_id)
  WHERE subject_type IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 11. Realtime — lifecycle changes converge across tabs, devices and surfaces.
--     Realtime applies each table's SELECT policy, so every frame reaches only
--     the recipient who owns the row.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['admin_notification_states', 'user_notification_states', 'user_notification_reads'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = _t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _t);
    END IF;
  END LOOP;
END
$$;


-- ---------------------------------------------------------------------------
-- 12. Backfill and clutter cleanup — NON-DESTRUCTIVE. No row is deleted.
--     Review the scope first with notifications_v2_preflight.sql.
-- ---------------------------------------------------------------------------

-- 12a. Classify every existing row exactly as a new one would be.
UPDATE public.admin_notifications n
SET activity_at  = COALESCE(n.activity_at, n.created_at),
    metadata     = CASE WHEN f.digest IS NULL THEN n.metadata
                        ELSE COALESCE(n.metadata, '{}'::jsonb) || jsonb_build_object('feedback', f.digest) END,
    category     = COALESCE(n.category, p.category),
    priority     = COALESCE(n.priority, p.priority),
    subject_type = COALESCE(n.subject_type, p.subject_type),
    subject_id   = COALESCE(n.subject_id, p.subject_id),
    dedupe_key   = COALESCE(n.dedupe_key, p.dedupe_key),
    expires_at   = COALESCE(n.expires_at, n.created_at + p.ttl)
FROM public.admin_notifications n2
LEFT JOIN LATERAL (
  SELECT public.notification_feedback_digest(public.notification_try_uuid(n2.metadata ->> 'feedback_id')) AS digest
  WHERE n2.type = 'feedback'
) f ON true
CROSS JOIN LATERAL public.notification_admin_profile(
  n2.id, n2.type, COALESCE(n2.metadata, '{}'::jsonb),
  f.digest ->> 'entry_intent', f.digest ->> 'type', f.digest ->> 'severity') p
WHERE n.id = n2.id AND n.category IS NULL;

UPDATE public.user_notifications n
SET activity_at  = COALESCE(n.activity_at, n.created_at),
    category     = COALESCE(n.category, p.category),
    subject_type = COALESCE(n.subject_type, p.subject_type),
    subject_id   = COALESCE(n.subject_id, p.subject_id),
    expires_at   = COALESCE(n.expires_at, n.created_at + p.ttl)
FROM public.user_notifications n2
CROSS JOIN LATERAL public.notification_user_profile(n2.type, n2.priority, COALESCE(n2.metadata, '{}'::jsonb)) p
WHERE n.id = n2.id AND n.category IS NULL;

-- 12b. Resolve historical items whose underlying work is already done.
UPDATE public.admin_notifications n
SET resolved_at = n.created_at,
    resolution  = CASE WHEN n.message LIKE '%[DENIED]' THEN 'denied' ELSE 'approved' END
WHERE n.type IN ('mod_delete_request', 'mod_action') AND n.is_read AND n.resolved_at IS NULL;

UPDATE public.admin_notifications n
SET resolved_at = COALESCE(f.updated_at, now()),
    resolution  = CASE WHEN f.status IN ('completed', 'declined') THEN f.status ELSE 'archived' END
FROM public.feedback f
WHERE n.subject_type = 'feedback' AND n.subject_id = f.id::text AND n.resolved_at IS NULL
  AND (f.status IN ('completed', 'declined') OR COALESCE(f.is_archived, false));

UPDATE public.admin_notifications n
SET resolved_at = COALESCE(r.resolved_at, now()),
    resolution  = CASE WHEN r.status = 'dismissed' THEN 'dismissed_report' ELSE 'resolved_report' END
FROM public.user_reports r
WHERE n.subject_type = 'user_report' AND n.subject_id = r.id::text AND n.resolved_at IS NULL
  AND r.status <> 'pending';

UPDATE public.admin_notifications n
SET resolved_at = now(), resolution = 'hidden_by_admin'
FROM public.comments c
WHERE n.subject_type = 'comment' AND n.subject_id = c.id::text AND n.resolved_at IS NULL
  AND c.hidden_by_admin;

-- Subjects that no longer exist: nothing left to act on.
UPDATE public.admin_notifications n
SET resolved_at = now(), resolution = 'subject_deleted'
WHERE n.resolved_at IS NULL AND n.subject_id IS NOT NULL AND (
     (n.subject_type = 'feedback'    AND NOT EXISTS (SELECT 1 FROM public.feedback f     WHERE f.id::text = n.subject_id))
  OR (n.subject_type = 'user_report' AND NOT EXISTS (SELECT 1 FROM public.user_reports r WHERE r.id::text = n.subject_id))
  OR (n.subject_type = 'comment'     AND NOT EXISTS (SELECT 1 FROM public.comments c     WHERE c.id::text = n.subject_id))
);

DO $$
BEGIN
  IF to_regclass('public.preset_item_images') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE public.admin_notifications n
      SET resolved_at = now(), resolution = 'subject_deleted'
      WHERE n.resolved_at IS NULL AND n.subject_type = 'image' AND n.subject_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.preset_item_images i WHERE i.id::text = n.subject_id)
    $q$;
  END IF;
END
$$;

-- 12c. Collapse historical duplicates onto the newest open item per subject.
--      Older copies are marked 'merged' (kept, visible under Completed).
WITH ranked AS (
  SELECT n.id, n.dedupe_key,
         row_number() OVER (PARTITION BY n.dedupe_key ORDER BY n.created_at DESC, n.id DESC) AS rn,
         count(*)     OVER (PARTITION BY n.dedupe_key) AS cnt,
         max(n.created_at) OVER (PARTITION BY n.dedupe_key) AS last_at,
         min(public.notification_priority_rank(n.priority)) OVER (PARTITION BY n.dedupe_key) AS best_rank
  FROM public.admin_notifications n
  WHERE n.dedupe_key IS NOT NULL AND n.resolved_at IS NULL
),
keepers AS (
  UPDATE public.admin_notifications n
  SET occurrence_count = r.cnt,
      activity_at      = r.last_at,
      priority         = CASE r.best_rank WHEN 0 THEN 'critical' WHEN 1 THEN 'high'
                                          WHEN 2 THEN 'normal' ELSE 'low' END
  FROM ranked r
  WHERE n.id = r.id AND r.rn = 1 AND r.cnt > 1
  RETURNING n.id
)
UPDATE public.admin_notifications n
SET resolved_at = now(), resolution = 'merged'
FROM ranked r
WHERE n.id = r.id AND r.rn > 1;

-- 12d. Friend requests that are no longer pending are not actionable.
UPDATE public.user_notifications u
SET resolved_at = now(),
    resolution  = COALESCE(f.status, 'withdrawn')
FROM public.user_notifications u2
LEFT JOIN public.friendships f ON f.id::text = u2.subject_id
WHERE u.id = u2.id AND u.type = 'friend_request' AND u.resolved_at IS NULL
  AND (f.id IS NULL OR f.status <> 'pending');

-- 12e. Constraints and defaults, once every row is classified.
ALTER TABLE public.admin_notifications ALTER COLUMN activity_at SET DEFAULT now();
ALTER TABLE public.admin_notifications ALTER COLUMN activity_at SET NOT NULL;
ALTER TABLE public.user_notifications  ALTER COLUMN activity_at SET DEFAULT now();
ALTER TABLE public.user_notifications  ALTER COLUMN activity_at SET NOT NULL;

ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_category_check;
ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_category_check
  CHECK (category IN ('action', 'community', 'platform'));
ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_priority_check;
ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_priority_check
  CHECK (priority IN ('critical', 'high', 'normal', 'low'));
