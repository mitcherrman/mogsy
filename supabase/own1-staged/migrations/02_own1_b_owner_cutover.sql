-- ===========================================================================
-- OWN1-B — Cutover: collapse admin/master_admin/moderator to the single owner.
--
-- PRECONDITION (enforced below; aborts the whole migration otherwise):
--   private.owner_config holds exactly one owner who is a live, non-anonymous,
--   unbanned auth user with at least one VERIFIED MFA factor. The cutover can
--   therefore never be applied in a state that locks the owner out.
--
-- Rollback: supabase/own1-staged/rollback/own1_rollback.sql
-- ===========================================================================

DO $preflight$
DECLARE _owner uuid; _n integer;
BEGIN
  SELECT count(*) INTO _n FROM private.owner_config;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'OWN1 preflight: private.owner_config must hold exactly one row (found %). Populate it at deployment time first.', _n;
  END IF;
  SELECT owner_user_id INTO _owner FROM private.owner_config;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _owner AND COALESCE(u.is_anonymous, false) = false
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until < now())
  ) THEN
    RAISE EXCEPTION 'OWN1 preflight: configured owner is not a live, registered, unbanned user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = _owner AND f.status = 'verified') THEN
    RAISE EXCEPTION 'OWN1 preflight: configured owner has no verified MFA factor; enroll TOTP first';
  END IF;
END
$preflight$;

-- --- compatibility shims ---------------------------------------------------
-- Every existing RLS policy / RPC that calls has_role/is_master_admin keeps
-- compiling, but privileged roles now resolve ONLY for the configured owner,
-- and only when the owner's own session is trusted (aal2 or attested device).
-- user_roles rows for admin/master_admin/moderator grant NOTHING.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN _role::text IN ('admin', 'master_admin', 'moderator') THEN
      public.is_owner_user(_user_id)
      AND auth.uid() IS NOT NULL
      AND _user_id = auth.uid()
      AND public.is_owner()
    ELSE
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = _role)
      OR (public.is_owner_user(_user_id) AND (_user_id IS DISTINCT FROM auth.uid() OR public.is_owner()))
  END
$$;

CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_owner_user(_user_id)
     AND auth.uid() IS NOT NULL
     AND _user_id = auth.uid()
     AND public.is_owner()
$$;

-- --- remove role mutation authority from clients ---------------------------
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read roles"   ON public.user_roles;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_roles FROM anon, authenticated;
CREATE POLICY "Owner can read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_owner());
COMMENT ON TABLE public.user_roles IS
  'OWN1: admin/master_admin/moderator rows are DEPRECATED and grant nothing. Authority = private.owner_config.';

-- --- sensitive RPCs: fresh aal2 + owner-write marker -----------------------
-- Prepends an explicit step-up guard to the existing bodies; the current body
-- is otherwise preserved byte-for-byte. Idempotent (skips if already guarded).
DO $harden$
DECLARE
  _fn text;
  _oid oid;
  _def text;
  _guard constant text := E'\nBEGIN\n  PERFORM public.assert_owner(''fresh_aal2''); -- OWN1\n  PERFORM set_config(''own1.owner_write'', ''on'', true); -- OWN1\n';
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'admin_set_pro_grant', 'admin_create_bot_profile', 'admin_update_bot_profile', 'admin_link_friendship'
  ] LOOP
    SELECT p.oid INTO _oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = _fn;
    IF _oid IS NULL THEN
      RAISE EXCEPTION 'OWN1: expected function public.% not found', _fn;
    END IF;
    _def := pg_get_functiondef(_oid);
    IF position('-- OWN1' IN _def) > 0 THEN CONTINUE; END IF;
    IF position(E'\nBEGIN\n' IN _def) = 0 THEN
      RAISE EXCEPTION 'OWN1: cannot locate body BEGIN in public.%', _fn;
    END IF;
    _def := regexp_replace(_def, E'\\nBEGIN\\n', _guard);  -- first occurrence only
    EXECUTE _def;
    IF position('assert_owner(''fresh_aal2'')' IN pg_get_functiondef(_oid)) = 0 THEN
      RAISE EXCEPTION 'OWN1: guard not present after rewrite of public.%', _fn;
    END IF;
  END LOOP;
END
$harden$;
