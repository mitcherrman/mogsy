-- ===========================================================================
-- PT1.7 — READ-ONLY verification of gifts in production. Run as the project
-- owner in the SQL editor, BEFORE and AFTER applying drizzle 0004. Everything
-- runs in a READ ONLY transaction that is rolled back.
-- ===========================================================================
BEGIN READ ONLY;

-- A1. Existing gift rows by type/status (0004 enforces recipient email on ALL
--     of them at redemption; a paid, unredeemed row with no recipient_email
--     would become unredeemable — expect zero).
SELECT gift_type, status, count(*) AS n,
       count(*) FILTER (WHERE recipient_email IS NULL) AS without_recipient
FROM public.gifts GROUP BY 1, 2 ORDER BY 1, 2;

-- A2. Statuses outside 0004's vocabulary (the CHECK is NOT VALID, but any such
--     row could not be updated afterwards) — expect zero rows.
SELECT status, count(*) FROM public.gifts
WHERE status NOT IN ('pending', 'paid', 'redeemed', 'refunded', 'disputed', 'expired', 'invalid')
GROUP BY 1;

-- A3. Browser-role privileges on gifts (before 0004: table-level SELECT, so the
--     20260624 column REVOKE never took effect).
SELECT has_table_privilege('anon', 'public.gifts', 'SELECT')                       AS anon_select,
       has_table_privilege('authenticated', 'public.gifts', 'INSERT,UPDATE,DELETE,TRUNCATE') AS auth_write,
       has_column_privilege('authenticated', 'public.gifts', 'stripe_session_id', 'SELECT') AS auth_reads_stripe_session;

-- A4. The redemption functions present.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND (p.proname LIKE 'gift\_%' OR p.proname IN ('redeem_gift_code', 'private_gift_terms'))
ORDER BY 1;

-- A5. What 0004 depends on.
SELECT to_regprocedure('public.apply_pro_grant(uuid,text,timestamptz,text)') IS NOT NULL AS apply_pro_grant,
       to_regprocedure('public.pro_grant_is_valid(text,timestamptz)') IS NOT NULL       AS pro_grant_is_valid,
       pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'profiles_pro_grant_kind_check')) AS grant_kinds;

-- ---------------------------------------------------------------------------
-- B. After 0004 — every row must be true.
-- ---------------------------------------------------------------------------
SELECT 'redeem_gift_code retired' AS check, to_regprocedure('public.redeem_gift_code(text)') IS NULL AS ok
UNION ALL
SELECT 'terms are $50 / usd / 365 days / no renewal',
       to_regprocedure('public.private_gift_terms()') IS NOT NULL
       AND public.private_gift_terms() =
         '{"offer_id":"first_customer_annual_gift","gift_type":"pro_annual","amount_cents":5000,"currency":"usd","premium_days":365,"auto_renews":false}'::jsonb
UNION ALL
SELECT 'gift functions: definer, empty search_path, service_role only',
       NOT EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND (p.proname LIKE 'gift\_%' OR p.proname = 'private_gift_terms')
           AND (has_function_privilege('anon', p.oid, 'EXECUTE')
             OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
             OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
             OR NOT ('search_path=""' = ANY (COALESCE(p.proconfig, ARRAY[]::text[])))
             OR (p.proname <> 'private_gift_terms' AND NOT p.prosecdef)))
UNION ALL
SELECT 'no browser write or payment-column read on gifts',
       NOT has_table_privilege('anon', 'public.gifts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
       AND NOT has_table_privilege('authenticated', 'public.gifts', 'INSERT,UPDATE,DELETE,TRUNCATE')
       AND NOT has_column_privilege('authenticated', 'public.gifts', 'stripe_session_id', 'SELECT')
       AND NOT has_column_privilege('authenticated', 'public.gifts', 'stripe_payment_intent_id', 'SELECT')
UNION ALL
SELECT 'one pending private gift per buyer, one row per PaymentIntent',
       to_regclass('public.gifts_one_pending_private_per_sender_uidx') IS NOT NULL
       AND to_regclass('public.gifts_payment_intent_uidx') IS NOT NULL;

ROLLBACK;
