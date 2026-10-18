-- EMAIL1 read-only verification. Run in the Supabase SQL editor BEFORE and AFTER
-- applying 01_email1_subscriptions.sql. Writes nothing.

-- 1. Tables exist, RLS enabled on all six (expect 6 rows, rls = true).
SELECT c.relname AS table_name, c.relrowsecurity AS rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('email_subscriptions', 'email_consent_events', 'email_confirmation_tokens',
                     'email_suppressions', 'newsletter_campaigns', 'newsletter_deliveries')
 ORDER BY 1;

-- 2. No existing user was subscribed by the migration (expect 0, 0, 0).
SELECT (SELECT count(*) FROM public.email_subscriptions)  AS subscriptions,
       (SELECT count(*) FROM public.email_consent_events) AS consent_events,
       (SELECT count(*) FROM public.newsletter_campaigns) AS campaigns;

-- 3. Browser roles hold no write privilege on any of the six (expect 0 rows).
SELECT grantee, table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('email_subscriptions', 'email_consent_events', 'email_confirmation_tokens',
                      'email_suppressions', 'newsletter_campaigns', 'newsletter_deliveries')
   AND grantee IN ('anon', 'authenticated', 'PUBLIC')
   AND privilege_type <> 'SELECT';

-- 4. Browser roles can execute only the owner-gated admin RPCs (expect 7 rows, all admin_*).
SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND (p.proname LIKE 'email\_%' OR p.proname LIKE 'newsletter\_%' OR p.proname LIKE 'admin\_email\_%'
        OR p.proname LIKE 'admin\_newsletter\_%' OR p.proname LIKE '\_email\_%' OR p.proname LIKE '\_newsletter\_%')
   AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
 ORDER BY 1;
