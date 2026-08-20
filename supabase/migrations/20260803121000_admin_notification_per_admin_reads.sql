-- NOT1 Phase 2 — per-admin read state for admin_notifications.
--
-- DEFECT
--
-- public.admin_notifications.is_read is a single global boolean. Whichever
-- admin opened a notification first marked it read for every other admin, so
-- the moderation queue silently emptied itself for colleagues who had never
-- seen the row. The bell, the admin notifications page, the admin header badge
-- and the diagnostics tile all derived "unread" from that one column.
--
-- ROOT CAUSE
--
-- is_read is overloaded with two unrelated meanings:
--
--   (a) "an admin has seen this"  -- inherently per-admin. This is the defect.
--   (b) "this moderator delete request has been dispositioned"
--       -- inherently global. AdminModeratorConfig renders it as
--          pending / Approved / Denied and hides the Approve+Deny buttons once
--          it is true. Making that per-admin would re-offer Approve to a second
--          admin for a target the first admin already deleted.
--
-- This migration splits them:
--
--   * public.admin_notification_reads is the ONLY source of truth for (a).
--   * public.admin_notifications.is_read is retained, unchanged and undropped,
--     and from here on means (b) ONLY -- the moderator-request disposition.
--
-- The column is deliberately NOT dropped or renamed in this phase: the running
-- production frontend still writes it, and the rollback path below depends on
-- its values surviving intact.
--
-- Nothing about user_notifications / user_notification_reads is touched, and no
-- policy on admin_notifications is widened. The four SECURITY DEFINER trigger
-- producers (check_and_auto_hide_image, check_and_auto_hide_comment,
-- notify_admins_on_feedback, notify_admins_on_user_report) are untouched and
-- keep bypassing RLS as table owner -- this migration adds no FORCE ROW LEVEL
-- SECURITY anywhere, which would break exactly that.

-- ---------------------------------------------------------------------------
-- 1) Receipt table
-- ---------------------------------------------------------------------------
--
-- Shape mirrors public.user_notification_reads (20260225115950) on purpose:
-- surrogate id + UNIQUE(notification_id, <subject>) so the client can use the
-- same conflict-tolerant upsert (`onConflict: "notification_id,admin_user_id",
-- ignoreDuplicates: true`) that already makes mark-one / mark-all race-safe on
-- the user side.
--
-- admin_user_id is auth.uid() -- the auth subject, NOT a profiles.id. It
-- carries no FK to auth.users, matching user_notification_reads.user_id and
-- every other table in this schema: this project does not create cross-schema
-- FKs into auth. A deleted admin therefore leaves orphan receipts, which are
-- inert (nothing reads a receipt except by auth.uid() equality) and are what
-- the existing user-side table already does.

CREATE TABLE IF NOT EXISTS public.admin_notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL
    REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, admin_user_id)
);

COMMENT ON TABLE public.admin_notification_reads IS
  'Per-admin read receipts for admin_notifications. A notification is unread '
  'for an admin exactly when no row here matches (notification_id, auth.uid()). '
  'This is the sole source of truth for admin read state; '
  'admin_notifications.is_read means moderator-request disposition only.';

COMMENT ON COLUMN public.admin_notification_reads.admin_user_id IS
  'auth.uid() of the admin who read it. Never a profiles.id. Always the acting '
  'session -- an admin can only ever insert their own receipt.';

-- The UNIQUE index is (notification_id, admin_user_id), which is the wrong
-- leading column for the query the product actually runs ("which of these has
-- MY session read"). This index makes that an index-only scan.
CREATE INDEX IF NOT EXISTS idx_admin_notification_reads_admin
  ON public.admin_notification_reads (admin_user_id, notification_id);

-- ---------------------------------------------------------------------------
-- 2) RLS -- an admin sees and writes their own receipts and nobody else's
-- ---------------------------------------------------------------------------

ALTER TABLE public.admin_notification_reads ENABLE ROW LEVEL SECURITY;

-- Both clauses matter. `auth.uid() = admin_user_id` is what isolates one admin
-- from another; `has_role(..., 'admin')` is what keeps an ordinary
-- authenticated user out of the table entirely rather than merely giving them
-- an empty result. has_role() already returns true for master_admin
-- (20260223120918), so the master admin needs no separate policy.
CREATE POLICY "Admins can read own admin notification receipts"
  ON public.admin_notification_reads
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = admin_user_id
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can insert own admin notification receipts"
  ON public.admin_notification_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = admin_user_id
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- No UPDATE policy: a receipt is immutable -- re-reading something does not
-- change the fact that it was read.
--
-- No DELETE policy: the product has no "mark as unread" affordance in the bell,
-- the notifications page or the moderator queue. Adding one would let an admin
-- resurrect their own unread badge, which nothing asks for. Restoring unread
-- state remains a service-role operation.
--
-- Both policies are TO authenticated, so the anon role has no policy at all on
-- this table and RLS denies it by default. The REVOKE below removes the
-- table-level grant too, so an anonymous session fails at the privilege check
-- rather than silently resolving to zero rows.
--
-- `authenticated` MUST be revoked as well, not only `anon`.
--
-- This project carries Supabase's stock default privileges:
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
--
-- They are attached to the creating role, so the CREATE TABLE above hands
-- `authenticated` DELETE, TRUNCATE, REFERENCES, TRIGGER and UPDATE before this
-- line is even reached. A GRANT of SELECT, INSERT on top of that ADDS nothing
-- and REMOVES nothing -- the first version of this migration revoked only from
-- anon and left `authenticated` holding all seven privileges.
--
-- RLS still refused every unauthorised row (there is no UPDATE or DELETE
-- policy, so those resolve to zero rows), so nothing was exploitable. But the
-- privilege boundary is a second, independent gate and it was not the one this
-- migration claimed to install: TRUNCATE in particular is NOT filtered by RLS
-- at all, so `authenticated` genuinely could have emptied the table.
--
-- service_role keeps its default grants deliberately -- it is the BYPASSRLS
-- role used by edge functions and admin tooling, and narrowing it is out of
-- scope for this migration.
REVOKE ALL
ON public.admin_notification_reads
FROM anon, authenticated;

GRANT SELECT, INSERT
ON public.admin_notification_reads
TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Realtime -- keep an admin's own tabs consistent
-- ---------------------------------------------------------------------------
--
-- admin_notifications is already published (20260523081658), which is how a new
-- notification reaches an open bell. Publishing receipts too lets an admin's
-- other tabs converge when they read something in one of them. Realtime applies
-- the SELECT policy above, so a receipt is only ever delivered to the admin who
-- owns it -- one admin's read never streams to another.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'admin_notification_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notification_reads;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4) Backfill
-- ---------------------------------------------------------------------------
--
-- Without this, every admin_notification that is globally read today becomes
-- unread for every admin the moment the frontend starts reading receipts, and
-- the badge jumps to the full history at once.
--
-- So: one receipt per (globally-read notification x currently-privileged admin).
-- That reproduces, exactly, what each current admin sees in production today,
-- because today they all see the same thing.
--
-- Scope is deliberately narrow, and the two boundaries are the decision:
--
--   * is_read = false rows get NO receipts. They are unread for everyone today
--     and stay unread for everyone. No information is invented.
--   * only users holding admin/master_admin AT MIGRATION TIME are backfilled.
--     An admin promoted afterwards starts with zero receipts and therefore sees
--     the historical queue as unread. That is intentional and was the explicit
--     instruction: read state is personal, and a new admin has genuinely not
--     read any of it. The blast radius is bounded by the client, which reads
--     the 30 (bell) / 50 (page) most recent rows.
--
-- read_at is now(), not the original read time -- the old schema never recorded
-- when anything was read, and inventing a timestamp would be worse than an
-- honest migration stamp.
INSERT INTO public.admin_notification_reads (notification_id, admin_user_id)
SELECT n.id, r.user_id
FROM public.admin_notifications n
CROSS JOIN (
  SELECT DISTINCT user_id
  FROM public.user_roles
  WHERE role::text IN ('admin', 'master_admin')
) AS r
WHERE n.is_read = true
ON CONFLICT (notification_id, admin_user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5) Unread count, per calling admin
-- ---------------------------------------------------------------------------
--
-- Replaces `.eq("is_read", false)` counts in Admin.tsx and AdminDiagnostics.tsx.
-- PostgREST cannot express NOT EXISTS against another table, and doing it
-- client-side would mean shipping every id to the browser just to count them.
--
-- INVOKER rights, deliberately: there is nothing here the caller cannot already
-- do. RLS on admin_notifications restricts the outer scan to admins, and RLS on
-- admin_notification_reads restricts the subquery to the caller's own receipts,
-- so no other admin's receipts can influence -- or leak through -- the result.
-- A SECURITY DEFINER version would have to re-implement both checks by hand.
--
-- The has_role() guard is an explicit precondition rather than a leak fix: a
-- non-admin already resolves to 0 via RLS. It exists so a non-admin caller gets
-- a definite error instead of a plausible-looking zero.
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
      AND r.admin_user_id = auth.uid()   -- identity from the session, never an argument
  );

  RETURN _count;
END;
$$;

COMMENT ON FUNCTION public.admin_unread_notification_count() IS
  'Count of admin_notifications with no read receipt for the CALLING admin. '
  'Takes no arguments by design -- the subject is always auth.uid().';

REVOKE EXECUTE ON FUNCTION public.admin_unread_notification_count() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_unread_notification_count() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Moderator request disposition + acting admin's receipt, atomically
-- ---------------------------------------------------------------------------
--
-- Approve/Deny in AdminModeratorConfig previously did one UPDATE that both
-- dispositioned the request and (as a side effect of the overloaded column)
-- marked it read for everyone. Splitting read state out would have turned that
-- into two independent client writes, where a failure between them leaves a
-- request dispositioned but unread, or read but still showing Approve/Deny.
--
-- One function, one transaction, both effects:
--
--   * is_read := true and the [APPROVED]/[DENIED] suffix -- the GLOBAL
--     disposition. Correct: the deletion has already happened, and no second
--     admin should be offered the buttons again.
--   * a receipt for auth.uid() -- the acting admin has plainly seen it. Other
--     admins keep their own unread state, which is honest: they have not.
--
-- INVOKER rights again; the caller's own UPDATE and INSERT policies apply.
-- There is no _admin_user_id parameter and there never should be: the subject
-- is auth.uid(), so this cannot be used to forge a receipt for someone else.
-- The target notification is pinned to the moderator-request types so this
-- cannot be repurposed to disposition an arbitrary report row.
CREATE OR REPLACE FUNCTION public.admin_resolve_mod_request(
  _notification_id uuid,
  _approved boolean
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  _message text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.admin_notifications
  SET is_read = true,   -- disposition, not read state
      message = COALESCE(message, '') || CASE WHEN _approved THEN ' [APPROVED]' ELSE ' [DENIED]' END
  WHERE id = _notification_id
    AND type IN ('mod_delete_request', 'mod_action')
    AND is_read = false          -- idempotent: a second click appends nothing
  RETURNING message INTO _message;

  IF _message IS NULL THEN
    -- Either already dispositioned, or not a moderator request. Report the
    -- current state rather than pretending this call changed something.
    SELECT message INTO _message
    FROM public.admin_notifications
    WHERE id = _notification_id
      AND type IN ('mod_delete_request', 'mod_action');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'no such moderator request: %', _notification_id
        USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- The acting admin has demonstrably seen it. ON CONFLICT keeps a double
  -- click, or a click after the bell already recorded a read, from failing.
  INSERT INTO public.admin_notification_reads (notification_id, admin_user_id)
  VALUES (_notification_id, auth.uid())
  ON CONFLICT (notification_id, admin_user_id) DO NOTHING;

  RETURN _message;
END;
$$;

COMMENT ON FUNCTION public.admin_resolve_mod_request(uuid, boolean) IS
  'Disposition a moderator delete request (global, via admin_notifications.is_read) '
  'and record the acting admin''s read receipt, in one transaction. The acting '
  'admin is always auth.uid() and cannot be supplied by the caller.';

REVOKE EXECUTE ON FUNCTION public.admin_resolve_mod_request(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_resolve_mod_request(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Restate the surviving meaning of the old column
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.admin_notifications.is_read IS
  'MODERATOR-REQUEST DISPOSITION ONLY (since 20260803121000). True means a '
  'mod_delete_request/mod_action has been approved or denied and must not be '
  'actioned again. This is NOT read state -- read state is per admin and lives '
  'in public.admin_notification_reads. Retained undropped for rollback safety.';

-- The 20260802120000 index (is_read, created_at DESC) is left in place: it is
-- still the right index for the moderator-request queue, which filters on the
-- disposition. The per-admin unread path uses
-- idx_admin_notification_reads_admin plus the admin_notifications PK.
