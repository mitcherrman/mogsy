-- OWN1.1 SQL 06 rollback: owner profile deletes go back to the trusted owner
-- session that RLS alone requires. Removes only what 06 added; RLS policies
-- were never changed. Idempotent.
BEGIN;
DROP TRIGGER IF EXISTS zz_own11_profile_delete_step_up ON public.profiles;
DROP FUNCTION IF EXISTS public.enforce_profile_delete_owner_step_up();
COMMIT;

-- Check (expect 0 rows):
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'zz_own11_profile_delete_step_up';
