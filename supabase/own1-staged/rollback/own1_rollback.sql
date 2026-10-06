-- OWN1 rollback (B + C). OWN1-A is additive and may stay. OWN1-D need not be
-- rolled back (no client path uses TRUNCATE/REFERENCES/TRIGGER).

-- Restore archived legacy privileged rows before restoring role semantics.
DROP TRIGGER IF EXISTS block_legacy_privileged_role_write ON public.user_roles;
DROP FUNCTION IF EXISTS public.block_legacy_privileged_role_write();

INSERT INTO public.user_roles (user_id, role)
SELECT b.user_id, b.role
FROM private.legacy_privileged_role_backup b
ON CONFLICT (user_id, role) DO NOTHING;

-- Restore pre-OWN1 role semantics (verbatim prior bodies).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (role = _role OR role::text = 'master_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'master_admin')
$$;

DROP POLICY IF EXISTS "Owner can read all roles" ON public.user_roles;
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
CREATE POLICY "Admins can read roles"   ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Strip the OWN1 guard lines from hardened RPCs.
DO $$
DECLARE _fn text; _oid oid; _def text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY['admin_set_pro_grant','admin_create_bot_profile','admin_update_bot_profile','admin_link_friendship'] LOOP
    SELECT p.oid INTO _oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=_fn;
    _def := pg_get_functiondef(_oid);
    IF position('-- OWN1' IN _def) = 0 THEN CONTINUE; END IF;
    _def := regexp_replace(_def, E'\\n  PERFORM [^\\n]*-- OWN1', '', 'g');
    EXECUTE _def;
  END LOOP;
END $$;

-- OWN1-C (only if the trigger itself is implicated).
DROP TRIGGER IF EXISTS zz_enforce_display_name_rules ON public.profiles;
