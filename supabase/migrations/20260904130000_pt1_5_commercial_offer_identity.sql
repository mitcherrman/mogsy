-- PT1.5 — Commercial offer identity for Mogzy Premium
--
-- PROBLEM
-- -------
-- Mogzy sells Pro through Stripe and persists exactly one fact about it:
-- `profiles.is_pro`. There is no Stripe customer id, no subscription id, no
-- price, no interval and no record of WHICH commercial offer a customer
-- bought. Two live prices already grant the same entitlement, and the launch
-- ($7.99/$79.99) and Founding Playtester ($39.99 first year) offers would add
-- three more. Without offer identity we could never answer "how many customers
-- came from the playtest?", "what did this person actually buy?", or "what
-- will Stripe charge them next?" — and a price migration would silently
-- rewrite history.
--
-- MODEL AFTER THIS MIGRATION
-- --------------------------
-- Two clearly separated concepts, neither of which is entitlement:
--
--   1. ACQUISITION IDENTITY  (`pro_offer*`)  — WRITE-ONCE, durable.
--      Which approved Mogzy offer first made this account a paying customer,
--      when, and on which Stripe Price. Reconciliation may never rewrite it,
--      so a later price change, cancellation or resubscription cannot destroy
--      the cohort a customer was acquired in.
--
--   2. CURRENT BILLING STATE (`stripe_*`)    — MUTABLE, Stripe-owned.
--      The live subscription: customer, subscription, current price, interval,
--      status and period end. Freely reconciled from Stripe by the webhook and
--      by check-subscription.
--
-- ONE PRODUCT. Every offer grants the SAME Mogzy Premium entitlement. Nothing in
-- the product may branch on the offer id to decide access: offers are
-- commercial terms, not feature tiers.
--
-- NOT ENTITLEMENT. PT1.4 is untouched. `profiles.is_pro` remains the
-- Stripe-derived half, `profiles.pro_grant_*` the non-Stripe grant half, and
-- `public.pro_entitlement_is_effective` the only composition rule. The
-- function added here writes NEITHER of those columns, so recording commercial
-- state can never grant, revoke or alter access.
--
-- Pre-launch note: current customer/profile rows are disposable test data.
-- Nothing is backfilled. A subscription bought before PT1.5 carries no offer
-- metadata, so its acquisition offer stays NULL — honestly "unknown", not
-- guessed.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  -- Acquisition identity (write-once)
  ADD COLUMN IF NOT EXISTS pro_offer                  text,
  ADD COLUMN IF NOT EXISTS pro_offer_acquired_at      timestamptz,
  ADD COLUMN IF NOT EXISTS pro_offer_price_id         text,
  -- Current Stripe billing state (mutable, reconciled)
  ADD COLUMN IF NOT EXISTS stripe_customer_id         text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id     text,
  ADD COLUMN IF NOT EXISTS stripe_price_id            text,
  ADD COLUMN IF NOT EXISTS stripe_billing_interval    text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text,
  ADD COLUMN IF NOT EXISTS stripe_current_period_end  timestamptz;

COMMENT ON COLUMN public.profiles.pro_offer IS
  'PT1.5: WRITE-ONCE acquisition identity — which approved Mogzy commercial offer '
  'first made this account a paying customer. NOT entitlement and NOT a feature '
  'tier; every offer grants the same Pro. NULL = acquired before PT1.5, or never.';
COMMENT ON COLUMN public.profiles.pro_offer_acquired_at IS
  'PT1.5: when the commercial relationship began. Set with pro_offer, never rewritten.';
COMMENT ON COLUMN public.profiles.pro_offer_price_id IS
  'PT1.5: the Stripe Price that produced the acquisition. Historical; may differ '
  'from stripe_price_id after a price migration.';
COMMENT ON COLUMN public.profiles.stripe_price_id IS
  'PT1.5: the Stripe Price the CURRENT subscription bills on — what Stripe will '
  'charge at the next renewal. Mutable; reconciled from Stripe.';
COMMENT ON COLUMN public.profiles.stripe_subscription_status IS
  'PT1.5: raw Stripe subscription status (active | trialing | past_due | canceled | ...). '
  'Billing state only — effective Pro is public.pro_entitlement_is_effective().';

-- Controlled vocabulary. Offer ids are stable business identities that outlive
-- any Stripe Price; adding one is a deliberate act with a migration.
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_pro_offer_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_pro_offer_check
      CHECK (pro_offer IS NULL OR pro_offer IN (
        'standard_monthly', 'standard_annual',
        'launch_monthly', 'launch_annual',
        'founding_playtester'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_stripe_billing_interval_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_stripe_billing_interval_check
      CHECK (stripe_billing_interval IS NULL
             OR stripe_billing_interval IN ('day', 'week', 'month', 'year'));
  END IF;
END
$constraint$;

-- Cohort analytics ("how many customers came from launch pricing?") and
-- support lookups by Stripe identifier.
CREATE INDEX IF NOT EXISTS profiles_pro_offer_idx
  ON public.profiles (pro_offer) WHERE pro_offer IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. The one writer of commercial state
-- ---------------------------------------------------------------------------
-- Called by the Stripe edge functions with the service role. Deliberately
-- executable by NO client role, exactly like apply_pro_grant.
--
-- The write-once rule for acquisition identity lives HERE, in Postgres, so it
-- holds no matter which reconciliation path runs, in what order, or how many
-- times. Replays are safe: billing state converges, acquisition identity is
-- immutable once set.
CREATE OR REPLACE FUNCTION public.record_pro_commercial_state(
  _user_id                uuid,
  _offer_id               text        DEFAULT NULL,
  _stripe_customer_id     text        DEFAULT NULL,
  _stripe_subscription_id text        DEFAULT NULL,
  _stripe_price_id        text        DEFAULT NULL,
  _billing_interval       text        DEFAULT NULL,
  _subscription_status    text        DEFAULT NULL,
  _current_period_end     timestamptz DEFAULT NULL
)
RETURNS TABLE (
  pro_offer                  text,
  pro_offer_acquired_at      timestamptz,
  pro_offer_price_id         text,
  stripe_price_id            text,
  stripe_billing_interval    text,
  stripe_subscription_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _safe_offer    text;
  _safe_interval text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'A target user_id is required';
  END IF;

  -- Unknown offer ids are stored as NULL rather than raising. A webhook that
  -- fails makes Stripe retry forever; an offer id we do not recognise is a
  -- deployment-order problem, not a billing problem, and must not wedge the
  -- entitlement sync that runs alongside it. This also means the CHECK
  -- constraint above can never be violated from this path.
  _safe_offer := CASE
    WHEN _offer_id IN ('standard_monthly', 'standard_annual',
                       'launch_monthly', 'launch_annual',
                       'founding_playtester')
    THEN _offer_id END;

  _safe_interval := CASE
    WHEN _billing_interval IN ('day', 'week', 'month', 'year')
    THEN _billing_interval END;

  UPDATE public.profiles p SET
    -- ACQUISITION IDENTITY — write-once. Once a customer has an acquisition
    -- offer, no reconciliation, price change, cancellation or resubscription
    -- may overwrite it. This is the whole point of separating the two halves.
    pro_offer = COALESCE(p.pro_offer, _safe_offer),
    pro_offer_acquired_at = CASE
      WHEN p.pro_offer IS NULL AND _safe_offer IS NOT NULL THEN now()
      ELSE p.pro_offer_acquired_at END,
    pro_offer_price_id = CASE
      WHEN p.pro_offer IS NULL AND _safe_offer IS NOT NULL THEN _stripe_price_id
      ELSE p.pro_offer_price_id END,

    -- CURRENT BILLING STATE — mutable. COALESCE keeps a known identifier when
    -- a particular event does not carry it, rather than blanking it out.
    stripe_customer_id         = COALESCE(_stripe_customer_id, p.stripe_customer_id),
    stripe_subscription_id     = COALESCE(_stripe_subscription_id, p.stripe_subscription_id),
    stripe_price_id            = COALESCE(_stripe_price_id, p.stripe_price_id),
    stripe_billing_interval    = COALESCE(_safe_interval, p.stripe_billing_interval),
    stripe_subscription_status = COALESCE(_subscription_status, p.stripe_subscription_status),
    stripe_current_period_end  = COALESCE(_current_period_end, p.stripe_current_period_end)
  WHERE p.user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile for user %', _user_id;
  END IF;

  RETURN QUERY
    SELECT p.pro_offer, p.pro_offer_acquired_at, p.pro_offer_price_id,
           p.stripe_price_id, p.stripe_billing_interval, p.stripe_subscription_status
    FROM public.profiles p
    WHERE p.user_id = _user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_pro_commercial_state(
  uuid, text, text, text, text, text, text, timestamptz
) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Protect the new columns from self-service writes
-- ---------------------------------------------------------------------------
-- Same shape and the same service-role guard as ADM2 Phase A / PT1.4. Without
-- this, a signed-in user could PATCH profiles.pro_offer and forge a founding
-- cohort membership, or blank another account's billing state.
CREATE OR REPLACE FUNCTION public.protect_profile_premium_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow service-role / SECURITY DEFINER server writes (no auth.uid()) and admins
  IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(), 'admin') THEN
    NEW.is_pro := OLD.is_pro;
    NEW.diamonds := OLD.diamonds;
    NEW.boost_credits := OLD.boost_credits;
    NEW.elo_shields := OLD.elo_shields;
    NEW.reveals := OLD.reveals;
    NEW.rewinds := OLD.rewinds;
    NEW.is_bot := OLD.is_bot;
    NEW.is_disabled := OLD.is_disabled;   -- ADM2 Phase A
    NEW.is_flagged_underage := OLD.is_flagged_underage;
    NEW.admin_notes := OLD.admin_notes;
    NEW.ads_enabled := OLD.ads_enabled;
    NEW.active_boost_until := OLD.active_boost_until;
    NEW.pro_grant_kind := OLD.pro_grant_kind;              -- PT1.4
    NEW.pro_grant_expires_at := OLD.pro_grant_expires_at;  -- PT1.4
    NEW.pro_grant_reason := OLD.pro_grant_reason;          -- PT1.4
    NEW.pro_grant_granted_at := OLD.pro_grant_granted_at;  -- PT1.4
    NEW.pro_grant_granted_by := OLD.pro_grant_granted_by;  -- PT1.4
    NEW.pro_offer := OLD.pro_offer;                                    -- PT1.5
    NEW.pro_offer_acquired_at := OLD.pro_offer_acquired_at;            -- PT1.5
    NEW.pro_offer_price_id := OLD.pro_offer_price_id;                  -- PT1.5
    NEW.stripe_customer_id := OLD.stripe_customer_id;                  -- PT1.5
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;          -- PT1.5
    NEW.stripe_price_id := OLD.stripe_price_id;                        -- PT1.5
    NEW.stripe_billing_interval := OLD.stripe_billing_interval;        -- PT1.5
    NEW.stripe_subscription_status := OLD.stripe_subscription_status;  -- PT1.5
    NEW.stripe_current_period_end := OLD.stripe_current_period_end;    -- PT1.5
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Pricing mode
-- ---------------------------------------------------------------------------
-- Which price family the site may sell right now. Read by the Shop for display
-- AND by create-checkout as authority, so a client cannot keep buying launch
-- pricing after the launch window closes by replaying the offer id. Seeded to
-- 'standard' — full price — so the launch discount is opt-in, never a default.
-- app_settings is world-readable and admin-writable, which is correct here:
-- the current price list is public information.
INSERT INTO public.app_settings (key, value)
VALUES ('pro_pricing', '{"mode": "standard"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. In-transaction assertions — a regression aborts the migration
-- ---------------------------------------------------------------------------
DO $assert_protect$
DECLARE
  _def text;
  _col text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'protect_profile_premium_fields';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'PT1.5: protect_profile_premium_fields is missing after CREATE';
  END IF;
  IF _def NOT ILIKE '%auth.uid() IS NOT NULL AND%' THEN
    RAISE EXCEPTION 'PT1.5: the service-role guard is missing -- service-role writes such as the stripe-webhook sync would be silently reverted';
  END IF;

  -- Carry forward every protection PT1.4 and ADM2 Phase A established.
  FOREACH _col IN ARRAY ARRAY[
    'is_pro', 'diamonds', 'boost_credits', 'elo_shields', 'reveals', 'rewinds',
    'is_bot', 'is_disabled', 'is_flagged_underage', 'admin_notes', 'ads_enabled',
    'active_boost_until',
    'pro_grant_kind', 'pro_grant_expires_at', 'pro_grant_reason',
    'pro_grant_granted_at', 'pro_grant_granted_by',
    -- new in PT1.5
    'pro_offer', 'pro_offer_acquired_at', 'pro_offer_price_id',
    'stripe_customer_id', 'stripe_subscription_id', 'stripe_price_id',
    'stripe_billing_interval', 'stripe_subscription_status',
    'stripe_current_period_end'
  ] LOOP
    IF _def NOT ILIKE '%NEW.' || _col || ' := OLD.' || _col || '%' THEN
      RAISE EXCEPTION 'PT1.5: % protection is missing from protect_profile_premium_fields', _col;
    END IF;
  END LOOP;
END
$assert_protect$;

DO $assert_writer$
DECLARE
  _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'record_pro_commercial_state';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'PT1.5: record_pro_commercial_state is missing after CREATE';
  END IF;
  -- It must never touch entitlement. PT1.4 owns is_pro and pro_grant_*.
  IF _def ~* '(^|[^_a-z])is_pro\s*=' THEN
    RAISE EXCEPTION 'PT1.5: record_pro_commercial_state writes is_pro -- commercial identity must never grant entitlement';
  END IF;
  IF _def ~* 'pro_grant_\w+\s*=' THEN
    RAISE EXCEPTION 'PT1.5: record_pro_commercial_state writes a pro_grant_ column -- that is PT1.4 entitlement state';
  END IF;
  -- Acquisition identity must be write-once.
  IF _def NOT ILIKE '%pro_offer = COALESCE(p.pro_offer, _safe_offer)%' THEN
    RAISE EXCEPTION 'PT1.5: acquisition offer is no longer write-once -- reconciliation could rewrite commercial history';
  END IF;
END
$assert_writer$;

-- The entitlement composition rule is untouched by PT1.5. Re-assert PT1.4's
-- matrix so this migration cannot ship alongside a regressed entitlement rule.
DO $assert_entitlement_intact$
DECLARE
  _future timestamptz := now() + interval '30 days';
  _past   timestamptz := now() - interval '1 day';
BEGIN
  ASSERT public.pro_entitlement_is_effective(false, NULL, NULL) = false;
  ASSERT public.pro_entitlement_is_effective(true,  NULL, NULL) = true;
  ASSERT public.pro_entitlement_is_effective(false, 'playtest', _future) = true;
  ASSERT public.pro_entitlement_is_effective(false, 'manual',   NULL)    = true;
  ASSERT public.pro_entitlement_is_effective(true,  'playtest', _past)   = true;
  ASSERT public.pro_entitlement_is_effective(false, 'playtest', _past)   = false;
END
$assert_entitlement_intact$;
