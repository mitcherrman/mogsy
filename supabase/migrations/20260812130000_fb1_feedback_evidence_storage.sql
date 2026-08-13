-- FB1 Phase 2 — private evidence bucket for feedback screenshots.
--
-- Applied by hand through the Lovable Cloud SQL Editor, after
-- 20260812120000_fb1_feedback_foundation.sql. Runs top-to-bottom in one
-- transaction.
--
--
-- WHY THE BUCKET IS PRIVATE
-- profile-photos and animation-assets are public buckets, and that is fine for
-- avatars and UI art. A feedback screenshot is the opposite kind of object: it
-- is whatever happened to be on the reporter's screen — a Riot ID, a Discord
-- overlay, an email in an adjacent tab, a display name. A public bucket makes
-- every one of those world-readable by URL forever, with no auth and no expiry.
-- This follows champion-images (20260609012935) instead: private bucket, reads
-- through short-lived signed URLs.
--
--
-- WHY screenshot_path IS SET BY AN RPC AND NOT BY THE CLIENT
-- Users deliberately hold no UPDATE policy on public.feedback — they cannot
-- edit a report after filing it, which is what keeps the record trustworthy.
-- So the client cannot upload first and patch the row afterwards. Widening
-- UPDATE to fix that would let a user rewrite title, body and category too, and
-- column-scoped grants are not a usable control on this project (the
-- ALTER DEFAULT PRIVILEGES problem documented in 20260730150000).
--
-- attach_feedback_screenshot() is the narrow alternative: it sets exactly one
-- column, only on a row the caller owns, only to a path inside the caller's own
-- folder, and only once. Write-once matters — it is what stops a reporter
-- swapping the evidence after an admin has read the report.
--
-- Ordering that falls out of this: insert the row, then upload, then attach.
-- An upload cannot be orphaned by a failed insert because the insert already
-- happened, and a failed upload just leaves a report with no screenshot, which
-- is a legal state.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Bucket
-- ---------------------------------------------------------------------------
-- 5 MB ceiling is the post-compression headroom: the client downscales to
-- 1920px and re-encodes to WebP before upload, which puts a typical screenshot
-- at 200-400 KB. The limit is the backstop for a client that misbehaves or is
-- bypassed entirely, so it is enforced here rather than only in the form.
--
-- MIME allow-list is enforced by storage. A file whose real type is not one of
-- these is rejected regardless of its extension or the Content-Type the client
-- claims.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-evidence',
  'feedback-evidence',
  false,
  5242880,
  ARRAY['image/webp', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Object policies
-- ---------------------------------------------------------------------------
-- Path contract: <auth.uid()>/<uuid>.webp
-- The first path segment IS the owner. Every policy below pivots on it, so a
-- session can only ever reach its own folder.

-- Upload into your own folder. Anonymous sessions carry the `authenticated`
-- role and are legitimate reporters, so they are included by design.
CREATE POLICY "feedback-evidence owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'feedback-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read your own folder. Lets the form show the reporter what they attached.
CREATE POLICY "feedback-evidence owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'feedback-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins read everything, which is the entire point of collecting evidence.
CREATE POLICY "feedback-evidence admin read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'feedback-evidence'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Admins delete, for orphan cleanup and for removing anything that should not
-- have been uploaded. Deliberately NO owner DELETE and NO UPDATE for anyone:
-- evidence a reporter has submitted is not theirs to withdraw or replace once
-- an admin may have acted on it.
CREATE POLICY "feedback-evidence admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'feedback-evidence'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- ---------------------------------------------------------------------------
-- 3. Attach RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attach_feedback_screenshot(
  _feedback_id uuid,
  _path        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owned   boolean;
  _existing text;
BEGIN
  -- The caller must own the report. is_profile_owner returns false for a NULL
  -- profile_id, so a report whose submitter has been purged can never be
  -- re-attached to by anyone.
  SELECT public.is_profile_owner(f.profile_id), f.screenshot_path
    INTO _owned, _existing
  FROM public.feedback f
  WHERE f.id = _feedback_id;

  IF _owned IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'feedback_not_owned';
  END IF;

  -- Write-once. Prevents swapping evidence after submission.
  IF _existing IS NOT NULL THEN
    RAISE EXCEPTION 'feedback_screenshot_already_attached';
  END IF;

  -- The path must live in the caller's own folder. Without this an owner of
  -- report A could point it at an object belonging to another user.
  IF _path IS NULL OR split_part(_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'feedback_screenshot_path_invalid';
  END IF;

  UPDATE public.feedback
     SET screenshot_path = _path
   WHERE id = _feedback_id;
END;
$$;

-- New functions inherit EXECUTE for PUBLIC, anon, authenticated and
-- service_role from ALTER DEFAULT PRIVILEGES in this project. Narrow it,
-- matching 20260514042724, 20260730140000 and 20260812120000.
REVOKE ALL ON FUNCTION public.attach_feedback_screenshot(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_feedback_screenshot(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.attach_feedback_screenshot(uuid, text) IS
  'Sets feedback.screenshot_path once, for a report the caller owns, to a path inside the caller''s own storage folder. The only sanctioned write to feedback by a non-admin after insert.';

COMMIT;
