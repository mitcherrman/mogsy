-- OWN1.1 rollback: restore the OWN1 fresh_aal2 guard on the three routine RPCs
-- that 05_own11_routine_owner_rpcs.sql relaxed. Leaves OWN1 itself in place.
-- Idempotent; touches only the single OWN1.1 guard line of each body.
DO $own11_rollback$
DECLARE _fn text; _oid oid; _def text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY['admin_create_bot_profile', 'admin_update_bot_profile', 'admin_link_friendship'] LOOP
    SELECT p.oid INTO _oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = _fn;
    _def := pg_get_functiondef(_oid);
    IF position('-- OWN1 (OWN1.1' IN _def) = 0 THEN CONTINUE; END IF;
    _def := regexp_replace(_def, E'PERFORM public\\.assert_owner\\([^\\n]*-- OWN1 \\(OWN1\\.1[^\\n]*',
                           'PERFORM public.assert_owner(''fresh_aal2''); -- OWN1');
    EXECUTE _def;
  END LOOP;
END
$own11_rollback$;
