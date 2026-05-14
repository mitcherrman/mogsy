-- Tighten multiplayer_rounds INSERT to require game membership
DROP POLICY IF EXISTS "Authenticated users can create rounds" ON public.multiplayer_rounds;
CREATE POLICY "Players can create rounds in their games"
ON public.multiplayer_rounds
FOR INSERT
TO authenticated
WITH CHECK (public.is_game_player(game_id));

-- Tighten multiplayer_teams INSERT: allow either game players OR initial team
-- creation by the host as part of create_multiplayer_game (which runs as
-- SECURITY DEFINER and bypasses RLS). For client inserts, require membership.
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.multiplayer_teams;
CREATE POLICY "Players can create teams in their games"
ON public.multiplayer_teams
FOR INSERT
TO authenticated
WITH CHECK (public.is_game_player(game_id));

-- Restrict joining games to those still 'waiting'
DROP POLICY IF EXISTS "Authenticated users can join games" ON public.multiplayer_players;
CREATE POLICY "Authenticated users can join waiting games"
ON public.multiplayer_players
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.is_profile_owner(profile_id)
  AND EXISTS (
    SELECT 1 FROM public.multiplayer_games g
    WHERE g.id = multiplayer_players.game_id
      AND g.status = 'waiting'
  )
);