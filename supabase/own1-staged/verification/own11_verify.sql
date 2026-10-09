-- OWN1.1 verification (read-only). Run after 05_own11_routine_owner_rpcs.sql.
-- Every row must report ok = true.
SELECT 'admin_create_bot_profile is trusted' AS check,
       position('assert_owner(''trusted''); -- OWN1 (OWN1.1' IN pg_get_functiondef('public.admin_create_bot_profile'::regproc)) > 0 AS ok
UNION ALL
SELECT 'admin_update_bot_profile is trusted',
       position('assert_owner(''trusted''); -- OWN1 (OWN1.1' IN pg_get_functiondef('public.admin_update_bot_profile'::regproc)) > 0
UNION ALL
SELECT 'admin_link_friendship: bots trusted, people fresh_aal2',
       position('THEN ''trusted'' ELSE ''fresh_aal2'' END); -- OWN1 (OWN1.1' IN pg_get_functiondef('public.admin_link_friendship'::regproc)) > 0
UNION ALL
SELECT 'admin_set_pro_grant still fresh_aal2',
       position('assert_owner(''fresh_aal2''); -- OWN1' IN pg_get_functiondef('public.admin_set_pro_grant'::regproc)) > 0
UNION ALL
SELECT 'owner_device_enroll still fresh_aal2',
       position('assert_owner(''fresh_aal2'')' IN pg_get_functiondef('public.owner_device_enroll'::regproc)) > 0
UNION ALL
SELECT 'owner_device_revoke still fresh_aal2',
       position('assert_owner(''fresh_aal2'')' IN pg_get_functiondef('public.owner_device_revoke'::regproc)) > 0
UNION ALL
-- Every relaxed RPC still requires the canonical owner first (is_master_admin).
SELECT 'bot RPCs still owner-gated',
       position('is_master_admin(_actor_uid)' IN pg_get_functiondef('public.admin_update_bot_profile'::regproc)) > 0
   AND position('is_master_admin(_actor_uid)' IN pg_get_functiondef('public.admin_create_bot_profile'::regproc)) > 0
   AND position('is_master_admin(_actor_uid)' IN pg_get_functiondef('public.admin_link_friendship'::regproc)) > 0;
