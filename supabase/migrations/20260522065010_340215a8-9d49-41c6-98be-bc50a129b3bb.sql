DROP POLICY IF EXISTS "Users can update own local rankings" ON public.local_rankings;
CREATE POLICY "Users can update own local rankings"
  ON public.local_rankings
  FOR UPDATE
  USING (public.is_profile_owner(profile_id))
  WITH CHECK (
    public.is_profile_owner(profile_id)
    AND local_elo BETWEEN 0 AND 3000
    AND matches_played >= 0
  );