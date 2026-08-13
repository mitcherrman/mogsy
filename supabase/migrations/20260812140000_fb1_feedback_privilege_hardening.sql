-- FB1 Phase 3 — close direct table reads on public.feedback.
--
--
-- ############################################################################
-- ##  APPLY LAST, AND NOT WITH THE OTHER TWO.                               ##
-- ##                                                                        ##
-- ##  This migration breaks the OLD Feedback page, which reads              ##
-- ##  .from("feedback").select("*"). Apply it only AFTER the rewritten       ##
-- ##  frontend (list_my_feedback) is confirmed live in production.          ##
-- ##  Order: 20260812120000 -> 20260812130000 -> deploy frontend -> THIS.   ##
-- ##  See docs/fb1-feedback-rollout.md.                                     ##
-- ############################################################################
--
--
-- THE HOLE
-- public.feedback has always been readable column-by-column by the person who
-- filed the report. RLS is not the problem — "Users can view own feedback"
-- correctly limits a session to its own rows. The problem is which COLUMNS of
-- those rows a client may name, and there the table currently has no boundary
-- at all:
--
--   * ALTER DEFAULT PRIVILEGES in this project grants arwdDxtm on new public
--     tables to anon and authenticated, so `authenticated` holds table-level
--     SELECT on every column of public.feedback.
--   * 20260522053651 tried to carve out admin_notes with
--         REVOKE SELECT (admin_notes) ON public.feedback FROM anon, authenticated;
--     That statement is a no-op. A column-level REVOKE cannot subtract from a
--     table-level grant: PostgreSQL checks pg_class first and only consults
--     pg_attribute when the table-level check fails. Verified live on
--     2026-07-30 against public.profiles and written up in
--     20260730150000_league_profiles_rpc.sql, which found `authenticated`
--     holding SELECT on all 31 columns despite three such REVOKEs.
--
-- Concretely, today any signed-in visitor can run
--     supabase.from("feedback").select("admin_notes").eq("id", <their own row>)
-- and read the staff notes written about their own report. After FB1's
-- foundation migration the same call would reach client_meta and duplicate_of.
-- Rewriting the frontend to use list_my_feedback() removed the app's reliance
-- on that reach, but it did not remove the reach itself.
--
--
-- THE FIX, AND WHY THIS SHAPE
-- The repository offers three precedents for narrowing a read surface:
--
--   1. custom_links (20260514045635) — REVOKE SELECT on the table, then
--      GRANT SELECT (safe columns). The only true column-narrowing precedent
--      in the repo, and the only mechanism that actually works given the
--      default-privileges grant.
--   2. public_profiles (20260728130000) — a security_invoker VIEW with an
--      explicit column list.
--   3. get_league_profiles (20260730150000) — a SECURITY DEFINER RPC with a
--      RETURNS TABLE contract. That migration explicitly rejected the view
--      approach: "A standing relation invites select('*'), so any column added
--      to it later is silently published to the whole authenticated
--      population. A RETURNS TABLE contract cannot be widened by a caller."
--
-- FB1 already has (3) — list_my_feedback() is exactly that contract and is
-- already the frontend's read path. What is missing is (1): actually removing
-- the table-level SELECT that lets a client route around the contract. This
-- migration adds only that, so the two halves finally agree.
--
-- SELECT is not revoked outright, because three shipped operations need to
-- name the primary key:
--     public.feedback INSERT ... RETURNING id   (client.ts submitFeedback)
--     UPDATE public.feedback WHERE id = $1      (AdminFeedback.tsx:129)
--     DELETE FROM public.feedback WHERE id = $1 (AdminFeedback.tsx:136)
-- A WHERE clause reads its columns, so all three require SELECT on `id`.
-- Granting exactly that column and nothing else keeps every shipped path
-- working while leaving no column of interest reachable.
--
-- Admins are not a database role — an admin is an `authenticated` session with
-- a user_roles row — so the grant cannot distinguish them. It does not need
-- to: admins read through admin_list_feedback(), which is SECURITY DEFINER and
-- unaffected by caller grants.
--
--
-- WHAT IS DELIBERATELY LEFT ALONE
--   * RLS: untouched. All three policies stay exactly as they are. This
--     migration adds a second, independent boundary; it does not move work off
--     RLS onto grants.
--   * UPDATE / DELETE for authenticated: retained. Admins need both and share
--     the `authenticated` role with everyone else, so RLS remains the gate
--     there — correctly, since the admin policy already requires has_role().
--   * service_role: untouched. Edge functions keep working.
--   * public.feedback_upvotes: out of scope. It is empty, has had zero code
--     references since the Feedback page was rewritten, and its permissive
--     "Users can view upvotes USING (true)" policy is a separate finding.
--   * No project-wide change to ALTER DEFAULT PRIVILEGES. That would reach far
--     beyond FB1.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Ordering guard
-- ---------------------------------------------------------------------------
-- Revoking direct reads before list_my_feedback() exists would leave users
-- with no read path at all. Fail closed rather than produce that state.

DO $$
BEGIN
  IF to_regprocedure('public.list_my_feedback()') IS NULL THEN
    RAISE EXCEPTION
      'FB1: apply 20260812120000_fb1_feedback_foundation.sql first — list_my_feedback() must exist before direct reads are revoked.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. anon holds nothing
-- ---------------------------------------------------------------------------
-- Every policy on public.feedback is TO authenticated, so an anon session can
-- already do nothing here. This removes the standing grant behind that, so the
-- table is not one policy edit away from being world-readable.

REVOKE ALL ON public.feedback FROM anon;

-- ---------------------------------------------------------------------------
-- 2. authenticated loses arbitrary column reads
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.feedback FROM authenticated;

-- The primary key only. Enough for INSERT ... RETURNING id and for the admin
-- UPDATE/DELETE predicates; not enough to read anything about a report.
GRANT SELECT (id) ON public.feedback TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. INSERT is narrowed to the columns a reporter actually supplies
-- ---------------------------------------------------------------------------
-- The same default-privileges grant that made every column readable also made
-- every column writable on insert. A client could file a report with
-- status = 'completed', priority = 'low', or admin_notes pre-filled, and RLS
-- would not object: the WITH CHECK only asserts is_profile_owner(profile_id).
--
-- Columns deliberately absent from this list:
--   id, created_at, updated_at, upvotes  — defaults
--   status, priority, is_archived        — admin-owned workflow state
--   admin_notes, duplicate_of            — admin-only
--   legacy_category                      — set once by the FB1 backfill
--   type                                 — derived by normalize_feedback_submission();
--                                          a BEFORE trigger assigning NEW.type
--                                          is not privilege-checked against the
--                                          caller, so no grant is needed
--   screenshot_path                      — written only by
--                                          attach_feedback_screenshot()

REVOKE INSERT ON public.feedback FROM authenticated;

GRANT INSERT (
  profile_id,
  entry_intent,
  category,
  title,
  body,
  severity,
  reproducibility,
  expected_result,
  actual_result,
  evidence_url,
  page_url,
  client_meta
) ON public.feedback TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Corrected column documentation
-- ---------------------------------------------------------------------------
-- 20260812120000 described client_meta as submitter-readable, on the reasoning
-- that a user reading back their own user-agent string leaks nothing. That
-- reasoning still holds, but it is now moot: after this migration no column
-- but `id` is directly readable, and list_my_feedback() never returned
-- client_meta. Write-only from the client's perspective.

COMMENT ON COLUMN public.feedback.client_meta IS
  'Auto-captured client diagnostics (user agent, viewport, app version). Written by the submitter on insert, readable only by admins via admin_list_feedback().';

COMMENT ON TABLE public.feedback IS
  'Feedback Center submissions. Not directly readable: users read via list_my_feedback(), admins via admin_list_feedback(). authenticated holds SELECT on id alone, for INSERT ... RETURNING and the admin UPDATE/DELETE predicates.';

COMMIT;

-- ---------------------------------------------------------------------------
-- UNCHANGED BY THIS MIGRATION — confirmed by reading each definition
-- ---------------------------------------------------------------------------
--   list_my_feedback()              SECURITY DEFINER; runs as owner, so the
--                                   revoke above does not touch it. Still
--                                   filters with is_profile_owner().
--   admin_list_feedback(boolean)    SECURITY DEFINER; still gated on has_role.
--   attach_feedback_screenshot()    SECURITY DEFINER; still the only non-admin
--                                   write to a row after insert.
--   enforce_feedback_rate_limit()   SECURITY DEFINER — which is load-bearing
--                                   here: it counts rows in public.feedback,
--                                   and would have started failing every
--                                   insert if it ran as the caller.
--   normalize_feedback_submission() Not SECURITY DEFINER, and does not need to
--                                   be: it only reads and writes NEW.
--   notify_admins_on_feedback()     SECURITY DEFINER; inserts into
--                                   admin_notifications, never reads feedback.
--   All three RLS policies          Untouched.
