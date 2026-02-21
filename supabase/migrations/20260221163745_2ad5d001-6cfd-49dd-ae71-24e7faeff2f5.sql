
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can join leagues" ON public.league_memberships;
DROP POLICY IF EXISTS "Users can update own membership" ON public.league_memberships;

-- Allow any authenticated user to insert league memberships (needed for voting on others)
CREATE POLICY "Authenticated users can insert memberships"
ON public.league_memberships
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Allow any authenticated user to update league memberships (needed for ELO updates from voting)
CREATE POLICY "Authenticated users can update memberships"
ON public.league_memberships
FOR UPDATE
USING (auth.uid() IS NOT NULL);
