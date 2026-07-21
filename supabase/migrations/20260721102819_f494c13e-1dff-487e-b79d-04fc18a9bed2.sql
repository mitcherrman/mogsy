
-- ============================================================================
-- Power-up purchase: server-owned pricing
-- ============================================================================
-- The three-argument signature is preserved so existing frontend callers keep
-- working without a client change, but the `_diamond_cost` argument is now
-- completely IGNORED. Cost is derived from `_powerup_field` via a hard-coded
-- CASE expression, so a manipulated client can no longer buy a Boost for 1 or
-- 0 (or a negative) diamonds. Deduction and grant remain atomic via a single
-- conditional UPDATE that also enforces sufficient balance.

CREATE OR REPLACE FUNCTION public.purchase_powerup(
  _profile_id uuid,
  _powerup_field text,
  _diamond_cost integer  -- IGNORED: kept only for backward compatibility.
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _canonical_cost integer;
  _updated_row public.profiles%ROWTYPE;
BEGIN
  -- Auth check: only the signed-in owner of the profile may buy power-ups.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = _profile_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Server-owned canonical price. Anything not on this allow-list is rejected.
  _canonical_cost := CASE _powerup_field
    WHEN 'boost_credits' THEN 50
    WHEN 'elo_shields'   THEN 30
    WHEN 'reveals'       THEN 25
    WHEN 'rewinds'       THEN 15
    ELSE NULL
  END;

  IF _canonical_cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_powerup');
  END IF;

  -- Atomic: deduct diamonds AND increment the granted power-up in one row
  -- update. The `diamonds >= _canonical_cost` guard prevents both negative
  -- balances and TOCTOU double-spends across concurrent calls.
  CASE _powerup_field
    WHEN 'boost_credits' THEN
      UPDATE public.profiles
         SET diamonds = diamonds - _canonical_cost,
             boost_credits = COALESCE(boost_credits, 0) + 1
       WHERE id = _profile_id
         AND COALESCE(diamonds, 0) >= _canonical_cost
       RETURNING * INTO _updated_row;
    WHEN 'elo_shields' THEN
      UPDATE public.profiles
         SET diamonds = diamonds - _canonical_cost,
             elo_shields = COALESCE(elo_shields, 0) + 1
       WHERE id = _profile_id
         AND COALESCE(diamonds, 0) >= _canonical_cost
       RETURNING * INTO _updated_row;
    WHEN 'reveals' THEN
      UPDATE public.profiles
         SET diamonds = diamonds - _canonical_cost,
             reveals = COALESCE(reveals, 0) + 1
       WHERE id = _profile_id
         AND COALESCE(diamonds, 0) >= _canonical_cost
       RETURNING * INTO _updated_row;
    WHEN 'rewinds' THEN
      UPDATE public.profiles
         SET diamonds = diamonds - _canonical_cost,
             rewinds = COALESCE(rewinds, 0) + 1
       WHERE id = _profile_id
         AND COALESCE(diamonds, 0) >= _canonical_cost
       RETURNING * INTO _updated_row;
  END CASE;

  IF _updated_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_diamonds', 'cost', _canonical_cost);
  END IF;

  -- Best-effort audit trail. `purchases` exists in this project; if the insert
  -- fails for any reason we don't want it to roll back the successful grant.
  BEGIN
    INSERT INTO public.purchases (user_id, item_type, amount, metadata)
    VALUES (
      auth.uid(),
      'powerup:' || _powerup_field,
      _canonical_cost,
      jsonb_build_object('profile_id', _profile_id, 'canonical_cost', _canonical_cost)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Swallow audit-insert errors; the economic action already succeeded.
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'field', _powerup_field,
    'cost', _canonical_cost,
    'diamonds_remaining', _updated_row.diamonds
  );
END;
$$;

-- Lock down execution: only authenticated users. Anon and public roles are
-- explicitly denied so the RPC cannot be called without a real session.
REVOKE ALL ON FUNCTION public.purchase_powerup(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_powerup(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.purchase_powerup(uuid, text, integer) TO authenticated;
GRANT ALL   ON FUNCTION public.purchase_powerup(uuid, text, integer) TO service_role;


-- ============================================================================
-- Gift redemption: race-safe status transition
-- ============================================================================
-- Previously the function SELECTed the gift, checked status='paid', then
-- UPDATEd status='redeemed' unconditionally. Two concurrent calls could both
-- pass the SELECT and grant diamonds twice. The fix: attempt an atomic
-- `UPDATE ... WHERE status='paid'` first and only grant diamonds if that
-- update actually flipped the row.

CREATE OR REPLACE FUNCTION public.redeem_gift_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _gift public.gifts%ROWTYPE;
  _claimed public.gifts%ROWTYPE;
  _profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _gift FROM public.gifts WHERE redeem_code = upper(_code);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_code');
  END IF;

  IF _gift.status = 'redeemed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_redeemed');
  END IF;

  IF _gift.status <> 'paid' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_paid');
  END IF;

  SELECT id INTO _profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF _profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_profile');
  END IF;

  -- Atomic claim: only exactly one concurrent caller can flip paid -> redeemed.
  UPDATE public.gifts
     SET status = 'redeemed',
         redeemed_at = now(),
         recipient_user_id = auth.uid()
   WHERE id = _gift.id
     AND status = 'paid'
   RETURNING * INTO _claimed;

  IF _claimed.id IS NULL THEN
    -- Another concurrent redemption won the race.
    RETURN jsonb_build_object('success', false, 'reason', 'already_redeemed');
  END IF;

  -- Grant diamonds AFTER a successful claim, using the canonical amount that
  -- was written to the row by create-checkout / verify-gift from the server
  -- price catalog. The client cannot influence this value at redemption time.
  IF _claimed.gift_type = 'diamonds' AND COALESCE(_claimed.diamond_amount, 0) > 0 THEN
    UPDATE public.profiles
       SET diamonds = COALESCE(diamonds, 0) + _claimed.diamond_amount
     WHERE id = _profile_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'gift_type', _claimed.gift_type,
    'diamond_amount', _claimed.diamond_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_gift_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_gift_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_gift_code(text) TO authenticated;
GRANT ALL   ON FUNCTION public.redeem_gift_code(text) TO service_role;
