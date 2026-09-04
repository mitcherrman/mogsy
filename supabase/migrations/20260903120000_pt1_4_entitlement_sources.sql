-- PT1.4 — Entitlement hardening for playtest / comped Pro grants
--
-- PROBLEM
-- -------
-- `profiles.is_pro` was a single mutable boolean that two independent Stripe
-- writers force-synced to Stripe subscription state:
--
--   * supabase/functions/check-subscription/index.ts  (pull, on /shop visit)
--   * supabase/functions/stripe-webhook/index.ts      (push, on subscription events)
--
-- Both write `is_pro = <has active Stripe subscription>`. Any Pro that Stripe
-- does not know about — an admin grant (AdminUsers "Pro Status" switch), a
-- redeemed Pro gift (redeem-gift), a promotional/playtester comp — was therefore
-- silently REVOKED the next time either writer ran. A comped playtester loses
-- Pro simply by visiting the Shop.
--
-- MODEL AFTER THIS MIGRATION
-- --------------------------
-- Entitlement has two independent sources, stored separately, each owned by
-- exactly one writer:
--
--   1. Stripe-derived entitlement  -> `profiles.is_pro`
--        REDEFINED: is_pro now means *"has a paid/trialing Stripe subscription"*,
--        nothing more. It is a cache of Stripe state. Only Stripe code writes it
--        (check-subscription, stripe-webhook). Its force-sync behaviour is CORRECT
--        under this definition and is deliberately left intact.
--
--   2. Manual / promotional entitlement -> `profiles.pro_grant_*`
--        A non-Stripe grant with an optional expiry. Written by admins (via
--        admin_set_pro_grant) and by redeem-gift. Stripe never touches it.
--
-- Effective Pro = stripe_pro OR valid_grant.  Composed in exactly one place:
-- `public.pro_entitlement_is_effective(...)`, surfaced to callers through
-- `public.my_pro_entitlement()`. No caller re-implements the OR.
--
-- Pre-launch note: every current profile row is test data. Existing `is_pro`
-- values are left as-is and are henceforth interpreted as Stripe-derived; no
-- historical manual grant is reconstructed (none is recoverable — the old model
-- did not record entitlement source). Existing paid Stripe subscribers are
-- unaffected: their is_pro keeps being maintained by the same Stripe writers.

-- ---------------------------------------------------------------------------
-- 1. Grant columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pro_grant_kind       text,
  ADD COLUMN IF NOT EXISTS pro_grant_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pro_grant_reason     text,
  ADD COLUMN IF NOT EXISTS pro_grant_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS pro_grant_granted_by uuid;

COMMENT ON COLUMN public.profiles.is_pro IS
  'PT1.4: Stripe-derived entitlement ONLY (active/trialing Stripe subscription). '
  'Written exclusively by check-subscription and stripe-webhook. NOT the effective '
  'Pro answer — use public.my_pro_entitlement() / effective_pro.';
COMMENT ON COLUMN public.profiles.pro_grant_kind IS
  'PT1.4: non-Stripe entitlement source: manual | playtest | promo | gift. NULL = no grant.';
COMMENT ON COLUMN public.profiles.pro_grant_expires_at IS
  'PT1.4: grant expiry. NULL with a non-NULL kind = grant does not expire.';

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_pro_grant_kind_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_pro_grant_kind_check
      CHECK (pro_grant_kind IS NULL
             OR pro_grant_kind IN ('manual', 'playtest', 'promo', 'gift'));
  END IF;
END
$constraint$;

-- ---------------------------------------------------------------------------
-- 2. The ONE composition rule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pro_grant_is_valid(
  _kind text,
  _expires_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  -- A grant exists when a kind is set. It is valid while it has no expiry
  -- (permanent comp) or its expiry is still in the future.
  SELECT _kind IS NOT NULL AND (_expires_at IS NULL OR _expires_at > now());
$function$;

CREATE OR REPLACE FUNCTION public.pro_entitlement_is_effective(
  _stripe_pro boolean,
  _grant_kind text,
  _grant_expires_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  -- THE canonical effective-Pro rule. Stripe-derived OR valid manual grant.
  -- Every other read path in the product must resolve through this function
  -- (directly, or via my_pro_entitlement / the backend resolver that calls it).
  SELECT COALESCE(_stripe_pro, false)
      OR public.pro_grant_is_valid(_grant_kind, _grant_expires_at);
$function$;

-- ---------------------------------------------------------------------------
-- 3. Caller-facing resolver (self only)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER but hard-scoped to auth.uid(): it takes no user argument, so
-- it can never report another account's entitlement. Returns NULL-free booleans
-- and enough provenance for a UI to explain *why* someone is Pro.
CREATE OR REPLACE FUNCTION public.my_pro_entitlement()
RETURNS TABLE (
  effective_pro      boolean,
  stripe_pro         boolean,
  grant_kind         text,
  grant_expires_at   timestamptz,
  grant_reason       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.pro_entitlement_is_effective(p.is_pro, p.pro_grant_kind, p.pro_grant_expires_at),
    COALESCE(p.is_pro, false),
    CASE WHEN public.pro_grant_is_valid(p.pro_grant_kind, p.pro_grant_expires_at)
         THEN p.pro_grant_kind END,
    CASE WHEN public.pro_grant_is_valid(p.pro_grant_kind, p.pro_grant_expires_at)
         THEN p.pro_grant_expires_at END,
    CASE WHEN public.pro_grant_is_valid(p.pro_grant_kind, p.pro_grant_expires_at)
         THEN p.pro_grant_reason END
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.my_pro_entitlement() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_pro_entitlement() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Admin grant / revoke path
-- ---------------------------------------------------------------------------
-- The operational surface for comped playtesters. Records who granted and when,
-- so admin tooling can explain an entitlement. Passing _kind => NULL revokes the
-- grant (and only the grant — Stripe access is untouched).
CREATE OR REPLACE FUNCTION public.admin_set_pro_grant(
  _user_id uuid,
  _kind text DEFAULT NULL,
  _expires_at timestamptz DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS TABLE (
  effective_pro    boolean,
  stripe_pro       boolean,
  grant_kind       text,
  grant_expires_at timestamptz,
  grant_reason     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required to set a Pro grant';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'A target user_id is required';
  END IF;
  IF _kind IS NOT NULL AND _kind NOT IN ('manual', 'playtest', 'promo', 'gift') THEN
    RAISE EXCEPTION 'Unknown grant kind: %', _kind;
  END IF;

  UPDATE public.profiles p SET
    pro_grant_kind       = _kind,
    pro_grant_expires_at = CASE WHEN _kind IS NULL THEN NULL ELSE _expires_at END,
    pro_grant_reason     = CASE WHEN _kind IS NULL THEN NULL ELSE _reason END,
    pro_grant_granted_at = CASE WHEN _kind IS NULL THEN NULL ELSE now() END,
    pro_grant_granted_by = CASE WHEN _kind IS NULL THEN NULL ELSE _caller END
  WHERE p.user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile for user %', _user_id;
  END IF;

  RETURN QUERY
    SELECT
      public.pro_entitlement_is_effective(p.is_pro, p.pro_grant_kind, p.pro_grant_expires_at),
      COALESCE(p.is_pro, false),
      p.pro_grant_kind,
      p.pro_grant_expires_at,
      p.pro_grant_reason
    FROM public.profiles p
    WHERE p.user_id = _user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_set_pro_grant(uuid, text, timestamptz, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pro_grant(uuid, text, timestamptz, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Protect the grant columns from self-service writes
-- ---------------------------------------------------------------------------
-- Same shape as ADM2 Phase A (20260803120000): a non-admin authenticated writer
-- has every premium field clamped back to its old value. Service-role and
-- SECURITY DEFINER writes (auth.uid() IS NULL) stay unclamped so the Stripe
-- webhook, redeem-gift and admin_set_pro_grant continue to work.
--
-- Without this, any signed-in user could PATCH profiles.pro_grant_kind and
-- self-grant permanent Pro — i.e. the fix would open a worse hole than the bug.
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
  END IF;
  RETURN NEW;
END;
$function$;

-- Static assertions, in-transaction: a regression aborts the migration rather
-- than shipping a silently weakened trigger. Carries forward ADM2's three.
DO $assert_protect$
DECLARE
  _def text;
  _col text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'protect_profile_premium_fields';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'PT1.4: protect_profile_premium_fields is missing after CREATE';
  END IF;
  IF _def NOT ILIKE '%auth.uid() IS NOT NULL AND%' THEN
    RAISE EXCEPTION 'PT1.4: the service-role guard is missing -- service-role writes such as the stripe-webhook is_pro sync would be silently reverted';
  END IF;
  IF _def NOT ILIKE '%NEW.active_boost_until := OLD.active_boost_until%' THEN
    RAISE EXCEPTION 'PT1.4: active_boost_until protection is missing';
  END IF;
  IF _def NOT ILIKE '%NEW.is_disabled := OLD.is_disabled%' THEN
    RAISE EXCEPTION 'PT1.4: is_disabled protection is missing';
  END IF;

  FOREACH _col IN ARRAY ARRAY[
    'pro_grant_kind', 'pro_grant_expires_at', 'pro_grant_reason',
    'pro_grant_granted_at', 'pro_grant_granted_by'
  ] LOOP
    IF _def NOT ILIKE '%NEW.' || _col || ' := OLD.' || _col || '%' THEN
      RAISE EXCEPTION 'PT1.4: % protection is missing -- a non-admin could self-grant Pro', _col;
    END IF;
  END LOOP;
END
$assert_protect$;

-- Composition rule sanity check: the full PT1.4 entitlement matrix, asserted at
-- migration time against the real functions.
DO $assert_matrix$
DECLARE
  _future timestamptz := now() + interval '30 days';
  _past   timestamptz := now() - interval '1 day';
BEGIN
  -- Stripe inactive + no grant -> Free
  ASSERT public.pro_entitlement_is_effective(false, NULL, NULL) = false;
  ASSERT public.pro_entitlement_is_effective(NULL,  NULL, NULL) = false;
  -- Stripe active + no grant -> Pro
  ASSERT public.pro_entitlement_is_effective(true,  NULL, NULL) = true;
  -- Stripe inactive + valid grant -> Pro
  ASSERT public.pro_entitlement_is_effective(false, 'playtest', _future) = true;
  ASSERT public.pro_entitlement_is_effective(false, 'manual',   NULL)    = true;
  -- Stripe active + valid grant -> Pro
  ASSERT public.pro_entitlement_is_effective(true,  'playtest', _future) = true;
  -- Stripe active + expired grant -> Pro (Stripe still carries it)
  ASSERT public.pro_entitlement_is_effective(true,  'playtest', _past)   = true;
  -- Stripe inactive + expired grant -> Free
  ASSERT public.pro_entitlement_is_effective(false, 'playtest', _past)   = false;
END
$assert_matrix$;
