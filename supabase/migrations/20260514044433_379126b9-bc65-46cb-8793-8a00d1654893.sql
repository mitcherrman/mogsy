-- 1) profile-photos: allow owners to update their own object metadata
DROP POLICY IF EXISTS "Owners can update own profile photos" ON storage.objects;
CREATE POLICY "Owners can update own profile photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 2) profiles: defence-in-depth column lock for non-admin updates.
-- Replace the existing permissive UPDATE policy with one that requires the
-- protected/paid columns to remain equal to their current values for
-- non-admins. The protect_profile_premium_fields trigger remains the primary
-- enforcement; this is a secondary RLS-layer control.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profiles.id
        AND p.is_pro IS NOT DISTINCT FROM profiles.is_pro
        AND p.diamonds IS NOT DISTINCT FROM profiles.diamonds
        AND p.boost_credits IS NOT DISTINCT FROM profiles.boost_credits
        AND p.elo_shields IS NOT DISTINCT FROM profiles.elo_shields
        AND p.reveals IS NOT DISTINCT FROM profiles.reveals
        AND p.rewinds IS NOT DISTINCT FROM profiles.rewinds
        AND p.is_bot IS NOT DISTINCT FROM profiles.is_bot
        AND p.is_flagged_underage IS NOT DISTINCT FROM profiles.is_flagged_underage
        AND p.admin_notes IS NOT DISTINCT FROM profiles.admin_notes
        AND p.ads_enabled IS NOT DISTINCT FROM profiles.ads_enabled
    )
  )
);

-- 3) multiplayer_games: require non-anonymous, non-bot profile to create games
DROP POLICY IF EXISTS "Authenticated users can create games" ON public.multiplayer_games;
CREATE POLICY "Real users can create games"
ON public.multiplayer_games
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND COALESCE(p.is_anonymous, false) = false
      AND COALESCE(p.is_bot, false) = false
  )
);