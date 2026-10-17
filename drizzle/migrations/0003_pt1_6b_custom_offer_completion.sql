-- ===========================================================================
-- PT1.6b — Custom one-time Premium offer: completion and hardening.
--
-- 0002_pt1_6_custom_offer_one_time.sql is APPLIED in production (verified
-- 2026-10-16: both tables and all five functions resolve in the live schema
-- cache, and anon is denied EXECUTE on each). It is not edited. This migration
-- supersedes the parts of it that cannot work or are unsafe:
--
--   D1  Every audit INSERT in 0002 writes admin_audit_log.actor_user_id = NULL,
--       but that column is NOT NULL (ADM2). record_custom_offer_purchase and
--       refund_custom_offer_purchase would therefore raise on EVERY call: a
--       paid customer would never get Premium and Stripe would retry the
--       webhook for days. Lifecycle events now go to a dedicated ledger.
--   D2  The two tables were created under this project's default privileges,
--       which grant anon and authenticated arwdDxtm at table level (ADM3).
--       RLS hides rows, but TRUNCATE is not subject to RLS. All non-service
--       privileges are revoked (confirmed live: anon SELECT returned 200).
--   D3  The purchase recorder took the amount and the entitlement end date as
--       caller-supplied parameters and never checked either. The $50 / USD /
--       12-calendar-month terms now live in SQL and are not parameters.
--   D4  A refund cleared the grant slot even when the purchase had stacked on
--       an earlier grant (e.g. a gift), destroying that earlier entitlement.
--       The prior grant is snapshotted and restored.
--   D5  restore_custom_offer_claim unbound the customer, so an abandoned
--       checkout made a customer-specific link claimable by anyone holding it.
--       Abandonment now releases the CHECKOUT, never the customer binding.
--   D6  Nothing prevented two open Checkout Sessions for one claim (double
--       payment) or two paid purchases for one claim (double grant).
--   D7  owner_create_custom_offer_claim used is_owner() (trusted session).
--       Minting a discounted paid offer is a privilege grant of the same kind
--       as admin_set_pro_grant, which OWN1.1 keeps at fresh_aal2.
--
-- Every function here is SECURITY DEFINER with an EMPTY search_path and fully
-- qualified names. Service-only functions are callable by service_role alone;
-- owner functions call public.assert_owner first; the one customer function is
-- hard-scoped to auth.uid().
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Retire the 0002 functions that are superseded below.
-- ---------------------------------------------------------------------------
-- No caller exists for any of them (no edge function or client was shipped
-- with 0002). They are dropped rather than left callable with broken semantics.
DROP FUNCTION IF EXISTS public.redeem_custom_offer_claim(text, uuid);
DROP FUNCTION IF EXISTS public.restore_custom_offer_claim(uuid);
DROP FUNCTION IF EXISTS public.record_custom_offer_purchase(uuid, uuid, text, text, integer, text, timestamptz);
DROP FUNCTION IF EXISTS public.refund_custom_offer_purchase(text);
DROP FUNCTION IF EXISTS public.owner_create_custom_offer_claim(text, timestamptz);

-- ---------------------------------------------------------------------------
-- 1. Terms: the single SQL authority for what this offer costs and grants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_offer_terms()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'offer_id', 'custom_one_time_50',
    'amount_cents', 5000,
    'currency', 'usd',
    'months', 12,
    'auto_renews', false
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.custom_offer_terms() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_offer_terms() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.custom_offer_claims
  ADD COLUMN IF NOT EXISTS for_user_id                 uuid,
  ADD COLUMN IF NOT EXISTS revoked_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by                  uuid,
  ADD COLUMN IF NOT EXISTS checkout_session_id         text,
  ADD COLUMN IF NOT EXISTS checkout_session_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_attempts           integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.custom_offer_claims.redeemed_by_user_id IS
  'PT1.6b: the customer this claim is bound to. Set on first checkout and never cleared.';
COMMENT ON COLUMN public.custom_offer_claims.stripe_session_id IS
  'PT1.6b: the Checkout Session that PAID for this claim. Non-null = consumed.';
COMMENT ON COLUMN public.custom_offer_claims.checkout_session_id IS
  'PT1.6b: the one currently open Checkout Session, if any. Cleared on expiry/failure/payment.';

ALTER TABLE public.custom_offer_claims DROP CONSTRAINT IF EXISTS custom_offer_claims_token_hash_format;
ALTER TABLE public.custom_offer_claims
  ADD CONSTRAINT custom_offer_claims_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX IF NOT EXISTS custom_offer_claims_paid_session_uidx
  ON public.custom_offer_claims (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS custom_offer_claims_checkout_session_idx
  ON public.custom_offer_claims (checkout_session_id) WHERE checkout_session_id IS NOT NULL;

ALTER TABLE public.custom_offer_purchases
  ALTER COLUMN entitlement_ends_at DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS entitlement_starts_at  timestamptz,
  ADD COLUMN IF NOT EXISTS grant_applied          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason          text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS amount_refunded_cents  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at            timestamptz,
  ADD COLUMN IF NOT EXISTS revoke_reason          text,
  ADD COLUMN IF NOT EXISTS prior_grant_kind       text,
  ADD COLUMN IF NOT EXISTS prior_grant_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS prior_grant_reason     text,
  ADD COLUMN IF NOT EXISTS prior_grant_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS prior_grant_granted_by uuid;

ALTER TABLE public.custom_offer_purchases DROP CONSTRAINT IF EXISTS custom_offer_purchases_status_check;
ALTER TABLE public.custom_offer_purchases
  ADD CONSTRAINT custom_offer_purchases_status_check
  CHECK (status IN ('paid', 'refunded', 'review'));
ALTER TABLE public.custom_offer_purchases DROP CONSTRAINT IF EXISTS custom_offer_purchases_amounts_check;
ALTER TABLE public.custom_offer_purchases
  ADD CONSTRAINT custom_offer_purchases_amounts_check
  CHECK (amount_cents >= 0 AND amount_refunded_cents >= 0 AND currency ~ '^[a-z]{3}$');
ALTER TABLE public.custom_offer_purchases DROP CONSTRAINT IF EXISTS custom_offer_purchases_paid_shape_check;
ALTER TABLE public.custom_offer_purchases
  ADD CONSTRAINT custom_offer_purchases_paid_shape_check
  CHECK (status <> 'paid' OR (entitlement_starts_at IS NOT NULL AND entitlement_ends_at IS NOT NULL
                              AND entitlement_ends_at > entitlement_starts_at));

-- One PAID purchase per claim (D6), one row per PaymentIntent.
CREATE UNIQUE INDEX IF NOT EXISTS custom_offer_purchases_one_paid_per_claim_uidx
  ON public.custom_offer_purchases (claim_id) WHERE status = 'paid';
CREATE UNIQUE INDEX IF NOT EXISTS custom_offer_purchases_payment_intent_uidx
  ON public.custom_offer_purchases (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS custom_offer_purchases_user_idx
  ON public.custom_offer_purchases (user_id, created_at DESC);

-- Lifecycle ledger (D1). Append-only, service role only. No FK, so a ledger row
-- survives anything, including an event about a claim id that does not exist.
CREATE TABLE IF NOT EXISTS public.custom_offer_events (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at       timestamptz NOT NULL DEFAULT now(),
  event            text NOT NULL,
  claim_id         uuid,
  purchase_id      uuid,
  user_id          uuid,
  stripe_object_id text,
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS custom_offer_events_claim_idx
  ON public.custom_offer_events (claim_id, created_at DESC);
ALTER TABLE public.custom_offer_events ENABLE ROW LEVEL SECURITY;

-- D2: no browser role holds any table privilege on any of the three tables.
REVOKE ALL ON TABLE public.custom_offer_claims    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.custom_offer_purchases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.custom_offer_events    FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.custom_offer_claims    TO service_role;
GRANT ALL ON TABLE public.custom_offer_purchases TO service_role;
GRANT ALL ON TABLE public.custom_offer_events    TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Owner: mint a claim link (fresh MFA). The raw token is returned ONCE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_create_custom_offer_claim(
  _note        text        DEFAULT NULL,
  _expires_at  timestamptz DEFAULT NULL,
  _for_user_id uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _expiry timestamptz := COALESCE(_expires_at, now() + interval '14 days');
  _token  text;
  _id     uuid;
BEGIN
  PERFORM public.assert_owner('fresh_aal2');
  IF _expiry < now() + interval '1 hour' OR _expiry > now() + interval '90 days' THEN
    RAISE EXCEPTION 'expiry_out_of_range' USING HINT = 'between 1 hour and 90 days from now';
  END IF;
  IF _for_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = _for_user_id
  ) THEN
    RAISE EXCEPTION 'unknown_user';
  END IF;

  _token := 'mgy1_' || encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.custom_offer_claims (token_hash, note, created_by, expires_at, for_user_id)
  VALUES (
    encode(extensions.digest(_token, 'sha256'), 'hex'),
    NULLIF(left(btrim(COALESCE(_note, '')), 200), ''),
    auth.uid(),
    _expiry,
    _for_user_id
  )
  RETURNING id INTO _id;

  INSERT INTO public.custom_offer_events (event, claim_id, user_id, detail)
  VALUES ('claim_created', _id, auth.uid(),
          jsonb_build_object('expires_at', _expiry, 'for_user_id', _for_user_id));

  RETURN jsonb_build_object('claim_id', _id, 'token', _token, 'expires_at', _expiry);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.owner_create_custom_offer_claim(text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_create_custom_offer_claim(text, timestamptz, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Owner: list and revoke.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_list_custom_offer_claims(_limit integer DEFAULT 100)
RETURNS TABLE (
  claim_id              uuid,
  note                  text,
  status                text,
  created_at            timestamptz,
  expires_at            timestamptz,
  for_user_id           uuid,
  customer_user_id      uuid,
  customer_display_name text,
  claimed_at            timestamptz,
  checkout_attempts     integer,
  purchase_status       text,
  review_reason         text,
  amount_cents          integer,
  amount_refunded_cents integer,
  entitlement_starts_at timestamptz,
  entitlement_ends_at   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.assert_owner('trusted');
  RETURN QUERY
    SELECT
      c.id,
      c.note,
      CASE
        WHEN pu.status = 'refunded'                 THEN 'refunded'
        WHEN pu.status = 'review'                   THEN 'review'
        WHEN pu.status = 'paid'                     THEN 'paid'
        WHEN c.revoked_at IS NOT NULL               THEN 'revoked'
        WHEN c.expires_at <= now()                  THEN 'expired'
        WHEN c.checkout_session_id IS NOT NULL
         AND c.checkout_session_expires_at > now()  THEN 'checkout_open'
        WHEN c.redeemed_by_user_id IS NOT NULL      THEN 'claimed'
        ELSE 'unclaimed'
      END,
      c.created_at,
      c.expires_at,
      c.for_user_id,
      c.redeemed_by_user_id,
      pr.display_name,
      c.redeemed_at,
      c.checkout_attempts,
      pu.status,
      pu.review_reason,
      pu.amount_cents,
      pu.amount_refunded_cents,
      pu.entitlement_starts_at,
      pu.entitlement_ends_at
    FROM public.custom_offer_claims c
    LEFT JOIN LATERAL (
      SELECT x.* FROM public.custom_offer_purchases x
      WHERE x.claim_id = c.id
      ORDER BY (x.status = 'paid') DESC, x.created_at DESC
      LIMIT 1
    ) pu ON true
    LEFT JOIN public.profiles pr ON pr.user_id = c.redeemed_by_user_id
    ORDER BY c.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 500));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.owner_list_custom_offer_claims(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_list_custom_offer_claims(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_revoke_custom_offer_claim(_claim_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _c public.custom_offer_claims%ROWTYPE;
BEGIN
  PERFORM public.assert_owner('trusted');
  SELECT * INTO _c FROM public.custom_offer_claims WHERE id = _claim_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF _c.stripe_session_id IS NOT NULL THEN RETURN 'already_paid'; END IF;
  IF _c.revoked_at IS NOT NULL THEN RETURN 'already_revoked'; END IF;
  UPDATE public.custom_offer_claims
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE id = _claim_id;
  INSERT INTO public.custom_offer_events (event, claim_id, user_id, detail)
  VALUES ('claim_revoked', _claim_id, auth.uid(),
          jsonb_build_object('open_checkout_session', _c.checkout_session_id));
  RETURN 'revoked';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.owner_revoke_custom_offer_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_revoke_custom_offer_claim(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Service: what a signed-in customer may do with a claim (read-only).
-- ---------------------------------------------------------------------------
-- One classifier shared by status and checkout, so the page never promises a
-- checkout that the checkout would then refuse.
CREATE OR REPLACE FUNCTION public.custom_offer_classify_claim(
  _c       public.custom_offer_claims,
  _user_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _anon  boolean;
  _prof  record;
BEGIN
  IF _c.id IS NULL THEN RETURN 'unavailable'; END IF;
  IF _c.for_user_id IS NOT NULL AND _c.for_user_id IS DISTINCT FROM _user_id THEN
    RETURN 'other_account';
  END IF;
  IF _c.redeemed_by_user_id IS NOT NULL AND _c.redeemed_by_user_id IS DISTINCT FROM _user_id THEN
    RETURN 'other_account';
  END IF;
  -- Any recorded payment closes the claim, including one held for review: the
  -- owner resolves (refund / manual grant) before anything can be paid again.
  IF _c.stripe_session_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.custom_offer_purchases x
    WHERE x.claim_id = _c.id AND x.status IN ('paid', 'refunded', 'review')
  ) THEN
    RETURN 'already_paid';
  END IF;
  IF _c.revoked_at IS NOT NULL OR _c.expires_at <= now() THEN RETURN 'unavailable'; END IF;

  SELECT u.is_anonymous INTO _anon FROM auth.users u WHERE u.id = _user_id;
  IF NOT FOUND OR COALESCE(_anon, false) THEN RETURN 'account_required'; END IF;

  SELECT p.is_pro, p.pro_grant_kind, p.pro_grant_expires_at INTO _prof
  FROM public.profiles p WHERE p.user_id = _user_id;
  IF NOT FOUND THEN RETURN 'account_required'; END IF;
  -- Preserve existing subscriptions: never sell a parallel year on top of an
  -- auto-renewing Stripe subscription.
  IF COALESCE(_prof.is_pro, false) THEN RETURN 'active_subscription'; END IF;
  IF _prof.pro_grant_kind IS NOT NULL AND _prof.pro_grant_expires_at IS NULL THEN
    RETURN 'permanent_premium';
  END IF;

  IF _c.checkout_session_id IS NOT NULL AND _c.checkout_session_expires_at > now() THEN
    RETURN 'checkout_open';
  END IF;
  RETURN 'available';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.custom_offer_classify_claim(public.custom_offer_claims, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_offer_classify_claim(public.custom_offer_claims, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.custom_offer_claim_status(_token_hash text, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _c public.custom_offer_claims%ROWTYPE;
  _state text;
  _p record;
BEGIN
  IF _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$' OR _user_id IS NULL THEN
    RETURN jsonb_build_object('state', 'unavailable');
  END IF;
  SELECT * INTO _c FROM public.custom_offer_claims WHERE token_hash = _token_hash;
  _state := public.custom_offer_classify_claim(_c, _user_id);
  IF _state = 'already_paid' THEN
    SELECT x.status, x.entitlement_ends_at INTO _p
    FROM public.custom_offer_purchases x
    WHERE x.claim_id = _c.id ORDER BY (x.status = 'paid') DESC, x.created_at DESC LIMIT 1;
    RETURN jsonb_build_object('state', _state, 'purchase_status', _p.status,
                              'entitlement_ends_at', _p.entitlement_ends_at);
  END IF;
  RETURN jsonb_build_object(
    'state', _state,
    'claim_expires_at', CASE WHEN _state IN ('available', 'checkout_open') THEN _c.expires_at END
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.custom_offer_claim_status(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_offer_claim_status(text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Service: begin a checkout. Binds the claim to the customer (never
--    released) and reports any open session so the caller reuses or expires it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_offer_prepare_checkout(_token_hash text, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _c public.custom_offer_claims%ROWTYPE;
  _state text;
BEGIN
  IF _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$' OR _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'state', 'unavailable');
  END IF;
  SELECT * INTO _c FROM public.custom_offer_claims WHERE token_hash = _token_hash FOR UPDATE;
  _state := public.custom_offer_classify_claim(_c, _user_id);
  IF _state NOT IN ('available', 'checkout_open') THEN
    RETURN jsonb_build_object('ok', false, 'state', _state);
  END IF;

  IF _c.redeemed_by_user_id IS NULL THEN
    UPDATE public.custom_offer_claims
       SET redeemed_by_user_id = _user_id, redeemed_at = now()
     WHERE id = _c.id;
    INSERT INTO public.custom_offer_events (event, claim_id, user_id)
    VALUES ('claim_bound', _c.id, _user_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'state', _state,
    'claim_id', _c.id,
    'current_session_id', _c.checkout_session_id,
    'current_session_expires_at', _c.checkout_session_expires_at
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.custom_offer_prepare_checkout(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_offer_prepare_checkout(text, uuid) TO service_role;

-- Compare-and-set: the new session becomes current only if the current one is
-- still the one the caller saw. A loser gets the winner back and must expire
-- its own session, so at most ONE payable session exists per claim (D6).
CREATE OR REPLACE FUNCTION public.custom_offer_attach_checkout(
  _claim_id            uuid,
  _user_id             uuid,
  _previous_session_id text,
  _session_id          text,
  _session_expires_at  timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _c public.custom_offer_claims%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.custom_offer_claims WHERE id = _claim_id FOR UPDATE;
  IF NOT FOUND OR _c.redeemed_by_user_id IS DISTINCT FROM _user_id
     OR _c.stripe_session_id IS NOT NULL OR _c.revoked_at IS NOT NULL
     OR _session_id IS NULL OR _session_id !~ '^cs_' THEN
    RETURN jsonb_build_object('result', 'refused');
  END IF;
  IF _c.checkout_session_id IS DISTINCT FROM _previous_session_id THEN
    RETURN jsonb_build_object('result', 'conflict', 'current_session_id', _c.checkout_session_id);
  END IF;
  UPDATE public.custom_offer_claims
     SET checkout_session_id = _session_id,
         checkout_session_expires_at = _session_expires_at,
         checkout_attempts = checkout_attempts + 1
   WHERE id = _claim_id;
  INSERT INTO public.custom_offer_events (event, claim_id, user_id, stripe_object_id, detail)
  VALUES ('checkout_started', _claim_id, _user_id, _session_id,
          jsonb_build_object('expires_at', _session_expires_at, 'replaced', _previous_session_id));
  RETURN jsonb_build_object('result', 'attached');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.custom_offer_attach_checkout(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_offer_attach_checkout(uuid, uuid, text, text, timestamptz) TO service_role;

-- Abandoned / failed checkout recovery (D5): the session is released, the
-- customer binding is kept, so the same customer can simply try again.
CREATE OR REPLACE FUNCTION public.custom_offer_release_checkout(_session_id text, _reason text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _id uuid;
  _uid uuid;
BEGIN
  UPDATE public.custom_offer_claims
     SET checkout_session_id = NULL, checkout_session_expires_at = NULL
   WHERE checkout_session_id = _session_id AND stripe_session_id IS NULL
  RETURNING id, redeemed_by_user_id INTO _id, _uid;
  IF _id IS NULL THEN RETURN 'not_current'; END IF;
  INSERT INTO public.custom_offer_events (event, claim_id, user_id, stripe_object_id, detail)
  VALUES ('checkout_released', _id, _uid, _session_id,
          jsonb_build_object('reason', left(COALESCE(_reason, ''), 60)));
  RETURN 'released';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.custom_offer_release_checkout(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_offer_release_checkout(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Service: payment-confirmed activation. Idempotent per Checkout Session.
-- ---------------------------------------------------------------------------
-- The caller (stripe-webhook) must only call this for a signature-verified
-- event whose PaymentIntent has SUCCEEDED. The amount and currency it passes
-- are what Stripe says was charged; they are CHECKED here against the terms,
-- never trusted. The entitlement window is computed here, never passed in.
CREATE OR REPLACE FUNCTION public.custom_offer_activate_purchase(
  _session_id        text,
  _claim_id          uuid,
  _user_id           uuid,
  _payment_intent_id text,
  _customer_id       text,
  _amount_cents      integer,
  _currency          text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _terms   jsonb := public.custom_offer_terms();
  _c       public.custom_offer_claims%ROWTYPE;
  _p       record;
  _exist   public.custom_offer_purchases%ROWTYPE;
  _review  text;
  _start   timestamptz;
  _end     timestamptz;
  _pid     uuid;
  _cur     text := lower(COALESCE(_currency, ''));
BEGIN
  IF _session_id IS NULL OR _session_id !~ '^cs_' THEN
    RAISE EXCEPTION 'invalid_session_id';
  END IF;

  -- Idempotency: one row per Checkout Session, whatever the outcome was.
  SELECT * INTO _exist FROM public.custom_offer_purchases WHERE stripe_session_id = _session_id;
  IF FOUND THEN
    RETURN jsonb_build_object('result', 'duplicate', 'purchase_id', _exist.id, 'status', _exist.status);
  END IF;

  SELECT * INTO _c FROM public.custom_offer_claims WHERE id = _claim_id FOR UPDATE;
  SELECT p.id, p.is_pro, p.pro_grant_kind, p.pro_grant_expires_at, p.pro_grant_reason,
         p.pro_grant_granted_at, p.pro_grant_granted_by
    INTO _p
  FROM public.profiles p WHERE p.user_id = _user_id FOR UPDATE;

  IF _c.id IS NULL OR _p.id IS NULL THEN
    -- Nothing to attach a purchase row to (FKs / NOT NULLs). Ledger it so the
    -- owner can refund, and report it — retrying cannot fix this.
    INSERT INTO public.custom_offer_events (event, claim_id, user_id, stripe_object_id, detail)
    VALUES ('activation_unattributable', _claim_id, _user_id, _session_id, jsonb_build_object(
      'payment_intent', _payment_intent_id, 'amount_cents', _amount_cents, 'currency', _cur,
      'claim_found', _c.id IS NOT NULL, 'profile_found', _p.id IS NOT NULL));
    RETURN jsonb_build_object('result', 'unattributable');
  END IF;

  -- Re-check the session against the session row lock (another paid session
  -- may have committed while this one waited on the lock).
  SELECT * INTO _exist FROM public.custom_offer_purchases WHERE stripe_session_id = _session_id;
  IF FOUND THEN
    RETURN jsonb_build_object('result', 'duplicate', 'purchase_id', _exist.id, 'status', _exist.status);
  END IF;

  _review := CASE
    WHEN _c.redeemed_by_user_id IS DISTINCT FROM _user_id                THEN 'claim_user_mismatch'
    WHEN _amount_cents IS DISTINCT FROM (_terms ->> 'amount_cents')::integer
      OR _cur <> (_terms ->> 'currency')                                 THEN 'amount_mismatch'
    WHEN _c.stripe_session_id IS NOT NULL OR EXISTS (
           SELECT 1 FROM public.custom_offer_purchases x
           WHERE x.claim_id = _c.id AND x.status = 'paid')               THEN 'duplicate_payment'
    WHEN _c.revoked_at IS NOT NULL                                       THEN 'claim_revoked'
    WHEN _p.pro_grant_kind IS NOT NULL AND _p.pro_grant_expires_at IS NULL THEN 'permanent_grant_exists'
  END;

  IF _review IS NOT NULL THEN
    INSERT INTO public.custom_offer_purchases (
      user_id, profile_id, claim_id, stripe_session_id, stripe_payment_intent_id,
      stripe_customer_id, amount_cents, currency, status, review_reason
    ) VALUES (
      _user_id, _p.id, _c.id, _session_id, _payment_intent_id,
      _customer_id, COALESCE(_amount_cents, 0), CASE WHEN _cur ~ '^[a-z]{3}$' THEN _cur ELSE 'xxx' END,
      'review', _review
    ) RETURNING id INTO _pid;
    UPDATE public.custom_offer_claims
       SET checkout_session_id = NULL, checkout_session_expires_at = NULL
     WHERE id = _c.id AND checkout_session_id = _session_id;
    INSERT INTO public.custom_offer_events (event, claim_id, purchase_id, user_id, stripe_object_id, detail)
    VALUES ('purchase_needs_review', _c.id, _pid, _user_id, _session_id,
            jsonb_build_object('reason', _review, 'amount_cents', _amount_cents, 'currency', _cur));
    RETURN jsonb_build_object('result', 'review', 'purchase_id', _pid, 'reason', _review);
  END IF;

  -- 12 CALENDAR months, stacked after any still-valid expiring grant so a
  -- customer who also holds a gift loses none of it.
  _start := GREATEST(now(), CASE
    WHEN public.pro_grant_is_valid(_p.pro_grant_kind, _p.pro_grant_expires_at)
    THEN _p.pro_grant_expires_at END);
  _end := _start + make_interval(months => (_terms ->> 'months')::integer);

  INSERT INTO public.custom_offer_purchases (
    user_id, profile_id, claim_id, stripe_session_id, stripe_payment_intent_id,
    stripe_customer_id, amount_cents, currency, status, entitlement_starts_at,
    entitlement_ends_at, grant_applied, prior_grant_kind, prior_grant_expires_at,
    prior_grant_reason, prior_grant_granted_at, prior_grant_granted_by
  ) VALUES (
    _user_id, _p.id, _c.id, _session_id, _payment_intent_id,
    _customer_id, _amount_cents, _cur, 'paid', _start,
    _end, true, _p.pro_grant_kind, _p.pro_grant_expires_at,
    _p.pro_grant_reason, _p.pro_grant_granted_at, _p.pro_grant_granted_by
  ) RETURNING id INTO _pid;

  IF NOT public.apply_pro_grant(
    _p.id, 'purchase', _end,
    'Custom one-time Premium: 12 months, no auto-renew (purchase ' || _pid::text || ')'
  ) THEN
    -- Unreachable by construction (_end is later than any expiring grant and a
    -- permanent grant routed to review above). Abort rather than record a paid
    -- purchase with no entitlement.
    RAISE EXCEPTION 'custom_offer_grant_not_applied';
  END IF;

  UPDATE public.custom_offer_claims
     SET stripe_session_id = _session_id,
         checkout_session_id = NULL,
         checkout_session_expires_at = NULL
   WHERE id = _c.id;

  INSERT INTO public.custom_offer_events (event, claim_id, purchase_id, user_id, stripe_object_id, detail)
  VALUES ('purchase_activated', _c.id, _pid, _user_id, _session_id, jsonb_build_object(
    'payment_intent', _payment_intent_id, 'amount_cents', _amount_cents, 'currency', _cur,
    'entitlement_starts_at', _start, 'entitlement_ends_at', _end,
    'stacked_on', CASE WHEN _start > now() THEN _p.pro_grant_kind END,
    'stripe_subscription_active', COALESCE(_p.is_pro, false)));

  RETURN jsonb_build_object('result', 'activated', 'purchase_id', _pid,
                            'entitlement_starts_at', _start, 'entitlement_ends_at', _end);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.custom_offer_activate_purchase(text, uuid, uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_offer_activate_purchase(text, uuid, uuid, text, text, integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Service: refunds and lost disputes. Idempotent per PaymentIntent.
-- ---------------------------------------------------------------------------
-- A FULL refund or a lost dispute revokes the purchased entitlement. A partial
-- refund is recorded and changes nothing (owner decision recorded in the
-- handoff). Revocation restores the grant the purchase stacked on (D4); when
-- the grant slot has changed since activation (e.g. a gift was redeemed on top)
-- it is left untouched and flagged, because no automatic answer is safe there.
CREATE OR REPLACE FUNCTION public.custom_offer_record_refund(
  _payment_intent_id     text,
  _amount_refunded_cents integer,
  _reason                text,
  _stripe_object_id      text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _u     public.custom_offer_purchases%ROWTYPE;
  _p     record;
  _full  boolean;
  _out   text;
BEGIN
  IF _reason IS NULL OR _reason NOT IN ('refund', 'dispute_lost') THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;
  SELECT * INTO _u FROM public.custom_offer_purchases
   WHERE stripe_payment_intent_id = _payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;   -- not this offer (e.g. a diamond pack)

  _full := _reason = 'dispute_lost'
        OR GREATEST(COALESCE(_amount_refunded_cents, 0), _u.amount_refunded_cents) >= _u.amount_cents;

  UPDATE public.custom_offer_purchases
     SET amount_refunded_cents = GREATEST(amount_refunded_cents, COALESCE(_amount_refunded_cents, 0)),
         updated_at = now()
   WHERE id = _u.id;

  IF _u.status = 'refunded' THEN RETURN 'already_refunded'; END IF;

  IF NOT _full THEN
    INSERT INTO public.custom_offer_events (event, claim_id, purchase_id, user_id, stripe_object_id, detail)
    VALUES ('partial_refund_recorded', _u.claim_id, _u.id, _u.user_id, _stripe_object_id,
            jsonb_build_object('amount_refunded_cents', _amount_refunded_cents));
    RETURN 'partial_recorded';
  END IF;

  UPDATE public.custom_offer_purchases
     SET status = 'refunded', refunded_at = now(), revoke_reason = _reason, updated_at = now()
   WHERE id = _u.id;

  IF _u.status <> 'paid' OR NOT _u.grant_applied THEN
    _out := 'refunded_unactivated';
  ELSE
    SELECT p.pro_grant_kind, p.pro_grant_expires_at INTO _p
    FROM public.profiles p WHERE p.id = _u.profile_id FOR UPDATE;
    IF FOUND AND _p.pro_grant_kind = 'purchase'
       AND _p.pro_grant_expires_at IS NOT DISTINCT FROM _u.entitlement_ends_at THEN
      IF public.pro_grant_is_valid(_u.prior_grant_kind, _u.prior_grant_expires_at) THEN
        UPDATE public.profiles SET
          pro_grant_kind       = _u.prior_grant_kind,
          pro_grant_expires_at = _u.prior_grant_expires_at,
          pro_grant_reason     = _u.prior_grant_reason,
          pro_grant_granted_at = _u.prior_grant_granted_at,
          pro_grant_granted_by = _u.prior_grant_granted_by
        WHERE id = _u.profile_id;
        _out := 'revoked_restored_prior';
      ELSE
        UPDATE public.profiles SET
          pro_grant_kind = NULL, pro_grant_expires_at = NULL, pro_grant_reason = NULL,
          pro_grant_granted_at = NULL, pro_grant_granted_by = NULL
        WHERE id = _u.profile_id;
        _out := 'revoked';
      END IF;
    ELSE
      _out := 'revoked_needs_review';
    END IF;
  END IF;

  INSERT INTO public.custom_offer_events (event, claim_id, purchase_id, user_id, stripe_object_id, detail)
  VALUES ('purchase_' || _out, _u.claim_id, _u.id, _u.user_id, _stripe_object_id,
          jsonb_build_object('reason', _reason, 'amount_refunded_cents', _amount_refunded_cents));
  RETURN _out;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.custom_offer_record_refund(text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_offer_record_refund(text, integer, text, text) TO service_role;

-- Generic ledger writer for webhook outcomes that change no state.
CREATE OR REPLACE FUNCTION public.custom_offer_log_event(
  _event            text,
  _claim_id         uuid,
  _user_id          uuid,
  _stripe_object_id text,
  _detail           jsonb
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
  INSERT INTO public.custom_offer_events (event, claim_id, user_id, stripe_object_id, detail)
  VALUES (left(_event, 60), _claim_id, _user_id, _stripe_object_id, COALESCE(_detail, '{}'::jsonb));
$function$;
REVOKE EXECUTE ON FUNCTION public.custom_offer_log_event(text, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_offer_log_event(text, uuid, uuid, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Customer: my own one-time purchases (self only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_custom_offer_purchases()
RETURNS TABLE (
  purchase_id           uuid,
  status                text,
  amount_cents          integer,
  currency              text,
  entitlement_starts_at timestamptz,
  entitlement_ends_at   timestamptz,
  purchased_at          timestamptz,
  refunded_at           timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT x.id, x.status, x.amount_cents, x.currency, x.entitlement_starts_at,
         x.entitlement_ends_at, x.created_at, x.refunded_at
  FROM public.custom_offer_purchases x
  WHERE auth.uid() IS NOT NULL AND x.user_id = auth.uid()
  ORDER BY x.created_at DESC
  LIMIT 20;
$function$;
REVOKE EXECUTE ON FUNCTION public.my_custom_offer_purchases() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_custom_offer_purchases() TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. In-transaction assertions: a regression aborts the migration.
-- ---------------------------------------------------------------------------
DO $assert_pt16b$
DECLARE
  _fn   record;
  _bad  text;
BEGIN
  -- Every custom-offer function: SECURITY DEFINER, empty search_path, never
  -- executable by anon, and service-only unless it is an owner/self function.
  FOR _fn IN
    SELECT p.oid, p.proname, p.prosecdef, p.proconfig
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'custom\_offer\_%' OR p.proname IN (
        'owner_create_custom_offer_claim', 'owner_list_custom_offer_claims',
        'owner_revoke_custom_offer_claim', 'my_custom_offer_purchases'))
  LOOP
    IF _fn.proname <> 'custom_offer_terms' AND NOT _fn.prosecdef THEN
      RAISE EXCEPTION 'PT1.6b: % must be SECURITY DEFINER', _fn.proname;
    END IF;
    IF NOT ('search_path=""' = ANY (COALESCE(_fn.proconfig, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'PT1.6b: % must pin an empty search_path', _fn.proname;
    END IF;
    IF pg_catalog.has_function_privilege('anon', _fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'PT1.6b: anon can execute %', _fn.proname;
    END IF;
    IF _fn.proname LIKE 'custom\_offer\_%'
       AND pg_catalog.has_function_privilege('authenticated', _fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'PT1.6b: authenticated can execute service-only %', _fn.proname;
    END IF;
  END LOOP;

  FOREACH _bad IN ARRAY ARRAY['custom_offer_claims', 'custom_offer_purchases', 'custom_offer_events'] LOOP
    IF pg_catalog.has_table_privilege('anon', 'public.' || _bad, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
       OR pg_catalog.has_table_privilege('authenticated', 'public.' || _bad, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'PT1.6b: a browser role holds a privilege on public.%', _bad;
    END IF;
  END LOOP;

  -- The superseded 0002 writers are gone.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'redeem_custom_offer_claim', 'restore_custom_offer_claim',
      'record_custom_offer_purchase', 'refund_custom_offer_purchase')
  ) THEN
    RAISE EXCEPTION 'PT1.6b: a superseded 0002 function still exists';
  END IF;

  -- The terms are exactly the approved offer.
  IF public.custom_offer_terms() <> '{"offer_id":"custom_one_time_50","amount_cents":5000,"currency":"usd","months":12,"auto_renews":false}'::jsonb THEN
    RAISE EXCEPTION 'PT1.6b: custom_offer_terms drifted from $50 / usd / 12 months / no renewal';
  END IF;
END
$assert_pt16b$;
