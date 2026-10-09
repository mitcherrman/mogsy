-- ===========================================================================
-- OWN1.1 / S1-FIX — owner deletion of ANOTHER user's profile needs fresh MFA.
--
-- Today the owner deletes a profile through RLS ("Admins can delete any
-- profile" / "Admins can delete bot profiles": has_role(auth.uid(), 'admin'),
-- which OWN1-B maps to is_owner(), i.e. a TRUSTED owner session). A profile delete cascades through
-- many foreign keys (picks, matches, league membership, notes, ...) and the
-- Admin "restore" only recreates a profile snapshot, so it is more destructive
-- than a ban, which already needs fresh_aal2. S1-QA asked for parity.
--
-- This adds a BEFORE DELETE row trigger that can only REFUSE, never allow:
--   * system paths (no client JWT, or a JWT role other than anon /
--     authenticated: service_role jobs, auth.users cascades run by the auth
--     server, migrations, the SQL editor)            -> unchanged
--   * a user deleting their OWN profile row           -> unchanged
--   * the canonical owner deleting any OTHER profile  -> assert_owner('fresh_aal2')
--   * anyone else                                     -> unchanged (RLS still
--                                                        decides; the trigger
--                                                        only fires on rows RLS
--                                                        already let through)
-- RLS policies are not touched, so non-owner access cannot be broadened.
-- The refusal is `step_up_required` with HINT `fresh_aal2`, which the
-- frontend reads as "fresh" (runOwnerAction: MFA, never replayed).
--
-- Requires OWN1-A (public.is_owner_user, public.assert_owner). Independent of
-- 05; may be applied with or before it. Idempotent.
--
-- NOT applied by committing this file. Apply in one transaction through the
-- Supabase SQL editor / migration path, then run
-- verification/own11_06_verify.sql. Rollback: rollback/own11_06_rollback.sql.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.enforce_profile_delete_owner_step_up()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _claims jsonb := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  _role text := COALESCE(_claims ->> 'role', NULLIF(current_setting('request.jwt.claim.role', true), ''));
  _uid uuid := auth.uid();
BEGIN
  -- System paths: service role, auth server cascades, migrations.
  IF _role IS NULL OR _role NOT IN ('anon', 'authenticated') THEN
    RETURN OLD;
  END IF;
  -- Self-delete is unchanged.
  IF _uid IS NOT NULL AND OLD.user_id IS NOT DISTINCT FROM _uid THEN
    RETURN OLD;
  END IF;
  -- The owner deleting someone else's (or a bot's) profile: fresh MFA.
  IF public.is_owner_user(_uid) THEN
    PERFORM public.assert_owner('fresh_aal2'); -- OWN1.1 S1-FIX (SQL 06)
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_delete_owner_step_up() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_own11_profile_delete_step_up ON public.profiles;
CREATE TRIGGER zz_own11_profile_delete_step_up
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_delete_owner_step_up();
