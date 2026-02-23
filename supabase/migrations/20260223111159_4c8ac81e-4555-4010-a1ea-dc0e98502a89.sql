
-- Atomic power-up purchase function to prevent race conditions
CREATE OR REPLACE FUNCTION public.purchase_powerup(
  _profile_id uuid,
  _powerup_field text,
  _diamond_cost integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_diamonds integer;
  _new_value integer;
BEGIN
  -- Verify caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller owns profile
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Validate powerup field to prevent SQL injection
  IF _powerup_field NOT IN ('boost_credits', 'elo_shields', 'reveals', 'rewinds') THEN
    RAISE EXCEPTION 'Invalid powerup field';
  END IF;

  -- Validate diamond cost
  IF _diamond_cost <= 0 THEN
    RAISE EXCEPTION 'Invalid diamond cost';
  END IF;

  -- Lock the row and check balance atomically
  SELECT diamonds INTO _new_diamonds
  FROM profiles WHERE id = _profile_id FOR UPDATE;

  IF _new_diamonds IS NULL OR _new_diamonds < _diamond_cost THEN
    RAISE EXCEPTION 'Insufficient diamonds';
  END IF;

  -- Atomic update using CASE for dynamic field
  UPDATE profiles
  SET
    diamonds = diamonds - _diamond_cost,
    boost_credits = CASE WHEN _powerup_field = 'boost_credits' THEN COALESCE(boost_credits, 0) + 1 ELSE boost_credits END,
    elo_shields = CASE WHEN _powerup_field = 'elo_shields' THEN COALESCE(elo_shields, 0) + 1 ELSE elo_shields END,
    reveals = CASE WHEN _powerup_field = 'reveals' THEN COALESCE(reveals, 0) + 1 ELSE reveals END,
    rewinds = CASE WHEN _powerup_field = 'rewinds' THEN COALESCE(rewinds, 0) + 1 ELSE rewinds END
  WHERE id = _profile_id
  RETURNING diamonds INTO _new_diamonds;

  -- Get updated powerup value
  EXECUTE format('SELECT COALESCE(%I, 0) FROM profiles WHERE id = $1', _powerup_field)
  INTO _new_value USING _profile_id;

  -- Log purchase atomically
  INSERT INTO purchases (profile_id, item_type, amount_cents)
  VALUES (_profile_id, _powerup_field, 0);

  RETURN jsonb_build_object(
    'diamonds', _new_diamonds,
    'powerup_value', _new_value
  );
END;
$$;
