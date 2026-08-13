-- FB1 Phase 1 — Feedback Center schema foundation.
--
-- Extends the existing public.feedback surface (20260309045313) rather than
-- replacing it. Nothing here changes the shipped user or admin UI: every new
-- column is nullable or defaulted, and the existing RLS policies, the
-- admin_list_feedback RPC and the notify_admins_on_feedback trigger are all
-- preserved verbatim.
--
-- Applied by hand through the Lovable Cloud SQL Editor. There is no local
-- Supabase stack and the CLI is deliberately not linked to this project, so
-- this file is written to be run top-to-bottom in one transaction.
--
--
-- 1. WHY entry_intent AND type ARE SEPARATE COLUMNS
-- The Feedback Center presents four choices — Report a Bug, Request a Feature,
-- Gameplay Feedback, Other Feedback. Triage only needs three workflows: a bug
-- to reproduce, a request to weigh, or a comment to read. Collapsing the four
-- into three at the UI boundary would lose which door the user walked through,
-- which is exactly the signal that tells us whether gameplay feedback is
-- arriving at all.
--   entry_intent = what the user chose. Four values. Set by the client, never
--                  rewritten, safe to report on.
--   type         = the workflow. Three values. DERIVED SERVER-SIDE from
--                  entry_intent on insert (see normalize_feedback_submission),
--                  then owned by admins, who may reclassify a report without
--                  falsifying what the user originally picked.
-- The client cannot desynchronise them: whatever `type` an insert supplies is
-- overwritten by the trigger.
--
--
-- 2. WHY category IS REWRITTEN BUT NOT DESTROYED
-- Legacy `category` conflates type and product area in one field: it holds
-- 'Bug Report' and 'Feature Request' (types) alongside 'UI/UX' and 'Content'
-- (areas). Going forward category means product area only. Legacy rows are
-- rewritten to 'General' because they carry no area information — there is
-- nothing to salvage — and their original value is preserved verbatim in
-- legacy_category so no historical meaning is lost.
--
-- `status`, `priority` and `page_reference` are deliberately NOT touched. The
-- shipped vocabulary ('open' / 'in-progress' / 'planned' / 'completed' /
-- 'declined') is serviceable, the admin UI writes it today, and rewriting it
-- would break AdminFeedback.tsx for no product gain. Legacy page_reference
-- values ('Swipe', 'Shop', 'Aura Check') stay readable as the historical record
-- of a product that no longer exists. No CHECK constraint is added to any
-- pre-existing column: this migration cannot see production data, and a CHECK
-- over values it cannot enumerate is a failed apply waiting to happen.
--
--
-- 3. WHY profile_id BECOMES NULLABLE
-- See the FK section below. Short version: the anonymous-user purge currently
-- destroys submitted feedback, and ON DELETE SET NULL is the only fix that does
-- not modify the purge itself.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------
-- All nullable or defaulted, so existing rows remain valid and the current
-- Feedback.tsx / AdminFeedback.tsx queries keep working unchanged.

ALTER TABLE public.feedback
  -- The door the user walked through. Four user-facing choices.
  ADD COLUMN IF NOT EXISTS entry_intent    text NOT NULL DEFAULT 'other',
  -- The triage workflow. Derived from entry_intent on insert.
  ADD COLUMN IF NOT EXISTS type            text NOT NULL DEFAULT 'feedback',
  -- Bug-only, user-supplied: how badly it blocked them. Distinct from
  -- `priority`, which stays admin-owned ("when will I fix it").
  ADD COLUMN IF NOT EXISTS severity        text,
  ADD COLUMN IF NOT EXISTS reproducibility text,
  ADD COLUMN IF NOT EXISTS expected_result text,
  ADD COLUMN IF NOT EXISTS actual_result   text,
  -- External evidence: a clip on YouTube/Streamable/Medal/Discord. Mogzy does
  -- not host video; FB1 stores the link and renders it as a link, never as an
  -- embed.
  ADD COLUMN IF NOT EXISTS evidence_url    text,
  -- Object path inside the private evidence bucket. The bucket itself is
  -- created in FB1-2 alongside the upload UI; the column exists now so the
  -- contract is settled and FB1-2 adds no further schema.
  ADD COLUMN IF NOT EXISTS screenshot_path text,
  -- Route the report was filed from. Path only — never a query string, which
  -- is where invite codes and room codes live.
  ADD COLUMN IF NOT EXISTS page_url        text,
  -- Auto-captured browser diagnostics: user agent, viewport, app version.
  -- Readable by the submitter: it is their own client's data, RLS already
  -- confines it to their own row, and there is no confidentiality interest
  -- between a user and their own user-agent string.
  ADD COLUMN IF NOT EXISTS client_meta     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Admin triage only. Inert in FB1-1: nothing writes it until the admin phase.
  -- See the "admin-only columns" note at the foot of this file.
  ADD COLUMN IF NOT EXISTS duplicate_of    uuid,
  -- Verbatim pre-FB1 `category`, so the rewrite below destroys nothing.
  ADD COLUMN IF NOT EXISTS legacy_category text;

COMMENT ON COLUMN public.feedback.entry_intent IS
  'Which of the four Feedback Center entry points the user chose: bug, feature, gameplay, other. Never rewritten.';
COMMENT ON COLUMN public.feedback.type IS
  'Triage workflow: bug, feature, feedback. Derived from entry_intent on insert; admin-owned thereafter.';
COMMENT ON COLUMN public.feedback.severity IS
  'User-reported impact for bugs: blocking, major, minor. Distinct from priority, which is admin-owned.';
COMMENT ON COLUMN public.feedback.client_meta IS
  'Auto-captured client diagnostics (user agent, viewport, app version). Submitter-readable: it is their own data.';
COMMENT ON COLUMN public.feedback.duplicate_of IS
  'Admin triage: the report this one duplicates. Excluded from list_my_feedback().';
COMMENT ON COLUMN public.feedback.legacy_category IS
  'Pre-FB1 category value, preserved verbatim when category was narrowed to product area.';

-- ---------------------------------------------------------------------------
-- 2. Deterministic backfill of existing rows
-- ---------------------------------------------------------------------------
-- Runs before the CHECK constraints so every row is already valid when they
-- are added. The mapping is total: an ELSE branch covers any category value
-- this migration cannot see, so the apply cannot fail on unexpected data.
--
-- Legacy category -> entry_intent
--   'Bug Report'      -> bug       (an explicit bug report)
--   'Feature Request' -> feature   (an explicit request)
--   everything else   -> other     ('UI/UX', 'Content', 'General', the
--                                   'general' column default, and anything
--                                   unforeseen). Deliberately NOT 'gameplay':
--                                   no legacy row can be known to be gameplay
--                                   feedback, and guessing would poison the
--                                   first real measurement of that entry path.

UPDATE public.feedback
SET
  legacy_category = COALESCE(legacy_category, category),
  entry_intent = CASE lower(btrim(category))
                   WHEN 'bug report'      THEN 'bug'
                   WHEN 'feature request' THEN 'feature'
                   ELSE 'other'
                 END,
  type = CASE lower(btrim(category))
           WHEN 'bug report'      THEN 'bug'
           WHEN 'feature request' THEN 'feature'
           ELSE 'feedback'
         END,
  -- Legacy categories carry no product-area information. 'General' is the
  -- honest value; the original is safe in legacy_category.
  category = 'General'
WHERE legacy_category IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Value constraints — new columns only
-- ---------------------------------------------------------------------------
-- Every constrained column was either just created with a valid default or
-- just backfilled above, so these are guaranteed to validate.

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_entry_intent_check
    CHECK (entry_intent IN ('bug', 'feature', 'gameplay', 'other')),
  ADD CONSTRAINT feedback_type_check
    CHECK (type IN ('bug', 'feature', 'feedback')),
  ADD CONSTRAINT feedback_severity_check
    CHECK (severity IS NULL OR severity IN ('blocking', 'major', 'minor')),
  ADD CONSTRAINT feedback_reproducibility_check
    CHECK (reproducibility IS NULL OR reproducibility IN ('always', 'sometimes', 'once')),
  -- http(s) only: blocks javascript:, data: and file: evidence links before
  -- they ever reach an admin's browser.
  ADD CONSTRAINT feedback_evidence_url_check
    CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://[^[:space:]]{1,2040}$'),
  ADD CONSTRAINT feedback_screenshot_path_check
    CHECK (screenshot_path IS NULL OR length(screenshot_path) <= 512),
  -- Path only. Rejecting '?' keeps invite codes and room codes out of the
  -- diagnostics we retain.
  ADD CONSTRAINT feedback_page_url_check
    CHECK (page_url IS NULL OR (length(page_url) <= 512 AND page_url !~ '[?#]')),
  ADD CONSTRAINT feedback_duplicate_of_not_self
    CHECK (duplicate_of IS NULL OR duplicate_of <> id);

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_duplicate_of_fkey
    FOREIGN KEY (duplicate_of) REFERENCES public.feedback(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. Anonymous-submitter retention
-- ---------------------------------------------------------------------------
-- THE DEFECT
-- Anonymous sign-in is enabled on this project, an anonymous session carries
-- the `authenticated` role, and profiles rows exist for anonymous users. So
-- anonymous playtesters can and do submit feedback. The admin tool
-- purge-anonymous-users deletes EVERY profile with is_anonymous = true, with no
-- age cutoff, via auth.admin.deleteUser -> profiles cascade. feedback.profile_id
-- was ON DELETE CASCADE, so one click destroyed every anonymous report ever
-- filed.
--
-- THE FIX, AND WHY IT IS SAFE
-- ON DELETE SET NULL, which requires dropping NOT NULL. Each requirement,
-- proved from the existing definitions rather than assumed:
--
--   a) An orphaned row is invisible to every non-admin, including the user who
--      wrote it. The SELECT policy is USING (is_profile_owner(profile_id)), and
--      is_profile_owner is
--          SELECT EXISTS (SELECT 1 FROM profiles WHERE id = _profile_id
--                                                  AND user_id = auth.uid())
--      With _profile_id NULL, `id = NULL` is NULL for every row, no row
--      qualifies, and EXISTS returns false — never NULL. The policy is
--      therefore fail-closed by construction, not by convention.
--
--   b) Nobody can claim an orphan. Claiming would require is_profile_owner to
--      return true for a NULL argument, which (a) rules out. A purged user who
--      returns is issued a new auth user and a new profile id; there is no
--      column left that could re-associate them.
--
--   c) Nullable profile_id does not open an unattributed-insert hole. The
--      INSERT policy is WITH CHECK (is_profile_owner(profile_id)), which is
--      false for NULL by the same argument. Belt and braces, the normalize
--      trigger below rejects a NULL profile_id on insert outright, so NULL can
--      only ever arise from the referential action.
--
--   d) Admins keep full visibility. The admin policy tests
--      has_role(auth.uid(), 'admin') and never mentions profile_id;
--      admin_list_feedback is SECURITY DEFINER over `SELECT * FROM feedback`
--      with no join to profiles. Orphans are returned by both paths.
--
--   e) Existing users are unaffected. For any live profile the column value is
--      unchanged, so their own-submission reads behave exactly as before.
--
--   f) No RLS policy is weakened. This migration adds, drops and alters no
--      policy on public.feedback whatsoever.
--
-- WHAT IS DELIBERATELY NOT DONE
-- No denormalised submitter label. Phase 0 proposed snapshotting display_name
-- so attribution survived the purge. Rejected on both value and risk: anonymous
-- display names are auto-generated ('Anonymous 47') and identify nobody, so the
-- label would carry no information; and for registered users, retaining a name
-- after account deletion works directly against erasure. `profile_id IS NULL`
-- already answers the only question an admin actually has — "is this still
-- attributable?" — with zero retained personal data. If provenance beyond that
-- proves necessary, a non-identifying submitter_kind flag can be added later
-- without touching this FK.
--
-- The purge function itself is untouched. FB1 stays out of auth work.

ALTER TABLE public.feedback ALTER COLUMN profile_id DROP NOT NULL;

ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_profile_id_fkey;
ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.feedback.profile_id IS
  'Submitting profile. NULL only when that profile was deleted or purged: the row is retained for admins and becomes permanently invisible to every non-admin.';

-- ---------------------------------------------------------------------------
-- 5. Insert normalisation
-- ---------------------------------------------------------------------------
-- BEFORE INSERT. Two invariants the client is not trusted to hold.

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
                WHEN 'bug'     THEN 'bug'
                WHEN 'feature' THEN 'feature'
                ELSE 'feedback'
              END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_normalize_submission ON public.feedback;
CREATE TRIGGER feedback_normalize_submission
  BEFORE INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.normalize_feedback_submission();

-- ---------------------------------------------------------------------------
-- 6. Rate limit
-- ---------------------------------------------------------------------------
-- Five submissions per profile per rolling hour. There is no rate limiting
-- anywhere in this project to inherit, and the feedback INSERT policy is
-- reachable by every anonymous session, so this is the only thing standing
-- between a bored visitor and an unusable inbox.
--
-- Server-side and stateless: it counts committed rows, so it cannot be evaded
-- by clearing storage, opening a new tab, or calling PostgREST directly.
-- SECURITY DEFINER so the count sees all of the profile's rows regardless of
-- the caller's RLS view.
--
-- Admins are exempt so owner testing, seeding and administration are never
-- blocked — the stated requirement.
--
-- The error message is a stable machine token; FEEDBACK_RATE_LIMIT_ERROR in
-- src/lib/feedback/contract.ts matches on it and the human sentence lives in
-- the frontend where it can be translated.

CREATE OR REPLACE FUNCTION public.enforce_feedback_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _max_per_hour constant integer := 5;
  _recent integer;
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _recent
  FROM public.feedback
  WHERE profile_id = NEW.profile_id
    AND created_at > now() - interval '1 hour';

  IF _recent >= _max_per_hour THEN
    RAISE EXCEPTION 'feedback_rate_limit_exceeded'
      USING HINT = 'At most 5 feedback submissions per profile per hour.';
  END IF;

  RETURN NEW;
END;
$$;

-- Fires after feedback_normalize_submission (triggers run in name order), so a
-- NULL-profile_id insert is rejected before this counts anything.
DROP TRIGGER IF EXISTS feedback_rate_limit ON public.feedback;
CREATE TRIGGER feedback_rate_limit
  BEFORE INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.enforce_feedback_rate_limit();

-- Serves the rate-limit count, My Submissions, and the admin list's ordering.
CREATE INDEX IF NOT EXISTS idx_feedback_profile_created
  ON public.feedback (profile_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. updated_at
-- ---------------------------------------------------------------------------
-- The table has carried an updated_at column since 20260309045313 with nothing
-- maintaining it, so it has always equalled created_at. The admin UI shows
-- edit recency; make the column mean what it says.

DROP TRIGGER IF EXISTS feedback_set_updated_at ON public.feedback;
CREATE TRIGGER feedback_set_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 8. User read contract
-- ---------------------------------------------------------------------------
-- ADMIN-ONLY COLUMNS, AND WHY THIS IS AN RPC
-- Column-level REVOKE does not work on this project. 20260730150000 records a
-- live check on 2026-07-30: `authenticated` holds SELECT on all 31 columns of
-- public.profiles despite three migrations revoking two of them, because
-- ALTER DEFAULT PRIVILEGES grants arwdDxtm at table level and a column-level
-- REVOKE cannot subtract from a table-level grant. One of those no-op
-- migrations is 20260522053651 — the same statement that is supposed to be
-- hiding feedback.admin_notes today. So admin_notes is, in all likelihood,
-- already readable by the user who filed the report. That is a pre-existing
-- defect, it is not FB1's to fix here, and it is written up for FB1 to
-- schedule; this migration deliberately does not attempt grant surgery on a
-- live table it cannot inspect.
--
-- What FB1 can do is refuse to add to the problem. list_my_feedback() is a
-- RETURNS TABLE contract, which a caller cannot widen — unlike a view or a
-- table, where select('*') silently publishes every column added later. It
-- omits admin_notes, client_meta and duplicate_of. FB1-3 switches
-- Feedback.tsx from .from('feedback').select('*') to this RPC, and from that
-- point the user read path cannot leak an admin column no matter what is added
-- to the table.
--
-- Until FB1-3 lands, duplicate_of is inert: nothing writes it, so there is
-- nothing to leak. The admin phase must not begin populating it before the
-- FB1-3 switch — that ordering is the one real constraint this design carries.

CREATE OR REPLACE FUNCTION public.list_my_feedback()
RETURNS TABLE (
  id              uuid,
  entry_intent    text,
  type            text,
  category        text,
  title           text,
  body            text,
  status          text,
  severity        text,
  reproducibility text,
  expected_result text,
  actual_result   text,
  evidence_url    text,
  screenshot_path text,
  page_url        text,
  page_reference  text,
  created_at      timestamptz,
  updated_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id, f.entry_intent, f.type, f.category, f.title, f.body, f.status,
    f.severity, f.reproducibility, f.expected_result, f.actual_result,
    f.evidence_url, f.screenshot_path, f.page_url, f.page_reference,
    f.created_at, f.updated_at
  FROM public.feedback f
  WHERE f.profile_id IS NOT NULL
    AND public.is_profile_owner(f.profile_id)
    AND f.is_archived = false
  ORDER BY f.created_at DESC
  LIMIT 200;
$$;

-- New functions inherit EXECUTE for PUBLIC, anon, authenticated and
-- service_role from ALTER DEFAULT PRIVILEGES in this project. Narrow it,
-- matching 20260514042724 and 20260730140000.
REVOKE ALL ON FUNCTION public.list_my_feedback() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_feedback() TO authenticated;

COMMENT ON FUNCTION public.list_my_feedback() IS
  'The submitter-visible feedback contract. Deliberately omits admin_notes, client_meta and duplicate_of; a RETURNS TABLE contract cannot be widened by a caller.';

-- ---------------------------------------------------------------------------
-- 9. Config
-- ---------------------------------------------------------------------------
-- feedback_config drives the admin category editor and the future form. The
-- shipped value still lists a product that no longer exists ('Swipe', 'Shop',
-- 'Aura Check', 'Multiplayer'). Replace the taxonomy with the current Academy
-- one, audited against the six LolHub destinations and the /quiz sub-routes.
--
-- `page_options` is left in place untouched: AdminFeedback.tsx reads it, and
-- legacy rows still reference those names in page_reference. New submissions
-- record their route in page_url instead.
--
-- Written with jsonb_set so the row's other keys survive whatever the owner has
-- edited in the admin UI since launch.

UPDATE public.app_settings
SET value = jsonb_set(
      value,
      '{categories}',
      '["General","Leaguecraft","Daily Challenge","Ranked","Stat Check","Combat Lab","Mastery","Mogzy Archives","Patch Reports","Quiz History","Account & Profile","Performance","Other"]'::jsonb,
      true
    ),
    updated_at = now()
WHERE key = 'feedback_config';

-- ---------------------------------------------------------------------------
-- 10. Untouched by design
-- ---------------------------------------------------------------------------
--   public.feedback RLS policies         — all three preserved verbatim
--   admin_list_feedback(boolean)         — RETURNS SETOF public.feedback, so
--                                          every column added above flows
--                                          through to the admin UI with no
--                                          change to the function
--   notify_admins_on_feedback + trigger  — unchanged; still SECURITY DEFINER,
--                                          still the only writer of
--                                          type='feedback' admin_notifications
--                                          rows after NOT1 Phase 1 narrowed the
--                                          client INSERT policy
--   feedback_upvotes                     — left exactly as found
--   purge-anonymous-users                — not FB1's to touch
--   status / priority / page_reference   — vocabulary preserved

COMMIT;
