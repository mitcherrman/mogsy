-- OWN1.1 SQL 06 verification. Run after 06_own11_profile_delete_fresh_mfa.sql;
-- every row must report ok = true. After rollback/own11_06_rollback.sql the
-- same script must show section A rows false and the two "refused" probes as
-- "allowed" (ok = false): that is the proof the rollback restored behaviour.
--
-- Section A is read-only catalog checks. Section B runs DELETE probes, each in
-- a sub-transaction that is ALWAYS rolled back (the probe raises at its end;
-- a refusal raises earlier). No row is ever removed. Run as postgres in the
-- SQL editor (RLS is bypassed there, so B tests the trigger alone; RLS is
-- unchanged by 06 and is covered by the live owner/non-owner checks).

-- A. Catalog --------------------------------------------------------------
-- to_regprocedure() is NULL when the function is absent, so after a rollback
-- these rows report false instead of erroring.
WITH f AS (SELECT to_regprocedure('public.enforce_profile_delete_owner_step_up()') AS oid)
SELECT 'trigger exists, enabled, BEFORE DELETE, per row' AS check,
       EXISTS (
         SELECT 1 FROM pg_trigger t, f
         WHERE t.tgrelid = 'public.profiles'::regclass
           AND t.tgname = 'zz_own11_profile_delete_step_up'
           AND t.tgenabled = 'O'
           AND (t.tgtype & 1) = 1      -- ROW
           AND (t.tgtype & 2) = 2      -- BEFORE
           AND (t.tgtype & 8) = 8      -- DELETE
           AND t.tgfoid = f.oid
       ) AS ok
UNION ALL
SELECT 'function is SECURITY DEFINER with empty search_path',
       EXISTS (SELECT 1 FROM pg_proc p, f WHERE p.oid = f.oid AND p.prosecdef
                 AND p.proconfig @> ARRAY['search_path=""'])
UNION ALL
SELECT 'function requires fresh_aal2 for the owner',
       COALESCE((SELECT position('assert_owner(''fresh_aal2''); -- OWN1.1 S1-FIX' IN pg_get_functiondef(f.oid)) > 0
                 FROM f WHERE f.oid IS NOT NULL), false)
UNION ALL
SELECT 'clients cannot call the trigger function',
       COALESCE((SELECT NOT has_function_privilege('anon', f.oid, 'EXECUTE')
                    AND NOT has_function_privilege('authenticated', f.oid, 'EXECUTE')
                 FROM f WHERE f.oid IS NOT NULL), false)
UNION ALL
SELECT 'profiles DELETE policies unchanged (no new policy from 06)',
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
                   AND cmd = 'DELETE' AND policyname ILIKE '%own11%');

-- B. Behaviour probes (always rolled back) ---------------------------------
DROP TABLE IF EXISTS pg_temp.own11_06_probe;
CREATE TEMP TABLE own11_06_probe (probe text, expect text, outcome text, ok boolean);

DO $own11_06_probe$
DECLARE
  _owner uuid := private.configured_owner_id();
  _victim record;
  _now bigint := extract(epoch FROM now())::bigint;
  _msg text;
  _p record;
BEGIN
  SELECT id, user_id INTO _victim FROM public.profiles
  WHERE user_id IS DISTINCT FROM _owner AND user_id IS NOT NULL
  ORDER BY created_at DESC LIMIT 1;
  IF _owner IS NULL OR _victim.id IS NULL THEN
    INSERT INTO own11_06_probe VALUES ('setup', 'owner configured and a non-owner profile exists', 'missing', false);
    RETURN;
  END IF;

  FOR _p IN
    SELECT * FROM (VALUES
      ('owner aal1 (trusted only) deletes another profile', 'refused',
        jsonb_build_object('role', 'authenticated', 'sub', _owner, 'aal', 'aal1')),
      ('owner aal2, MFA 1h ago, deletes another profile', 'refused',
        jsonb_build_object('role', 'authenticated', 'sub', _owner, 'aal', 'aal2',
          'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', _now - 3600)))),
      ('owner fresh aal2 deletes another profile', 'allowed',
        jsonb_build_object('role', 'authenticated', 'sub', _owner, 'aal', 'aal2',
          'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', _now)))),
      ('user deletes own profile (self, aal1)', 'allowed',
        jsonb_build_object('role', 'authenticated', 'sub', _victim.user_id, 'aal', 'aal1')),
      ('service_role deletes a profile', 'allowed',
        jsonb_build_object('role', 'service_role')),
      ('no JWT (migration / SQL editor)', 'allowed', NULL::jsonb)
    ) AS v(probe, expect, claims)
  LOOP
    -- One DELETE under these JWT claims. The sub-block always ends in an
    -- exception, so the delete, its cascades and the claims are rolled back.
    BEGIN
      PERFORM set_config('request.jwt.claims', COALESCE(_p.claims::text, ''), true);
      PERFORM set_config('request.jwt.claim.role', '', true);
      PERFORM set_config('request.jwt.claim.sub', '', true);
      DELETE FROM public.profiles WHERE id = _victim.id;
      RAISE EXCEPTION 'own11_06_probe_rollback';
    EXCEPTION WHEN OTHERS THEN
      _msg := SQLERRM;
    END;
    INSERT INTO own11_06_probe VALUES (
      _p.probe, _p.expect,
      CASE WHEN _msg = 'step_up_required' THEN 'refused'
           WHEN _msg = 'own11_06_probe_rollback' THEN 'allowed'
           ELSE 'other error: ' || _msg END,
      CASE WHEN _msg = 'step_up_required' THEN _p.expect = 'refused'
           WHEN _msg = 'own11_06_probe_rollback' THEN _p.expect = 'allowed'
           ELSE false END);
  END LOOP;
END
$own11_06_probe$;

SELECT * FROM own11_06_probe;
-- Every row must report ok = true. An "other error" (e.g. a RESTRICT foreign
-- key on the probed profile) means the probe could not decide: re-run after
-- pointing _victim at a different profile. Cascaded side effects (including
-- pg_net webhook rows) are inside the rolled-back sub-transaction too.
