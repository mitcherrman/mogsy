-- OWN1 post-apply verification. Run inside a transaction and ROLL BACK.
-- Simulates clients by setting role + JWT claims. Replace :owner and :other
-- with real UUIDs at run time (never commit them).
BEGIN;

-- 1. A non-owner holding a legacy admin/master_admin row is NOT admin.
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'other', 'role','authenticated','aal','aal2','session_id', gen_random_uuid())::text, true);
SELECT 'non_owner_has_admin', public.has_role(:'other'::uuid, 'admin') = false AS pass;
SELECT 'non_owner_is_master', public.is_master_admin(:'other'::uuid) = false AS pass;
SELECT 'non_owner_state', (public.owner_auth_state()->>'authorized')::boolean = false AS pass;
-- direct RPC bypass attempts must raise insufficient_privilege:
--   SELECT public.admin_set_pro_grant(:'other'::uuid, 'playtest', now()+interval '1 day', 'x');
--   SELECT public.owner_device_enroll('x', null);
--   INSERT INTO public.user_roles(user_id, role) VALUES (:'other', 'master_admin');

-- 2. Owner at aal1 with no device: not authorized.
SELECT set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role','authenticated','aal','aal1','session_id', gen_random_uuid())::text, true);
SELECT 'owner_aal1', public.is_owner() = false AS pass;

-- 3. Owner at aal2, stale MFA: authorized but NOT fresh.
SELECT set_config('request.jwt.claims', json_build_object('sub', :'owner','role','authenticated','aal','aal2','session_id', gen_random_uuid(),
  'amr', json_build_array(json_build_object('method','totp','timestamp', extract(epoch from now() - interval '1 hour')::bigint)))::text, true);
SELECT 'owner_aal2', public.is_owner() AS pass;
SELECT 'owner_stale', public.is_owner_fresh_aal2() = false AS pass;

-- 4. Fresh aal2.
SELECT set_config('request.jwt.claims', json_build_object('sub', :'owner','role','authenticated','aal','aal2','session_id', gen_random_uuid(),
  'amr', json_build_array(json_build_object('method','totp','timestamp', extract(epoch from now())::bigint)))::text, true);
SELECT 'owner_fresh', public.is_owner_fresh_aal2() AS pass;

-- 5. No client TRUNCATE anywhere.
RESET role;
SELECT 'no_client_truncate', count(*) = 0 AS pass FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated') AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER');

ROLLBACK;
