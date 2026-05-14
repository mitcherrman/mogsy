
-- 1) Lock down active_boost_until on profiles
CREATE OR REPLACE FUNCTION public.protect_profile_premium_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    NEW.is_pro := OLD.is_pro;
    NEW.diamonds := OLD.diamonds;
    NEW.boost_credits := OLD.boost_credits;
    NEW.elo_shields := OLD.elo_shields;
    NEW.reveals := OLD.reveals;
    NEW.rewinds := OLD.rewinds;
    NEW.is_bot := OLD.is_bot;
    NEW.is_flagged_underage := OLD.is_flagged_underage;
    NEW.admin_notes := OLD.admin_notes;
    NEW.ads_enabled := OLD.ads_enabled;
    NEW.active_boost_until := OLD.active_boost_until;
  END IF;
  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND (
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
        AND p.active_boost_until IS NOT DISTINCT FROM profiles.active_boost_until
    )
  )
);

-- Atomic boost activation: deducts one credit and sets expiry
CREATE OR REPLACE FUNCTION public.activate_boost()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_until timestamptz := now() + interval '24 hours';
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  UPDATE public.profiles
     SET boost_credits = boost_credits - 1,
         active_boost_until = v_until
   WHERE id = v_profile_id
     AND boost_credits > 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No boost credits available';
  END IF;

  RETURN v_until;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_boost() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.activate_boost() TO authenticated;

-- 2) Multiplayer integrity: lock down field-level updates
DROP POLICY IF EXISTS "Players can update their own player record" ON public.multiplayer_players;
CREATE POLICY "Players can update their own player record"
ON public.multiplayer_players
FOR UPDATE
USING (is_profile_owner(profile_id))
WITH CHECK (
  is_profile_owner(profile_id)
  AND EXISTS (
    SELECT 1 FROM public.multiplayer_players mp
    WHERE mp.id = multiplayer_players.id
      AND mp.is_host IS NOT DISTINCT FROM multiplayer_players.is_host
      AND mp.team_id IS NOT DISTINCT FROM multiplayer_players.team_id
      AND mp.game_id IS NOT DISTINCT FROM multiplayer_players.game_id
      AND mp.profile_id IS NOT DISTINCT FROM multiplayer_players.profile_id
  )
);

-- Restrict team score updates to the game host only
DROP POLICY IF EXISTS "Players can update teams in their games" ON public.multiplayer_teams;
CREATE POLICY "Hosts can update teams in their games"
ON public.multiplayer_teams
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.multiplayer_players mp
    JOIN public.profiles p ON p.id = mp.profile_id
    WHERE mp.game_id = multiplayer_teams.game_id
      AND p.user_id = auth.uid()
      AND mp.is_host = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.multiplayer_players mp
    JOIN public.profiles p ON p.id = mp.profile_id
    WHERE mp.game_id = multiplayer_teams.game_id
      AND p.user_id = auth.uid()
      AND mp.is_host = true
  )
  AND EXISTS (
    SELECT 1 FROM public.multiplayer_teams t
    WHERE t.id = multiplayer_teams.id
      AND t.game_id IS NOT DISTINCT FROM multiplayer_teams.game_id
      AND t.team_index IS NOT DISTINCT FROM multiplayer_teams.team_index
  )
);

-- 3) Re-assert column-level revoke on custom_links grant fields
REVOKE SELECT (grant_pro, grant_diamonds) ON public.custom_links FROM anon, authenticated;
