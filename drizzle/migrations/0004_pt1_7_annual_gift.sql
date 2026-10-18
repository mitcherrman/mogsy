-- ===========================================================================
-- PT1.7 — Annual Premium gift: verified payment, atomic recipient-bound
-- redemption, refunds and disputes. Covers the private $50 first-customer
-- annual gift AND hardens every existing gift product.
--
-- WHAT WAS WRONG (verified against origin/main 6b46e1c0 and the live schema)
--   G1  redeem_gift_code() flipped the gift to 'redeemed' in one transaction and
--       the redeem-gift Edge Function granted Premium in ANOTHER, from a stale
--       JavaScript read. A failure between the two consumed a paid gift with
--       no Premium; a concurrent grant could be overwritten.
--   G2  Anyone holding a redeem code could redeem it: the recipient email was
--       never compared, and email verification was never required.
--   G3  'paid' was set by verify-gift from session.payment_status alone, only
--       when the BUYER revisited the success page; no amount, refund or
--       dispute check, and the webhook ignored gifts entirely.
--   G4  Refunds and disputes never reached a gift: a refunded gift stayed
--       redeemable and a redeemed one kept its Premium.
--   G5  anon/authenticated held table privileges on public.gifts (anon SELECT
--       confirmed live). The 20260624 column-level REVOKE is a no-op while a
--       table-level SELECT grant exists, so the Stripe columns stayed readable.
--
-- MODEL
--   * Payment truth is re-read from Stripe by the Edge Functions and recorded
--     ONLY through gift_record_payment(), a monotonic state machine.
--   * Redemption is ONE transaction (gift_redeem): lock the gift, require
--     status 'paid', a verified non-guest recipient whose email matches, then
--     grant Premium and consume the gift together.
--   * Premium from a gift = 365 days (annual) / 30 days (monthly) from the
--     redemption, appended after any still-valid expiring grant.
--   * A full refund or a lost dispute revokes a redeemed gift's Premium and
--     restores the grant it stacked on (same rule as PT1.6b).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Terms of the private first-customer gift (SQL authority).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.private_gift_terms()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'offer_id', 'first_customer_annual_gift',
    'gift_type', 'pro_annual',
    'amount_cents', 5000,
    'currency', 'usd',
    'premium_days', 365,
    'auto_renews', false
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.private_gift_terms() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_gift_terms() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. gifts: payment, grant and offer facts.
-- ---------------------------------------------------------------------------
ALTER TABLE public.gifts
  ADD COLUMN IF NOT EXISTS offer_id                 text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS payment_checked_at       timestamptz,
  ADD COLUMN IF NOT EXISTS payment_note             text,
  ADD COLUMN IF NOT EXISTS refunded_at              timestamptz,
  ADD COLUMN IF NOT EXISTS disputed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS grant_applied            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grant_starts_at          timestamptz,
  ADD COLUMN IF NOT EXISTS grant_ends_at            timestamptz,
  ADD COLUMN IF NOT EXISTS prior_grant_kind         text,
  ADD COLUMN IF NOT EXISTS prior_grant_expires_at   timestamptz,
  ADD COLUMN IF NOT EXISTS prior_grant_reason       text,
  ADD COLUMN IF NOT EXISTS prior_grant_granted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS prior_grant_granted_by   uuid,
  ADD COLUMN IF NOT EXISTS revoked_at               timestamptz,
  ADD COLUMN IF NOT EXISTS revoke_note              text;

ALTER TABLE public.gifts DROP CONSTRAINT IF EXISTS gifts_offer_id_check;
ALTER TABLE public.gifts
  ADD CONSTRAINT gifts_offer_id_check CHECK (offer_id IS NULL OR offer_id = 'first_customer_annual_gift');
-- NOT VALID: historical rows are not re-checked; every new write is.
ALTER TABLE public.gifts DROP CONSTRAINT IF EXISTS gifts_status_check;
ALTER TABLE public.gifts
  ADD CONSTRAINT gifts_status_check
  CHECK (status IN ('pending', 'paid', 'redeemed', 'refunded', 'disputed', 'expired', 'invalid')) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS gifts_payment_intent_uidx
  ON public.gifts (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
-- At most one unpaid private gift per buyer: no parallel payable checkouts.
CREATE UNIQUE INDEX IF NOT EXISTS gifts_one_pending_private_per_sender_uidx
  ON public.gifts (sender_user_id) WHERE offer_id IS NOT NULL AND status = 'pending';

-- G5: browser roles keep only a column-level SELECT of display fields, still
-- filtered by the existing "Senders view their gifts" / admin RLS policies.
REVOKE ALL ON TABLE public.gifts FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, sender_user_id, recipient_email, gift_type, diamond_amount, status,
              redeem_code, message, offer_id, created_at, paid_at, redeemed_at)
  ON TABLE public.gifts TO authenticated;
GRANT ALL ON TABLE public.gifts TO service_role;

-- G1/G2: the old one-step claim is retired. Redemption goes through
-- gift_redeem(), called by the redeem-gift Edge Function after it has re-read
-- the payment from Stripe.
DROP FUNCTION IF EXISTS public.redeem_gift_code(text);

-- ---------------------------------------------------------------------------
-- 3. Private gift checkout (service role only; the Edge Function has already
--    verified the buyer's session and the buyer allowlist).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_private_prepare(
  _sender          uuid,
  _recipient_email text,
  _message         text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _u     record;
  _email text := lower(btrim(COALESCE(_recipient_email, '')));
  _msg   text := NULLIF(left(btrim(COALESCE(_message, '')), 500), '');
  _g     public.gifts%ROWTYPE;
  _try   integer := 0;
BEGIN
  SELECT u.email, u.email_confirmed_at, u.is_anonymous INTO _u FROM auth.users u WHERE u.id = _sender;
  IF NOT FOUND OR COALESCE(_u.is_anonymous, false) OR _u.email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_required');
  END IF;
  IF _u.email_confirmed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_unverified');
  END IF;
  IF length(_email) > 254 OR _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_recipient');
  END IF;
  IF _email = lower(_u.email) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_gift');
  END IF;

  LOOP
    _try := _try + 1;
    SELECT * INTO _g FROM public.gifts
     WHERE sender_user_id = _sender AND offer_id = 'first_customer_annual_gift' AND status = 'pending'
     FOR UPDATE;
    IF FOUND THEN
      IF _g.stripe_session_id IS NULL THEN
        UPDATE public.gifts SET recipient_email = _email, message = _msg WHERE id = _g.id;
        RETURN jsonb_build_object('ok', true, 'gift_id', _g.id, 'existing_session_id', NULL);
      END IF;
      RETURN jsonb_build_object(
        'ok', true, 'gift_id', _g.id, 'existing_session_id', _g.stripe_session_id,
        'same_details', _g.recipient_email = _email AND _g.message IS NOT DISTINCT FROM _msg);
    END IF;
    EXIT WHEN _try > 1;
    INSERT INTO public.gifts (sender_user_id, sender_email, recipient_email, gift_type,
                              diamond_amount, offer_id, message, status)
    VALUES (_sender, lower(_u.email), _email, 'pro_annual', 0, 'first_customer_annual_gift', _msg, 'pending')
    ON CONFLICT DO NOTHING
    RETURNING * INTO _g;
    IF _g.id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'gift_id', _g.id, 'existing_session_id', NULL);
    END IF;
    -- Lost an insert race to a concurrent request: read the winner once.
  END LOOP;
  RETURN jsonb_build_object('ok', false, 'reason', 'busy');
END;
$function$;

-- Retire a pending private gift whose open session the buyer is replacing.
CREATE OR REPLACE FUNCTION public.gift_private_abandon(_gift_id uuid, _sender uuid, _session_id text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.gifts
     SET status = 'expired', payment_note = 'replaced_by_buyer', payment_checked_at = now()
   WHERE id = _gift_id AND sender_user_id = _sender AND status = 'pending'
     AND offer_id IS NOT NULL AND stripe_session_id IS NOT DISTINCT FROM _session_id;
  RETURN FOUND;
END;
$function$;

-- Compare-and-set: a session attaches only to a pending gift with none yet.
CREATE OR REPLACE FUNCTION public.gift_attach_session(
  _gift_id    uuid,
  _sender     uuid,
  _session_id text,
  _price_id   text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _g public.gifts%ROWTYPE;
BEGIN
  IF _session_id IS NULL OR _session_id !~ '^cs_' OR _price_id IS NULL OR _price_id !~ '^price_' THEN
    RAISE EXCEPTION 'invalid_session_or_price';
  END IF;
  SELECT * INTO _g FROM public.gifts WHERE id = _gift_id FOR UPDATE;
  IF NOT FOUND OR _g.sender_user_id IS DISTINCT FROM _sender OR _g.status <> 'pending' THEN
    RETURN jsonb_build_object('result', 'refused');
  END IF;
  IF _g.stripe_session_id IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'conflict', 'current_session_id', _g.stripe_session_id);
  END IF;
  UPDATE public.gifts SET stripe_session_id = _session_id, stripe_price_id = _price_id WHERE id = _gift_id;
  RETURN jsonb_build_object('result', 'attached');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Payment state machine (service role only).
-- ---------------------------------------------------------------------------
-- _state is what the Edge Function derived from Stripe's CURRENT objects
-- (session + PaymentIntent + latest charge + dispute), never from a redirect
-- or an event payload alone. Transitions are monotonic, so retried and
-- out-of-order webhooks converge on the same row:
--
--   pending  → paid | refunded | disputed | expired | invalid   (pending is a no-op)
--   expired  → paid            (a session paid in the instant it was replaced)
--   paid     → refunded | disputed | invalid
--   disputed → paid (won) | refunded (lost)
--   redeemed → refunded (revokes Premium); a dispute only stamps disputed_at
--   refunded, invalid → terminal
CREATE OR REPLACE FUNCTION public.gift_record_payment(
  _gift_id        uuid,
  _session_id     text,
  _payment_intent text,
  _state          text,
  _amount         integer,
  _currency       text,
  _note           text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _terms  jsonb := public.private_gift_terms();
  _g      public.gifts%ROWTYPE;
  _p      record;
  _state2 text := _state;
  _note2  text := left(_note, 120);
  _out    text;
BEGIN
  IF _state IS NULL OR _state NOT IN ('pending', 'paid', 'refunded', 'disputed', 'expired', 'invalid') THEN
    RAISE EXCEPTION 'invalid_state';
  END IF;
  SELECT * INTO _g FROM public.gifts WHERE id = _gift_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;
  IF _g.stripe_session_id IS DISTINCT FROM _session_id THEN
    RETURN jsonb_build_object('result', 'session_mismatch', 'status', _g.status);
  END IF;
  IF _g.stripe_payment_intent_id IS NOT NULL AND _payment_intent IS NOT NULL
     AND _g.stripe_payment_intent_id <> _payment_intent THEN
    RETURN jsonb_build_object('result', 'payment_intent_mismatch', 'status', _g.status);
  END IF;

  -- The private offer is $50.00 USD total, checked here as well as in Stripe.
  IF _g.offer_id IS NOT NULL AND _state2 = 'paid'
     AND (_amount IS DISTINCT FROM (_terms ->> 'amount_cents')::integer
          OR lower(COALESCE(_currency, '')) <> (_terms ->> 'currency')) THEN
    _state2 := 'invalid';
    _note2 := 'amount_mismatch';
  END IF;

  UPDATE public.gifts
     SET stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, _payment_intent),
         payment_checked_at = now()
   WHERE id = _g.id;

  _out := 'unchanged';

  IF _g.status IN ('refunded', 'invalid') THEN
    _out := 'terminal';

  ELSIF _g.status IN ('pending', 'expired') THEN
    IF _state2 = 'paid' THEN
      UPDATE public.gifts SET status = 'paid', paid_at = now(), amount_cents = _amount,
             payment_note = _note2 WHERE id = _g.id;
      _out := 'paid';
    ELSIF _g.status = 'pending' AND _state2 IN ('refunded', 'disputed', 'expired', 'invalid') THEN
      UPDATE public.gifts SET status = _state2, payment_note = _note2,
             refunded_at = CASE WHEN _state2 = 'refunded' THEN now() END,
             disputed_at = CASE WHEN _state2 = 'disputed' THEN now() END
       WHERE id = _g.id;
      _out := _state2;
    END IF;

  ELSIF _g.status = 'paid' THEN
    IF _state2 IN ('refunded', 'disputed', 'invalid') THEN
      UPDATE public.gifts SET status = _state2, payment_note = _note2,
             refunded_at = CASE WHEN _state2 = 'refunded' THEN now() END,
             disputed_at = CASE WHEN _state2 = 'disputed' THEN now() END
       WHERE id = _g.id;
      _out := _state2;
    END IF;

  ELSIF _g.status = 'disputed' THEN
    IF _state2 = 'paid' THEN
      UPDATE public.gifts SET status = 'paid', disputed_at = NULL, payment_note = 'dispute_won' WHERE id = _g.id;
      _out := 'paid';
    ELSIF _state2 = 'refunded' THEN
      UPDATE public.gifts SET status = 'refunded', refunded_at = now(), payment_note = _note2 WHERE id = _g.id;
      _out := 'refunded';
    END IF;

  ELSIF _g.status = 'redeemed' THEN
    IF _state2 = 'disputed' AND _g.disputed_at IS NULL THEN
      UPDATE public.gifts SET disputed_at = now(), payment_note = _note2 WHERE id = _g.id;
      _out := 'redeemed_disputed';
    ELSIF _state2 = 'paid' AND _g.disputed_at IS NOT NULL THEN
      UPDATE public.gifts SET disputed_at = NULL, payment_note = 'dispute_won' WHERE id = _g.id;
      _out := 'redeemed_dispute_won';
    ELSIF _state2 = 'refunded' THEN
      -- Revoke exactly what this gift granted, restoring the grant it stacked on.
      _out := 'revoked_needs_review';
      IF _g.grant_applied THEN
        SELECT p.id, p.pro_grant_kind, p.pro_grant_expires_at INTO _p
        FROM public.profiles p WHERE p.user_id = _g.recipient_user_id FOR UPDATE;
        IF FOUND AND _p.pro_grant_kind = 'gift'
           AND _p.pro_grant_expires_at IS NOT DISTINCT FROM _g.grant_ends_at THEN
          IF public.pro_grant_is_valid(_g.prior_grant_kind, _g.prior_grant_expires_at) THEN
            UPDATE public.profiles SET
              pro_grant_kind = _g.prior_grant_kind, pro_grant_expires_at = _g.prior_grant_expires_at,
              pro_grant_reason = _g.prior_grant_reason, pro_grant_granted_at = _g.prior_grant_granted_at,
              pro_grant_granted_by = _g.prior_grant_granted_by
            WHERE id = _p.id;
            _out := 'revoked_restored_prior';
          ELSE
            UPDATE public.profiles SET pro_grant_kind = NULL, pro_grant_expires_at = NULL,
              pro_grant_reason = NULL, pro_grant_granted_at = NULL, pro_grant_granted_by = NULL
            WHERE id = _p.id;
            _out := 'revoked';
          END IF;
        END IF;
      ELSIF _g.gift_type = 'diamonds' THEN
        _out := 'refunded_diamonds_needs_review';
      END IF;
      UPDATE public.gifts SET status = 'refunded', refunded_at = now(), revoked_at = now(),
             revoke_note = _out, payment_note = _note2 WHERE id = _g.id;
    END IF;
  END IF;

  RETURN jsonb_build_object('result', _out,
    'status', (SELECT g.status FROM public.gifts g WHERE g.id = _g.id));
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Redemption: ONE transaction, recipient-bound (service role only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_redeem(_code text, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _terms jsonb := public.private_gift_terms();
  _norm  text := upper(btrim(COALESCE(_code, '')));
  _g     public.gifts%ROWTYPE;
  _u     record;
  _p     record;
  _days  integer;
  _start timestamptz;
  _end   timestamptz;
BEGIN
  IF _norm !~ '^[A-Z0-9]{6,32}$' OR _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_code');
  END IF;
  SELECT u.email, u.email_confirmed_at, u.is_anonymous INTO _u FROM auth.users u WHERE u.id = _user_id;
  IF NOT FOUND OR COALESCE(_u.is_anonymous, false) OR _u.email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'account_required');
  END IF;
  IF _u.email_confirmed_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'email_unverified');
  END IF;

  -- The row lock serialises concurrent redemptions of the same code.
  SELECT * INTO _g FROM public.gifts WHERE redeem_code = _norm FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_code');
  END IF;
  -- Recipient binding first, so a stranger holding a code learns nothing else.
  IF _g.recipient_email IS NULL OR lower(btrim(_g.recipient_email)) <> lower(btrim(_u.email))
     OR (_g.recipient_user_id IS NOT NULL AND _g.recipient_user_id <> _user_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'recipient_mismatch');
  END IF;
  IF _g.status = 'redeemed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_redeemed',
                              'grant_ends_at', _g.grant_ends_at);
  END IF;
  IF _g.status = 'disputed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'payment_on_hold');
  END IF;
  IF _g.status = 'pending' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_paid');
  END IF;
  IF _g.status <> 'paid' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unavailable');
  END IF;
  IF _g.offer_id IS NOT NULL AND (_g.amount_cents IS DISTINCT FROM (_terms ->> 'amount_cents')::integer
                                  OR _g.gift_type <> (_terms ->> 'gift_type')) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unavailable');
  END IF;

  SELECT p.id, p.pro_grant_kind, p.pro_grant_expires_at, p.pro_grant_reason,
         p.pro_grant_granted_at, p.pro_grant_granted_by
    INTO _p
  FROM public.profiles p WHERE p.user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_profile');
  END IF;

  IF _g.gift_type IN ('pro_annual', 'pro_monthly') THEN
    IF _p.pro_grant_kind IS NOT NULL AND _p.pro_grant_expires_at IS NULL THEN
      -- Nothing to add to Premium that never ends; keep the gift unredeemed.
      RETURN jsonb_build_object('success', false, 'reason', 'already_permanent');
    END IF;
    _days := CASE WHEN _g.gift_type = 'pro_annual' THEN (_terms ->> 'premium_days')::integer ELSE 30 END;
    _start := GREATEST(now(), CASE
      WHEN public.pro_grant_is_valid(_p.pro_grant_kind, _p.pro_grant_expires_at)
      THEN _p.pro_grant_expires_at END);
    _end := _start + make_interval(days => _days);
    IF NOT public.apply_pro_grant(_p.id, 'gift', _end,
         'Gift: ' || _days || ' days of Premium (gift ' || _g.id::text || ')') THEN
      RAISE EXCEPTION 'gift_grant_not_applied';   -- unreachable; aborts everything
    END IF;
    UPDATE public.gifts SET
      status = 'redeemed', redeemed_at = now(), recipient_user_id = _user_id,
      grant_applied = true, grant_starts_at = _start, grant_ends_at = _end,
      prior_grant_kind = _p.pro_grant_kind, prior_grant_expires_at = _p.pro_grant_expires_at,
      prior_grant_reason = _p.pro_grant_reason, prior_grant_granted_at = _p.pro_grant_granted_at,
      prior_grant_granted_by = _p.pro_grant_granted_by
    WHERE id = _g.id;
  ELSIF _g.gift_type = 'diamonds' AND COALESCE(_g.diamond_amount, 0) > 0 THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _g.diamond_amount WHERE id = _p.id;
    UPDATE public.gifts SET status = 'redeemed', redeemed_at = now(), recipient_user_id = _user_id
     WHERE id = _g.id;
  ELSE
    RETURN jsonb_build_object('success', false, 'reason', 'unavailable');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'gift_id', _g.id,
    'gift_type', _g.gift_type,
    'diamond_amount', _g.diamond_amount,
    'premium_days', _days,
    'grant_starts_at', _start,
    'grant_ends_at', _end,
    'profile_id', _p.id
  );
END;
$function$;

-- Paid, unredeemed gifts addressed to this user's VERIFIED email.
CREATE OR REPLACE FUNCTION public.gift_list_for_recipient(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _u record;
BEGIN
  SELECT u.email, u.email_confirmed_at, u.is_anonymous INTO _u FROM auth.users u WHERE u.id = _user_id;
  IF NOT FOUND OR COALESCE(_u.is_anonymous, false) OR _u.email IS NULL OR _u.email_confirmed_at IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'gift_id', g.id, 'redeem_code', g.redeem_code, 'gift_type', g.gift_type,
             'message', g.message, 'from', COALESCE(pr.display_name, 'A friend'), 'paid_at', g.paid_at)
           ORDER BY g.paid_at DESC)
    FROM public.gifts g
    LEFT JOIN public.profiles pr ON pr.user_id = g.sender_user_id
    WHERE g.status = 'paid' AND lower(btrim(g.recipient_email)) = lower(btrim(_u.email))
      AND (g.recipient_user_id IS NULL OR g.recipient_user_id = _user_id)
  ), '[]'::jsonb);
END;
$function$;

DO $grants$
DECLARE
  _sig text;
BEGIN
  FOREACH _sig IN ARRAY ARRAY[
    'public.gift_private_prepare(uuid, text, text)',
    'public.gift_private_abandon(uuid, uuid, text)',
    'public.gift_attach_session(uuid, uuid, text, text)',
    'public.gift_record_payment(uuid, text, text, text, integer, text, text)',
    'public.gift_redeem(text, uuid)',
    'public.gift_list_for_recipient(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', _sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', _sig);
  END LOOP;
END
$grants$;

-- ---------------------------------------------------------------------------
-- 6. In-transaction assertions.
-- ---------------------------------------------------------------------------
DO $assert_pt17$
DECLARE
  _fn record;
BEGIN
  FOR _fn IN
    SELECT p.oid, p.proname, p.prosecdef, p.proconfig
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND (p.proname LIKE 'gift\_%' OR p.proname = 'private_gift_terms')
  LOOP
    IF _fn.proname <> 'private_gift_terms' AND NOT _fn.prosecdef THEN
      RAISE EXCEPTION 'PT1.7: % must be SECURITY DEFINER', _fn.proname;
    END IF;
    IF NOT ('search_path=""' = ANY (COALESCE(_fn.proconfig, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'PT1.7: % must pin an empty search_path', _fn.proname;
    END IF;
    IF pg_catalog.has_function_privilege('anon', _fn.oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', _fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'PT1.7: a browser role can execute %', _fn.proname;
    END IF;
  END LOOP;

  IF to_regprocedure('public.redeem_gift_code(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'PT1.7: the non-atomic redeem_gift_code still exists';
  END IF;
  IF pg_catalog.has_table_privilege('anon', 'public.gifts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.gifts', 'INSERT,UPDATE,DELETE,TRUNCATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.gifts', 'stripe_session_id', 'SELECT')
     OR pg_catalog.has_column_privilege('authenticated', 'public.gifts', 'stripe_payment_intent_id', 'SELECT') THEN
    RAISE EXCEPTION 'PT1.7: a browser role holds a write or payment-column privilege on public.gifts';
  END IF;
  IF public.private_gift_terms() <> '{"offer_id":"first_customer_annual_gift","gift_type":"pro_annual","amount_cents":5000,"currency":"usd","premium_days":365,"auto_renews":false}'::jsonb THEN
    RAISE EXCEPTION 'PT1.7: private_gift_terms drifted';
  END IF;
END
$assert_pt17$;
