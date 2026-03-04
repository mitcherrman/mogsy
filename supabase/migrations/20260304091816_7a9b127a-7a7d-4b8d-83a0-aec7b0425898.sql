
-- Fix 1: Restrict league_memberships to authenticated users only
DROP POLICY IF EXISTS "Memberships are publicly readable" ON public.league_memberships;
CREATE POLICY "Authenticated users can view memberships"
  ON public.league_memberships
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix 2: Restrict invite_links - remove broad public SELECT, add scoped policies
DROP POLICY IF EXISTS "Anyone can read active invite links" ON public.invite_links;

-- Authenticated users can look up a specific active invite link by code (for redemption)
CREATE POLICY "Authenticated users can read active invite links"
  ON public.invite_links
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Users can read their own invite links
CREATE POLICY "Users can read own invite links"
  ON public.invite_links
  FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by_user_id);
