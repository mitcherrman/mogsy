-- FB1 Phase 4 — in-product reporting: question reports and page issues.
--
-- Two new doors into the SAME feedback table, submitted through the SAME
-- insert, rate-limited by the SAME trigger and notified by the SAME
-- notify_admins_on_feedback. No second reporting table, no second RPC, no
-- parallel backend. This migration adds one column and widens one CHECK.
--
-- Applied by hand through the Lovable Cloud SQL Editor, like every other
-- migration in this project. See docs/fb1-in-product-reporting-rollout.md —
-- THIS MIGRATION MUST BE APPLIED BEFORE THE FRONTEND SHIPS, because the
-- frontend's inserts name a column and two entry_intent values that do not
-- exist until it runs. That is the reverse of FB1-3's ordering and it is not
-- a slip: FB1-3 removed a privilege the old frontend depended on, whereas this
-- is purely additive and is invisible to the frontend that is live today.
--
--
-- 1. WHY report_context IS A COLUMN AND NOT PROSE IN `body`
--
-- Most of Mogzy's questions are GENERATED. Re-running a generator tomorrow —
-- against a patched champion, a re-frozen Mastery artifact, a corrected
-- coefficient — can produce different text and different choices for the same
-- key. A report that only pointed at an identity would therefore be a report
-- the owner could not reconstruct. So the row carries a SNAPSHOT of what the
-- player actually saw.
--
-- That snapshot has ten-odd named fields. Serialized into `body` it would be
-- unreadable in the admin list, unsearchable, impossible to render field by
-- field, and permanently entangled with the player's own sentence. jsonb keeps
-- the two apart: `body` is what the human wrote, `report_context` is what the
-- client observed, and neither can quietly become the other.
--
-- The client-side builders (src/lib/feedback/report-context.ts) truncate every
-- field individually and drop the two unbounded ones (prompt, choices) rather
-- than exceed the cap below, so a report always arrives even when a question
-- is pathological. The CHECK is the backstop, not the mechanism.
--
--
-- 2. WHY entry_intent IS WIDENED RATHER THAN REUSED
--
-- The four existing intents are the four doors on /feedback. These two doors
-- are not on /feedback at all: they are controls that sit beside the thing
-- being reported, inside a live game surface. Filing them as 'bug' would work
-- and would be wrong, because entry_intent's entire job — stated in
-- 20260812120000 — is to record WHICH DOOR the user walked through, and to
-- keep that answer true after an admin retriages `type`. "How many question
-- reports arrived this week, and for which reason" is a question the owner
-- will ask constantly; "how many bugs were secretly question reports" is one
-- nobody will ever ask.
--
-- Widening a CHECK is validation-safe: every existing row already satisfies
-- the new predicate, because the new predicate is a strict superset of the old
-- one. There is no scan that can fail here.
--
-- Both new intents derive type = 'bug'. The submitter is asserting that
-- something in front of them is WRONG, which is work to reproduce and fix
-- rather than an opinion to weigh — true even of the "Doesn't make sense" and
-- "Other" reasons, since an unintelligible question is a content defect.
-- `type` remains admin-owned, so a report that turns out to be a comment is
-- reclassified without falsifying which door it came through.
--
--
-- 3. WHAT IS DELIBERATELY NOT TOUCHED
--
--   list_my_feedback()          — NOT widened. report_context joins client_meta
--                                 as a column the submitter's own read contract
--                                 omits. Widening a RETURNS TABLE contract is
--                                 the one move that cannot be un-made, and
--                                 nothing in the product asks a user to re-read
--                                 the answer choices they just reported. The
--                                 report still appears in their history — its
--                                 title, body, category and status all flow
--                                 through the existing seventeen columns.
--   enforce_feedback_rate_limit — unchanged. Five per profile per hour applies
--                                 to in-product reports exactly as it does to
--                                 /feedback submissions. A player who finds six
--                                 bad questions in an hour is throttled, which
--                                 is a known and accepted cost of not building
--                                 a second, unthrottled write path.
--   notify_admins_on_feedback   — unchanged, and therefore already fires for
--                                 both new doors. No trigger work was needed.
--   RLS policies                — none added, dropped or altered.
--   app_settings.feedback_config— category taxonomy unchanged; both new doors
--                                 file into the existing product areas.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The structured context column
-- ---------------------------------------------------------------------------

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS report_context jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.feedback.report_context IS
  'FB1-4 structured context captured automatically by the in-product reporters: the question snapshot (prompt, choices, identity, mode, session) or the page snapshot (route, allow-listed query). Empty object for every /feedback submission. Admin-visible only: excluded from list_my_feedback(), like client_meta.';

-- Dropped first so the whole migration is re-runnable. It runs in ONE
-- transaction, so a failed apply rolls back cleanly either way — but a
-- SUCCESSFUL apply run twice by hand in the SQL editor would otherwise abort
-- on "constraint already exists", which reads like a real failure and is not.
ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_report_context_is_object,
  DROP CONSTRAINT IF EXISTS feedback_report_context_size;

ALTER TABLE public.feedback
  -- An object, never a scalar or an array: every consumer reads it by key.
  ADD CONSTRAINT feedback_report_context_is_object
    CHECK (jsonb_typeof(report_context) = 'object'),
  -- Mirrors FEEDBACK_LIMITS.reportContextJson. A question with forty options
  -- and a thousand-word prompt is a bug in a generator, not a row we store.
  ADD CONSTRAINT feedback_report_context_size
    CHECK (length(report_context::text) <= 16384);

-- ---------------------------------------------------------------------------
-- 2. Widen the entry-intent vocabulary
-- ---------------------------------------------------------------------------
-- DROP then ADD, not a second constraint: two overlapping CHECKs on one column
-- means the narrower one silently wins and the widening appears not to have
-- worked.

ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_entry_intent_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_entry_intent_check
    CHECK (entry_intent IN (
      'bug', 'feature', 'gameplay', 'other',
      'question_report', 'page_report'
    ));

-- ---------------------------------------------------------------------------
-- 3. Insert normalisation, extended
-- ---------------------------------------------------------------------------
-- Same function, same two invariants, one wider mapping. Re-stated in full
-- rather than patched, because CREATE OR REPLACE takes a whole body and a
-- half-remembered copy is how the profile_id guard would get dropped.

CREATE OR REPLACE FUNCTION public.normalize_feedback_submission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- profile_id is nullable only so the FK can SET NULL on purge. An insert
  -- must always be attributed.
  IF NEW.profile_id IS NULL THEN
    RAISE EXCEPTION 'feedback_profile_id_required'
      USING HINT = 'profile_id is required on insert; NULL is reserved for purged submitters.';
  END IF;

  -- The server owns the workflow type. Whatever `type` the client sent is
  -- discarded, so entry_intent and type can never disagree on a new row.
  NEW.type := CASE NEW.entry_intent
                WHEN 'bug'             THEN 'bug'
                WHEN 'feature'         THEN 'feature'
                -- FB1-4: both in-product doors are defect reports.
                WHEN 'question_report' THEN 'bug'
                WHEN 'page_report'     THEN 'bug'
                ELSE 'feedback'
              END;

  RETURN NEW;
END;
$$;

-- The trigger itself is unchanged and is deliberately not re-created: it
-- already points at this function by name, and dropping/recreating it would
-- momentarily leave the table without its profile_id guard.

-- ---------------------------------------------------------------------------
-- 4. The INSERT grant
-- ---------------------------------------------------------------------------
-- WITHOUT THIS, EVERY IN-PRODUCT REPORT IS REJECTED.
--
-- 20260812140000 revoked table-level privileges on public.feedback and granted
-- back an explicit COLUMN LIST for INSERT — the twelve columns the /feedback
-- form sends, and nothing else. That is what stops a submitter setting their
-- own `status` or pre-filling `admin_notes`, and it is a deliberately closed
-- list: a column added later is NOT insertable until it is named here.
--
-- So adding report_context in section 1 above is only half the change. The
-- other half is this grant. Missing it would not fail at apply time and would
-- not fail in any local test — it would fail in production, on every report,
-- with a bare permission error.
--
-- report_context and nothing else. The rest of the list stays exactly as
-- 20260812140000 left it; a column-level GRANT is additive, so this does not
-- restate or widen the twelve already granted.
GRANT INSERT (report_context) ON public.feedback TO authenticated;

-- Deliberately NOT granted: UPDATE on report_context. The captured snapshot is
-- a record of what the client observed at submit time. A submitter who could
-- edit it afterwards could rewrite the evidence their own report rests on.

-- ---------------------------------------------------------------------------
-- 5. Admin listing support
-- ---------------------------------------------------------------------------
-- admin_list_feedback() is RETURNS SETOF public.feedback, so report_context
-- flows through to the admin UI with no change to the function — the same
-- property that carried every FB1-1 column. Nothing to do here; this note
-- exists so the absence of a change is legible as a decision.

COMMIT;
