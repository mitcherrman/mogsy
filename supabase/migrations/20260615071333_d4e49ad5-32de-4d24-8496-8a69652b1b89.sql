CREATE OR REPLACE FUNCTION public.rewind_user_match(_league_id uuid, _winner_profile_id uuid, _loser_profile_id uuid, _prev_winner_elo integer, _prev_loser_elo integer, _caller_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rewinds integer;
  _cur_winner_elo integer;
  _cur_loser_elo integer;
  _winner_delta integer;
  _loser_delta integer;
  _recent_match_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _caller_profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Caller must be one of the participants of the match they are rewinding
  IF _caller_profile_id <> _winner_profile_id AND _caller_profile_id <> _loser_profile_id THEN
    RAISE EXCEPTION 'Caller must be a participant of the match being rewound';
  END IF;

  -- Bounds check on supplied ELO values
  IF _prev_winner_elo IS NULL OR _prev_loser_elo IS NULL
     OR _prev_winner_elo < 0 OR _prev_winner_elo > 5000
     OR _prev_loser_elo < 0 OR _prev_loser_elo > 5000 THEN
    RAISE EXCEPTION 'Invalid ELO values';
  END IF;

  -- Verify a recent match exists between these two profiles in this league (within last 24h)
  SELECT id INTO _recent_match_id
  FROM public.matches
  WHERE league_id = _league_id
    AND winner_profile_id = _winner_profile_id
    AND loser_profile_id = _loser_profile_id
    AND created_at > now() - interval '24 hours'
  ORDER BY created_at DESC
  LIMIT 1;

  IF _recent_match_id IS NULL THEN
    RAISE EXCEPTION 'No recent match to rewind';
  END IF;

  -- Read current stored ELOs
  SELECT COALESCE(elo, 1200) INTO _cur_winner_elo
  FROM public.league_memberships WHERE league_id = _league_id AND profile_id = _winner_profile_id;
  IF _cur_winner_elo IS NULL THEN _cur_winner_elo := 1200; END IF;

  SELECT COALESCE(elo, 1200) INTO _cur_loser_elo
  FROM public.league_memberships WHERE league_id = _league_id AND profile_id = _loser_profile_id;
  IF _cur_loser_elo IS NULL THEN _cur_loser_elo := 1200; END IF;

  -- Validate that the prev values correspond to a valid K<=32 reversal and are zero-sum
  _winner_delta := _cur_winner_elo - _prev_winner_elo;
  _loser_delta := _prev_loser_elo - _cur_loser_elo;

  IF _winner_delta < 0 OR _winner_delta > 32 OR _loser_delta < 0 OR _loser_delta > 32 THEN
    RAISE EXCEPTION 'Invalid rewind: deltas outside allowed range';
  END IF;

  IF abs(_winner_delta - _loser_delta) > 1 THEN
    RAISE EXCEPTION 'Invalid rewind: non zero-sum ELO change';
  END IF;

  -- Check rewinds available
  SELECT rewinds INTO _rewinds FROM public.profiles WHERE id = _caller_profile_id;
  IF _rewinds IS NULL OR _rewinds <= 0 THEN
    RAISE EXCEPTION 'No rewinds available';
  END IF;

  -- Deduct rewind
  UPDATE public.profiles SET rewinds = rewinds - 1 WHERE id = _caller_profile_id;

  -- Delete the recorded match so it can't be replayed
  DELETE FROM public.matches WHERE id = _recent_match_id;

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
$function$;