-- PT2C — SERVER-SIDE AUTHORITY FOR profiles.profile_frame.
--
-- THE GAP THIS CLOSES
-- -------------------
-- Profile frames were gated in ONE place: `Profile.tsx` renders the frame grid
-- only when the caller resolves Premium. Nothing on the server agreed. The
-- existing `Users can update own profile` policy lets an owner write any column
-- it does not explicitly pin, and `profile_frame` was never pinned — so a
-- signed-in Free user could bypass the UI entirely with a direct
-- `profiles.update({ profile_frame: 'gold' })` (or the equivalent PostgREST
-- PATCH) and equip a Premium cosmetic. `src/lib/premium/matrix.ts` has recorded
-- this as the outstanding half of PT1.13B since that work landed.
--
-- ACQUISITION IS GATED, PERSISTENCE IS NOT
-- ----------------------------------------
-- Mogzy has no cosmetic OWNERSHIP store: `profiles.profile_frame` is a single
-- column that is simultaneously "what I own" and "what I have equipped". This
-- migration deliberately does NOT invent one. Instead it enforces the only
-- distinction the data can actually support, which is also the correct one:
--
--   the CHANGE is authorized, the STORED VALUE is never re-authorized.
--
-- So the check fires only when `NEW.profile_frame IS DISTINCT FROM OLD`. A row
-- that already holds `gold` keeps `gold` through every future save of a bio, an
-- age, a theme or an avatar, no matter what the account's entitlement has since
-- become. That is PT1.13B's approved lapse policy — keep what you equipped,
-- lose the ability to switch — now enforced on the server instead of merely
-- being un-broken by the client.
--
-- It is the exact inverse of the shape PT1.13B removed. `profile_frame: isPro
-- ? selectedFrame : 'default'` re-evaluated entitlement against the STORED
-- value on every unrelated write and destroyed it. Nothing here reads the
-- stored value as a claim to be re-proved.
--
-- GLOBAL PREMIUM ACCESS
-- ---------------------
-- The authorization term is the same union the rest of the product resolves,
-- and it is composed here rather than redefined:
--
--   may_change_frame = global_premium_access()
--                      OR pro_entitlement_is_effective(is_pro, grant_kind,
--                                                      grant_expires_at)
--
-- ACCESS OR ENTITLEMENT — the two concepts the Global Premium Access migration
-- (20260909120000) kept apart, joined at the point of a decision and nowhere
-- else. A Free user may select any frame while the window is open, exactly as a
-- Premium user could. When it closes they may no longer switch to another
-- Premium frame — and, per the paragraph above, whatever they legitimately
-- equipped while it was open simply stays. Turning the switch OFF still writes
-- nothing, reverts nothing, and remains a non-revocation.
--
-- SCOPE: SELF-SERVICE WRITES ONLY
-- -------------------------------
-- The rule applies when the caller is editing THEIR OWN row
-- (`OLD.user_id = auth.uid()`), which is the only row RLS lets a non-admin
-- update at all. Admin surfaces are untouched by construction: admin bot
-- profiles (`admin_create_bot_profile` / `admin_update_bot_profile`) carry a
-- synthetic `user_id` that is never the acting admin's, so their arbitrary
-- frame strings keep working under their own master-admin authorization; and
-- the pre-existing `has_role(auth.uid(), 'admin')` bypass at the top of this
-- trigger still exempts an admin editing their own profile. Service-role and
-- SECURITY DEFINER server writes (`auth.uid() IS NULL`) are exempt as before.
--
-- Nothing about Stripe, subscriptions, grants or pricing is read or written
-- here, and no existing policy is widened or dropped.

-- ---------------------------------------------------------------------------
-- 1. Which frames cost money
-- ---------------------------------------------------------------------------
-- The catalogue lives in `frameOptions` in src/pages/Profile.tsx; only the
-- FREE half of it needs to be restated here, and that half is one entry. Every
-- other value — the shipped Premium frames, and anything a crafted request
-- invents — requires entitlement. Fail-closed on unknown text is deliberate:
-- it also stops an arbitrary string being written into a column that several
-- surfaces render, without turning this into a general validator.
--
-- NULL is the absent frame and is free, so profile creation and clearing are
-- unaffected.
CREATE OR REPLACE FUNCTION public.profile_frame_requires_premium(_frame text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT _frame IS NOT NULL
     AND btrim(_frame) <> ''
     AND btrim(lower(_frame)) <> 'default';
$function$;

-- ---------------------------------------------------------------------------
-- 2. Global Premium Access, readable from SQL
-- ---------------------------------------------------------------------------
-- Same row, same fail-closed contract as services/platform_policy.py and
-- src/lib/platform-policy/policy.ts: absent row, absent key or unreadable
-- value all answer FALSE. A settings outage can never hand out a paid
-- cosmetic, and the seed migration remaining unapplied stays harmless.
CREATE OR REPLACE FUNCTION public.global_premium_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT (s.value ->> 'enabled')::boolean
       FROM public.app_settings s
      WHERE s.key = 'global_premium_access'
      LIMIT 1),
    false);
$function$;

REVOKE EXECUTE ON FUNCTION public.global_premium_access() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.global_premium_access() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The decision
-- ---------------------------------------------------------------------------
-- Takes the entitlement columns explicitly so it is testable in isolation and
-- so the trigger can pass OLD — the persisted truth — rather than a NEW that a
-- caller supplied.
CREATE OR REPLACE FUNCTION public.may_equip_profile_frame(
  _frame            text,
  _stripe_pro       boolean,
  _grant_kind       text,
  _grant_expires_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT NOT public.profile_frame_requires_premium(_frame)
      OR public.global_premium_access()
      OR public.pro_entitlement_is_effective(_stripe_pro, _grant_kind,
                                             _grant_expires_at);
$function$;

-- ---------------------------------------------------------------------------
-- 4. Enforce it on the existing BEFORE UPDATE trigger
-- ---------------------------------------------------------------------------
-- Extends `protect_profile_premium_fields` rather than adding a second trigger:
-- one function already owns "what a self-service update may not do to a profiles
-- row", and splitting that across two triggers would make the firing order
-- part of the security argument.
--
-- Frames are NOT clamped like the columns above. A clamp is right for a paid
-- counter, where silently ignoring the write is the safe outcome. Here the
-- caller has necessarily gone around the UI, and the honest answer is a refused
-- statement — `insufficient_privilege` surfaces to PostgREST as a 403, so the
-- attempt fails visibly instead of appearing to succeed.
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

    -- PT2C — a CHANGE of frame on one's own profile must be authorized.
    -- Entitlement is read from OLD because the block above has just pinned
    -- those columns; OLD is the persisted truth either way.
    IF OLD.user_id = auth.uid()
       AND NEW.profile_frame IS DISTINCT FROM OLD.profile_frame
       AND NOT public.may_equip_profile_frame(
             NEW.profile_frame, OLD.is_pro,
             OLD.pro_grant_kind, OLD.pro_grant_expires_at)
    THEN
      RAISE EXCEPTION 'profile_frame % requires Mogzy Premium', NEW.profile_frame
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

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
    RAISE EXCEPTION 'PT2C: protect_profile_premium_fields is missing after CREATE';
  END IF;
  IF _def NOT ILIKE '%auth.uid() IS NOT NULL AND%' THEN
    RAISE EXCEPTION 'PT2C: the service-role guard is missing -- service-role writes such as the stripe-webhook sync would be silently reverted';
  END IF;
  IF _def NOT ILIKE '%may_equip_profile_frame%' THEN
    RAISE EXCEPTION 'PT2C: the profile_frame authorization check is missing';
  END IF;
  -- The permanence fence: the check must be conditional on the value CHANGING.
  IF _def NOT ILIKE '%NEW.profile_frame IS DISTINCT FROM OLD.profile_frame%' THEN
    RAISE EXCEPTION 'PT2C: the frame check is not gated on a change -- an already-stored frame would be re-authorized on every unrelated save';
  END IF;
  -- ... and it must never clamp the stored value, which is the PT1.13B bug.
  IF _def ILIKE '%NEW.profile_frame := %' THEN
    RAISE EXCEPTION 'PT2C: profile_frame is being overwritten by the trigger -- a legitimately equipped frame would be destroyed';
  END IF;

  -- Carry forward every protection PT1.4, PT1.5 and ADM2 Phase A established.
  FOREACH _col IN ARRAY ARRAY[
    'is_pro', 'diamonds', 'boost_credits', 'elo_shields', 'reveals', 'rewinds',
    'is_bot', 'is_disabled', 'is_flagged_underage', 'admin_notes', 'ads_enabled',
    'active_boost_until',
    'pro_grant_kind', 'pro_grant_expires_at', 'pro_grant_reason',
    'pro_grant_granted_at', 'pro_grant_granted_by',
    'pro_offer', 'pro_offer_acquired_at', 'pro_offer_price_id',
    'stripe_customer_id', 'stripe_subscription_id', 'stripe_price_id',
    'stripe_billing_interval', 'stripe_subscription_status',
    'stripe_current_period_end'
  ] LOOP
    IF _def NOT ILIKE '%NEW.' || _col || ' := OLD.' || _col || '%' THEN
      RAISE EXCEPTION 'PT2C: % protection is missing from protect_profile_premium_fields', _col;
    END IF;
  END LOOP;
END
$assert_protect$;

-- The decision must compose the two independent sources, not re-implement
-- either. If a future edit inlines an is_pro read here, this aborts.
DO $assert_decision$
DECLARE
  _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'may_equip_profile_frame';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'PT2C: may_equip_profile_frame is missing after CREATE';
  END IF;
  IF _def NOT ILIKE '%global_premium_access()%' THEN
    RAISE EXCEPTION 'PT2C: Global Premium Access is not consulted -- a Free user would be refused during an open window';
  END IF;
  IF _def NOT ILIKE '%pro_entitlement_is_effective%' THEN
    RAISE EXCEPTION 'PT2C: per-account entitlement is not consulted through the canonical rule';
  END IF;
END
$assert_decision$;
