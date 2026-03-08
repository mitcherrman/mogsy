
-- Table: local_rankings
CREATE TABLE public.local_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  league_id uuid NOT NULL,
  item_id uuid,
  target_profile_id uuid,
  local_elo integer NOT NULL DEFAULT 1200,
  matches_played integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, league_id, item_id),
  UNIQUE (profile_id, league_id, target_profile_id)
);
ALTER TABLE public.local_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own local rankings" ON public.local_rankings FOR SELECT USING (is_profile_owner(profile_id));
CREATE POLICY "Users can insert own local rankings" ON public.local_rankings FOR INSERT WITH CHECK (is_profile_owner(profile_id));
CREATE POLICY "Users can update own local rankings" ON public.local_rankings FOR UPDATE USING (is_profile_owner(profile_id));
CREATE POLICY "Admins can manage local rankings" ON public.local_rankings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Table: daily_global_sessions
CREATE TABLE public.daily_global_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  league_id uuid NOT NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, league_id, session_date)
);
ALTER TABLE public.daily_global_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sessions" ON public.daily_global_sessions FOR ALL USING (is_profile_owner(profile_id)) WITH CHECK (is_profile_owner(profile_id));

-- Table: global_elo_snapshots
CREATE TABLE public.global_elo_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL,
  item_id uuid,
  profile_id uuid,
  elo integer NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.global_elo_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshots are publicly readable" ON public.global_elo_snapshots FOR SELECT USING (true);

-- RPC: record_dual_preset_match
CREATE OR REPLACE FUNCTION public.record_dual_preset_match(
  _league_id uuid,
  _winner_item_id uuid,
  _loser_item_id uuid,
  _caller_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _winner_local_elo integer;
  _loser_local_elo integer;
  _new_winner_local integer;
  _new_loser_local integer;
  _expected_winner float;
  _expected_loser float;
  _k integer := 32;
  _counts_global boolean := false;
  _global_direction_winner text := 'none';
  _global_direction_loser text := 'none';
  _winner_global_elo integer;
  _loser_global_elo integer;
  _new_winner_global integer;
  _new_loser_global integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _caller_profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get or default local elos
  SELECT COALESCE(local_elo, 1200) INTO _winner_local_elo
  FROM local_rankings WHERE profile_id = _caller_profile_id AND league_id = _league_id AND item_id = _winner_item_id;
  IF NOT FOUND THEN _winner_local_elo := 1200; END IF;

  SELECT COALESCE(local_elo, 1200) INTO _loser_local_elo
  FROM local_rankings WHERE profile_id = _caller_profile_id AND league_id = _league_id AND item_id = _loser_item_id;
  IF NOT FOUND THEN _loser_local_elo := 1200; END IF;

  -- Calculate local elo
  _expected_winner := 1.0 / (1.0 + power(10.0, (_loser_local_elo - _winner_local_elo)::float / 400.0));
  _expected_loser := 1.0 / (1.0 + power(10.0, (_winner_local_elo - _loser_local_elo)::float / 400.0));
  _new_winner_local := round(_winner_local_elo + _k * (1.0 - _expected_winner));
  _new_loser_local := round(_loser_local_elo + _k * (0.0 - _expected_loser));

  -- Upsert local rankings
  INSERT INTO local_rankings (profile_id, league_id, item_id, local_elo, matches_played)
  VALUES (_caller_profile_id, _league_id, _winner_item_id, _new_winner_local, 1)
  ON CONFLICT (profile_id, league_id, item_id)
  DO UPDATE SET local_elo = _new_winner_local, matches_played = local_rankings.matches_played + 1, updated_at = now();

  INSERT INTO local_rankings (profile_id, league_id, item_id, local_elo, matches_played)
  VALUES (_caller_profile_id, _league_id, _loser_item_id, _new_loser_local, 1)
  ON CONFLICT (profile_id, league_id, item_id)
  DO UPDATE SET local_elo = _new_loser_local, matches_played = local_rankings.matches_played + 1, updated_at = now();

  -- Check daily global session
  INSERT INTO daily_global_sessions (profile_id, league_id, session_date)
  VALUES (_caller_profile_id, _league_id, CURRENT_DATE)
  ON CONFLICT (profile_id, league_id, session_date) DO NOTHING;

  IF FOUND THEN
    -- First session today: update global
    _counts_global := true;

    SELECT elo INTO _winner_global_elo FROM preset_items WHERE id = _winner_item_id AND league_id = _league_id;
    SELECT elo INTO _loser_global_elo FROM preset_items WHERE id = _loser_item_id AND league_id = _league_id;

    _expected_winner := 1.0 / (1.0 + power(10.0, (_loser_global_elo - _winner_global_elo)::float / 400.0));
    _expected_loser := 1.0 / (1.0 + power(10.0, (_winner_global_elo - _loser_global_elo)::float / 400.0));
    _new_winner_global := round(_winner_global_elo + _k * (1.0 - _expected_winner));
    _new_loser_global := round(_loser_global_elo + _k * (0.0 - _expected_loser));

    UPDATE preset_items SET elo = _new_winner_global WHERE id = _winner_item_id;
    UPDATE preset_items SET elo = _new_loser_global WHERE id = _loser_item_id;

    INSERT INTO matches (league_id, winner_item_id, loser_item_id)
    VALUES (_league_id, _winner_item_id, _loser_item_id);

    _global_direction_winner := 'up';
    _global_direction_loser := 'down';
  ELSE
    -- Not first session: compute direction hint without updating
    SELECT elo INTO _winner_global_elo FROM preset_items WHERE id = _winner_item_id AND league_id = _league_id;
    SELECT elo INTO _loser_global_elo FROM preset_items WHERE id = _loser_item_id AND league_id = _league_id;
    _global_direction_winner := 'up';
    _global_direction_loser := 'down';
  END IF;

  RETURN jsonb_build_object(
    'localWinnerElo', _new_winner_local,
    'localLoserElo', _new_loser_local,
    'localWinnerChange', _new_winner_local - _winner_local_elo,
    'localLoserChange', _new_loser_local - _loser_local_elo,
    'globalDirectionWinner', _global_direction_winner,
    'globalDirectionLoser', _global_direction_loser,
    'countsTowardGlobal', _counts_global
  );
END;
$$;

-- RPC: record_dual_user_match
CREATE OR REPLACE FUNCTION public.record_dual_user_match(
  _league_id uuid,
  _winner_profile_id uuid,
  _loser_profile_id uuid,
  _caller_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _winner_local_elo integer;
  _loser_local_elo integer;
  _new_winner_local integer;
  _new_loser_local integer;
  _expected_winner float;
  _expected_loser float;
  _k integer := 32;
  _counts_global boolean := false;
  _global_direction_winner text := 'none';
  _global_direction_loser text := 'none';
  _winner_global_elo integer;
  _loser_global_elo integer;
  _new_winner_global integer;
  _new_loser_global integer;
  _final_loser_global integer;
  _shield_used boolean := false;
  _loser_shields integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _caller_profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get or default local elos for the caller's personal ranking of these profiles
  SELECT COALESCE(local_elo, 1200) INTO _winner_local_elo
  FROM local_rankings WHERE profile_id = _caller_profile_id AND league_id = _league_id AND target_profile_id = _winner_profile_id;
  IF NOT FOUND THEN _winner_local_elo := 1200; END IF;

  SELECT COALESCE(local_elo, 1200) INTO _loser_local_elo
  FROM local_rankings WHERE profile_id = _caller_profile_id AND league_id = _league_id AND target_profile_id = _loser_profile_id;
  IF NOT FOUND THEN _loser_local_elo := 1200; END IF;

  -- Calculate local elo
  _expected_winner := 1.0 / (1.0 + power(10.0, (_loser_local_elo - _winner_local_elo)::float / 400.0));
  _expected_loser := 1.0 / (1.0 + power(10.0, (_winner_local_elo - _loser_local_elo)::float / 400.0));
  _new_winner_local := round(_winner_local_elo + _k * (1.0 - _expected_winner));
  _new_loser_local := round(_loser_local_elo + _k * (0.0 - _expected_loser));

  -- Upsert local rankings (using target_profile_id)
  INSERT INTO local_rankings (profile_id, league_id, target_profile_id, local_elo, matches_played)
  VALUES (_caller_profile_id, _league_id, _winner_profile_id, _new_winner_local, 1)
  ON CONFLICT (profile_id, league_id, target_profile_id)
  DO UPDATE SET local_elo = _new_winner_local, matches_played = local_rankings.matches_played + 1, updated_at = now();

  INSERT INTO local_rankings (profile_id, league_id, target_profile_id, local_elo, matches_played)
  VALUES (_caller_profile_id, _league_id, _loser_profile_id, _new_loser_local, 1)
  ON CONFLICT (profile_id, league_id, target_profile_id)
  DO UPDATE SET local_elo = _new_loser_local, matches_played = local_rankings.matches_played + 1, updated_at = now();

  -- Check daily global session
  INSERT INTO daily_global_sessions (profile_id, league_id, session_date)
  VALUES (_caller_profile_id, _league_id, CURRENT_DATE)
  ON CONFLICT (profile_id, league_id, session_date) DO NOTHING;

  IF FOUND THEN
    _counts_global := true;

    -- Get global elos
    SELECT COALESCE(elo, 1200) INTO _winner_global_elo
    FROM league_memberships WHERE league_id = _league_id AND profile_id = _winner_profile_id;
    IF NOT FOUND THEN _winner_global_elo := 1200; END IF;

    SELECT COALESCE(elo, 1200) INTO _loser_global_elo
    FROM league_memberships WHERE league_id = _league_id AND profile_id = _loser_profile_id;
    IF NOT FOUND THEN _loser_global_elo := 1200; END IF;

    _expected_winner := 1.0 / (1.0 + power(10.0, (_loser_global_elo - _winner_global_elo)::float / 400.0));
    _expected_loser := 1.0 / (1.0 + power(10.0, (_winner_global_elo - _loser_global_elo)::float / 400.0));
    _new_winner_global := round(_winner_global_elo + _k * (1.0 - _expected_winner));
    _new_loser_global := round(_loser_global_elo + _k * (0.0 - _expected_loser));

    -- Check ELO shield for loser
    _final_loser_global := _new_loser_global;
    IF _loser_profile_id = _caller_profile_id THEN
      SELECT elo_shields INTO _loser_shields FROM profiles WHERE id = _caller_profile_id;
      IF _loser_shields IS NOT NULL AND _loser_shields > 0 THEN
        _final_loser_global := _loser_global_elo;
        _shield_used := true;
        UPDATE profiles SET elo_shields = elo_shields - 1 WHERE id = _caller_profile_id;
      END IF;
    END IF;

    INSERT INTO matches (league_id, winner_profile_id, loser_profile_id)
    VALUES (_league_id, _winner_profile_id, _loser_profile_id);

    INSERT INTO league_memberships (league_id, profile_id, elo, matches_played)
    VALUES (_league_id, _winner_profile_id, _new_winner_global, 1)
    ON CONFLICT (league_id, profile_id)
    DO UPDATE SET elo = _new_winner_global, matches_played = league_memberships.matches_played + 1, last_active_at = now();

    INSERT INTO league_memberships (league_id, profile_id, elo, matches_played)
    VALUES (_league_id, _loser_profile_id, _final_loser_global, 1)
    ON CONFLICT (league_id, profile_id)
    DO UPDATE SET elo = _final_loser_global, matches_played = league_memberships.matches_played + 1, last_active_at = now();

    _global_direction_winner := 'up';
    _global_direction_loser := CASE WHEN _shield_used THEN 'none' ELSE 'down' END;
  ELSE
    _global_direction_winner := 'up';
    _global_direction_loser := 'down';
  END IF;

  RETURN jsonb_build_object(
    'localWinnerElo', _new_winner_local,
    'localLoserElo', _new_loser_local,
    'localWinnerChange', _new_winner_local - _winner_local_elo,
    'localLoserChange', _new_loser_local - _loser_local_elo,
    'globalDirectionWinner', _global_direction_winner,
    'globalDirectionLoser', _global_direction_loser,
    'countsTowardGlobal', _counts_global,
    'shieldUsed', _shield_used
  );
END;
$$;
