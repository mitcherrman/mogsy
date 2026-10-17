-- ===========================================================================
-- PT1.6b — READ-ONLY verification of the custom one-time offer in production.
--
-- Run in the Supabase SQL editor (or psql) as the project owner. Everything is
-- inside a READ ONLY transaction that is rolled back: nothing can be written.
-- Run it twice: BEFORE applying 0003 (section A shows what 0002 left) and
-- AFTER (section B must show every check = true).
-- ===========================================================================
BEGIN READ ONLY;

-- A1. Which drizzle migrations does the database think it has applied?
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at DESC
LIMIT 6;

-- A2. Are the 0002 tables empty? (0003 is written to be safe either way.)
SELECT
  (SELECT count(*) FROM public.custom_offer_claims)    AS claims,
  (SELECT count(*) FROM public.custom_offer_purchases) AS purchases;

-- A3. Every custom-offer-related function: definer, search_path, grants.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid)          AS args,
       p.prosecdef                                         AS security_definer,
       p.proconfig                                         AS config,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE '%custom_offer%' OR p.proname IN ('apply_pro_grant', 'my_custom_offer_purchases'))
ORDER BY p.proname;

-- A4. Browser-role table privileges (0002 left these granted: defect D2).
SELECT t.relname,
       has_table_privilege('anon', t.oid, 'SELECT')            AS anon_select,
       has_table_privilege('anon', t.oid, 'TRUNCATE')          AS anon_truncate,
       has_table_privilege('authenticated', t.oid, 'SELECT')   AS auth_select,
       has_table_privilege('authenticated', t.oid, 'TRUNCATE') AS auth_truncate,
       t.relrowsecurity                                        AS rls_enabled
FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND t.relname LIKE 'custom_offer_%' AND t.relkind = 'r'
ORDER BY t.relname;

-- A5. The constraint that lets a 'purchase' grant exist at all (from 0002).
SELECT pg_get_constraintdef(c.oid)
FROM pg_constraint c
WHERE c.conname = 'profiles_pro_grant_kind_check';

-- A6. Defect D1 evidence: the audit column 0002 writes NULL into.
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_audit_log' AND column_name = 'actor_user_id';

-- A7. The owner gate and pgcrypto the functions depend on.
SELECT
  to_regprocedure('public.assert_owner(text)') IS NOT NULL        AS assert_owner_exists,
  to_regprocedure('extensions.digest(text,text)') IS NOT NULL      AS pgcrypto_digest,
  to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL AS pgcrypto_random,
  has_table_privilege(
    (SELECT proowner::regrole::text FROM pg_proc WHERE proname = 'apply_pro_grant' LIMIT 1),
    'auth.users', 'SELECT')                                        AS definer_can_read_auth_users;

-- ---------------------------------------------------------------------------
-- B. After 0003 — every row must be true.
-- ---------------------------------------------------------------------------
SELECT 'superseded 0002 writers dropped' AS check,
       NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname IN
         ('redeem_custom_offer_claim', 'restore_custom_offer_claim',
          'record_custom_offer_purchase', 'refund_custom_offer_purchase')) AS ok
UNION ALL
SELECT 'terms are $50 / usd / 12 months / no renewal',
       to_regprocedure('public.custom_offer_terms()') IS NOT NULL
       AND public.custom_offer_terms() =
         '{"offer_id":"custom_one_time_50","amount_cents":5000,"currency":"usd","months":12,"auto_renews":false}'::jsonb
UNION ALL
SELECT 'no browser role holds a privilege on any custom_offer table',
       NOT EXISTS (
         SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'public' AND t.relname LIKE 'custom_offer_%' AND t.relkind = 'r'
           AND (has_table_privilege('anon', t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
             OR has_table_privilege('authenticated', t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')))
UNION ALL
SELECT 'service functions: definer, empty search_path, service_role only',
       NOT EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname LIKE 'custom\_offer\_%'
           AND (has_function_privilege('anon', p.oid, 'EXECUTE')
             OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
             OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
             OR NOT ('search_path=""' = ANY (COALESCE(p.proconfig, ARRAY[]::text[])))
             OR (p.proname <> 'custom_offer_terms' AND NOT p.prosecdef)))
UNION ALL
SELECT 'owner/self functions: authenticated only, never anon',
       NOT EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname IN (
           'owner_create_custom_offer_claim', 'owner_list_custom_offer_claims',
           'owner_revoke_custom_offer_claim', 'my_custom_offer_purchases')
           AND (has_function_privilege('anon', p.oid, 'EXECUTE')
             OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
             OR NOT p.prosecdef))
UNION ALL
SELECT 'claim minting demands fresh MFA',
       pg_get_functiondef('public.owner_create_custom_offer_claim(text,timestamptz,uuid)'::regprocedure)
         LIKE '%assert_owner(''fresh_aal2'')%'
UNION ALL
SELECT 'one paid purchase per claim is enforced by an index',
       to_regclass('public.custom_offer_purchases_one_paid_per_claim_uidx') IS NOT NULL;

ROLLBACK;
