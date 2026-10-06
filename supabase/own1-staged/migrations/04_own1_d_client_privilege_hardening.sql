-- ===========================================================================
-- OWN1-D — Client-role privilege hardening (conservative, independent).
--
-- Revokes latent TRUNCATE / REFERENCES / TRIGGER from anon and authenticated on
-- every existing public relation, and removes them from future default
-- privileges. SELECT/INSERT/UPDATE/DELETE grants (which RLS relies on) are NOT
-- touched. TRUNCATE bypasses RLS entirely, so it must never be client-held.
-- ===========================================================================

DO $existing$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END
$existing$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

DO $supa$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated';
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  RAISE NOTICE 'OWN1-D: supabase_admin default privileges not alterable here; postgres defaults hardened';
END
$supa$;

-- Regression assertion: abort if any client role still holds these.
DO $assert$
DECLARE _bad integer;
BEGIN
  SELECT count(*) INTO _bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');
  IF _bad > 0 THEN
    RAISE EXCEPTION 'OWN1-D: % client TRUNCATE/REFERENCES/TRIGGER grants remain', _bad;
  END IF;
END
$assert$;
