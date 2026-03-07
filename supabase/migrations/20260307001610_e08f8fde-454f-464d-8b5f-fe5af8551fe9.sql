
-- Fix 1: Restrict matches table SELECT from public to authenticated-only
DROP POLICY IF EXISTS "Matches are publicly readable" ON public.matches;
CREATE POLICY "Authenticated users can view matches"
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix 2: Profiles table - already has proper owner+admin SELECT policies.
-- No changes needed, but let's verify no overly permissive policy exists.
-- The existing policies "Users can view own profile" and "Admins can view all profiles" are correct.
