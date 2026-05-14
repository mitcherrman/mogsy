
-- Tighten multiplayer_games UPDATE: players can only touch updated_at; status/result transitions go through RPC
DROP POLICY IF EXISTS "Players can update their games" ON public.multiplayer_games;

CREATE POLICY "Players can update their games"
ON public.multiplayer_games
FOR UPDATE
USING (is_game_player(id))
WITH CHECK (
  is_game_player(id)
  AND EXISTS (
    SELECT 1 FROM public.multiplayer_games g
    WHERE g.id = multiplayer_games.id
      AND g.status IS NOT DISTINCT FROM multiplayer_games.status
      AND g.result IS NOT DISTINCT FROM multiplayer_games.result
      AND g.finished_at IS NOT DISTINCT FROM multiplayer_games.finished_at
      AND g.started_at IS NOT DISTINCT FROM multiplayer_games.started_at
      AND g.mode IS NOT DISTINCT FROM multiplayer_games.mode
      AND g.league_id IS NOT DISTINCT FROM multiplayer_games.league_id
      AND g.league_type IS NOT DISTINCT FROM multiplayer_games.league_type
      AND g.config IS NOT DISTINCT FROM multiplayer_games.config
  )
);

-- Tighten multiplayer_rounds UPDATE: players can update state but not winner_team_id/game_id/round_number
DROP POLICY IF EXISTS "Players can update rounds in their games" ON public.multiplayer_rounds;

CREATE POLICY "Players can update rounds in their games"
ON public.multiplayer_rounds
FOR UPDATE
USING (is_game_player(game_id))
WITH CHECK (
  is_game_player(game_id)
  AND EXISTS (
    SELECT 1 FROM public.multiplayer_rounds r
    WHERE r.id = multiplayer_rounds.id
      AND r.game_id IS NOT DISTINCT FROM multiplayer_rounds.game_id
      AND r.round_number IS NOT DISTINCT FROM multiplayer_rounds.round_number
      AND r.winner_team_id IS NOT DISTINCT FROM multiplayer_rounds.winner_team_id
  )
);

-- Host-only RPC: finish a game with a result
CREATE OR REPLACE FUNCTION public.finish_multiplayer_game(_game_id uuid, _result jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_host boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM multiplayer_players mp
    JOIN profiles p ON p.id = mp.profile_id
    WHERE mp.game_id = _game_id
      AND p.user_id = auth.uid()
      AND mp.is_host = true
  ) INTO v_is_host;

  IF NOT v_is_host THEN
    RAISE EXCEPTION 'Only the host can finish the game';
  END IF;

  UPDATE multiplayer_games
  SET status = 'finished',
      finished_at = now(),
      result = _result,
      updated_at = now()
  WHERE id = _game_id
    AND status <> 'finished';
END;
$$;

REVOKE ALL ON FUNCTION public.finish_multiplayer_game(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finish_multiplayer_game(uuid, jsonb) TO authenticated;

-- Host-only RPC: declare a round winner
CREATE OR REPLACE FUNCTION public.set_round_winner(_round_id uuid, _winner_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id uuid;
  v_is_host boolean;
  v_team_in_game boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT game_id INTO v_game_id FROM multiplayer_rounds WHERE id = _round_id;
  IF v_game_id IS NULL THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM multiplayer_players mp
    JOIN profiles p ON p.id = mp.profile_id
    WHERE mp.game_id = v_game_id
      AND p.user_id = auth.uid()
      AND mp.is_host = true
  ) INTO v_is_host;

  IF NOT v_is_host THEN
    RAISE EXCEPTION 'Only the host can declare a round winner';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM multiplayer_teams t
    WHERE t.id = _winner_team_id AND t.game_id = v_game_id
  ) INTO v_team_in_game;

  IF NOT v_team_in_game THEN
    RAISE EXCEPTION 'Winner team must belong to the same game';
  END IF;

  UPDATE multiplayer_rounds
  SET winner_team_id = _winner_team_id
  WHERE id = _round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_round_winner(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_round_winner(uuid, uuid) TO authenticated;

-- Re-assert column-level revokes on custom_links sensitive grant fields
REVOKE SELECT (grant_pro, grant_diamonds) ON public.custom_links FROM anon, authenticated;
