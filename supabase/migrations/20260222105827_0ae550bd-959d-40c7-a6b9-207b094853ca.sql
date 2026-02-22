
-- ============================================================
-- 1. Create SECURITY DEFINER function: record_user_match
--    Handles match insert + ELO updates + ELO shield for user-vs-user swipes
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_user_match(
  _league_id uuid,
  _winner_profile_id uuid,
  _loser_profile_id uuid,
  _caller_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _winner_elo integer;
  _loser_elo integer;
  _new_winner_elo integer;
  _new_loser_elo integer;
  _final_loser_elo integer;
  _expected_winner float;
  _expected_loser float;
  _k integer := 32;
  _shield_used boolean := false;
  _loser_shields integer;
BEGIN
  -- Verify caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller owns the caller_profile_id
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _caller_profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get current ELOs (default 1200 if not exists)
  SELECT COALESCE(elo, 1200) INTO _winner_elo
  FROM public.league_memberships WHERE league_id = _league_id AND profile_id = _winner_profile_id;
  IF NOT FOUND THEN _winner_elo := 1200; END IF;

  SELECT COALESCE(elo, 1200) INTO _loser_elo
  FROM public.league_memberships WHERE league_id = _league_id AND profile_id = _loser_profile_id;
  IF NOT FOUND THEN _loser_elo := 1200; END IF;

  -- Calculate new ELOs
  _expected_winner := 1.0 / (1.0 + power(10.0, (_loser_elo - _winner_elo)::float / 400.0));
  _expected_loser := 1.0 / (1.0 + power(10.0, (_winner_elo - _loser_elo)::float / 400.0));
  _new_winner_elo := round(_winner_elo + _k * (1.0 - _expected_winner));
  _new_loser_elo := round(_loser_elo + _k * (0.0 - _expected_loser));

  -- Check ELO shield for loser
  _final_loser_elo := _new_loser_elo;
  IF _loser_profile_id = _caller_profile_id THEN
    SELECT elo_shields INTO _loser_shields FROM public.profiles WHERE id = _caller_profile_id;
    IF _loser_shields IS NOT NULL AND _loser_shields > 0 THEN
      _final_loser_elo := _loser_elo; -- shield protects
      _shield_used := true;
      UPDATE public.profiles SET elo_shields = elo_shields - 1 WHERE id = _caller_profile_id;
    END IF;
  END IF;

  -- Insert match record
  INSERT INTO public.matches (league_id, winner_profile_id, loser_profile_id)
  VALUES (_league_id, _winner_profile_id, _loser_profile_id);

  -- Upsert winner membership
  INSERT INTO public.league_memberships (league_id, profile_id, elo, matches_played)
  VALUES (_league_id, _winner_profile_id, _new_winner_elo, 1)
  ON CONFLICT (league_id, profile_id)
  DO UPDATE SET elo = _new_winner_elo, matches_played = league_memberships.matches_played + 1, last_active_at = now();

  -- Upsert loser membership
  INSERT INTO public.league_memberships (league_id, profile_id, elo, matches_played)
  VALUES (_league_id, _loser_profile_id, _final_loser_elo, 1)
  ON CONFLICT (league_id, profile_id)
  DO UPDATE SET elo = _final_loser_elo, matches_played = league_memberships.matches_played + 1, last_active_at = now();

  RETURN jsonb_build_object(
    'newWinnerElo', _new_winner_elo,
    'newLoserElo', _final_loser_elo,
    'shieldUsed', _shield_used
  );
END;
$$;

-- ============================================================
-- 2. Create SECURITY DEFINER function: rewind_user_match
--    Reverts ELOs to previous values
-- ============================================================
CREATE OR REPLACE FUNCTION public.rewind_user_match(
  _league_id uuid,
  _winner_profile_id uuid,
  _loser_profile_id uuid,
  _prev_winner_elo integer,
  _prev_loser_elo integer,
  _caller_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rewinds integer;
BEGIN
  -- Verify caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller owns the caller_profile_id
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _caller_profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Check rewinds available
  SELECT rewinds INTO _rewinds FROM public.profiles WHERE id = _caller_profile_id;
  IF _rewinds IS NULL OR _rewinds <= 0 THEN
    RAISE EXCEPTION 'No rewinds available';
  END IF;

  -- Deduct rewind
  UPDATE public.profiles SET rewinds = rewinds - 1 WHERE id = _caller_profile_id;

  -- Revert ELOs
  INSERT INTO public.league_memberships (league_id, profile_id, elo, matches_played)
  VALUES (_league_id, _winner_profile_id, _prev_winner_elo, 1)
  ON CONFLICT (league_id, profile_id)
  DO UPDATE SET elo = _prev_winner_elo;

  INSERT INTO public.league_memberships (league_id, profile_id, elo, matches_played)
  VALUES (_league_id, _loser_profile_id, _prev_loser_elo, 1)
  ON CONFLICT (league_id, profile_id)
  DO UPDATE SET elo = _prev_loser_elo;
END;
$$;

-- ============================================================
-- 3. Create SECURITY DEFINER function: record_preset_match
--    Handles preset item match insert + ELO updates
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_preset_match(
  _league_id uuid,
  _winner_item_id uuid,
  _loser_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _winner_elo integer;
  _loser_elo integer;
  _new_winner_elo integer;
  _new_loser_elo integer;
  _expected_winner float;
  _expected_loser float;
  _k integer := 32;
BEGIN
  -- Verify caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get current ELOs
  SELECT elo INTO _winner_elo FROM public.preset_items WHERE id = _winner_item_id AND league_id = _league_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Winner item not found'; END IF;

  SELECT elo INTO _loser_elo FROM public.preset_items WHERE id = _loser_item_id AND league_id = _league_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loser item not found'; END IF;

  -- Calculate new ELOs
  _expected_winner := 1.0 / (1.0 + power(10.0, (_loser_elo - _winner_elo)::float / 400.0));
  _expected_loser := 1.0 / (1.0 + power(10.0, (_winner_elo - _loser_elo)::float / 400.0));
  _new_winner_elo := round(_winner_elo + _k * (1.0 - _expected_winner));
  _new_loser_elo := round(_loser_elo + _k * (0.0 - _expected_loser));

  -- Insert match record
  INSERT INTO public.matches (league_id, winner_item_id, loser_item_id)
  VALUES (_league_id, _winner_item_id, _loser_item_id);

  -- Update ELOs
  UPDATE public.preset_items SET elo = _new_winner_elo WHERE id = _winner_item_id;
  UPDATE public.preset_items SET elo = _new_loser_elo WHERE id = _loser_item_id;

  RETURN jsonb_build_object(
    'newWinnerElo', _new_winner_elo,
    'newLoserElo', _new_loser_elo
  );
END;
$$;

-- ============================================================
-- 4. Restrict league_memberships INSERT/UPDATE to admin only
--    (all operations now go through SECURITY DEFINER RPCs)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can insert memberships" ON public.league_memberships;
DROP POLICY IF EXISTS "Authenticated users can update memberships" ON public.league_memberships;

CREATE POLICY "Admins can insert memberships"
ON public.league_memberships
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update memberships"
ON public.league_memberships
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
