-- PT2E — PROFILE THEMES: SCOPED TO THE PROFILE, AND AUTHORIZED ON THE SERVER.
--
-- WHAT CHANGED ABOVE THIS MIGRATION
-- ---------------------------------
-- `profiles.custom_theme` used to be a SITEWIDE theme. The frontend provider
-- wrote `theme-<custom_theme>` onto <html>, so a user's chosen theme recoloured
-- every surface whose path was not in the League section — the Academy
-- entrance, /welcome, /profile, the Ranked tutorial onboarding, the blog and
-- the admin console — while Leaguecraft, Ranked, Quiz, Combat Lab, Meta Reflex
-- and the Archives excluded themselves by path because they own `theme-lol`.
-- That is legacy Mogsy behaviour. The application-level half is retired in the
-- same change as this migration: `custom_theme` now means the visual theme of
-- the user's PROFILE, and nothing reads it to theme the document.
--
-- Two server-side consequences follow, and they are the whole of this file.
--
--
-- 1. A PROFILE THEME MUST BE VISIBLE ON A PROFILE
-- -----------------------------------------------
-- `get_league_profiles(uuid[])` is the SECURITY DEFINER RPC serving cross-user
-- League profile reads, and its fixed RETURNS TABLE list is the safety
-- boundary. `custom_theme` was not in it, so `/user/:profileId` — which has
-- rendered the full theme since it was written — has been receiving NULL for
-- every visitor in production and falling back to `default`. A cosmetic nobody
-- else can see is not a cosmetic.
--
-- WHY IT IS SAFE. `profile_frame` is already published in this contract and is
-- the same kind of value: the id of a chosen cosmetic, drawn from a fixed
-- catalogue, meaningful only as decoration. `custom_theme` is strictly no more
-- sensitive. It carries no personal data and reveals nothing the profile page
-- does not already show. `user_id` remains ABSENT, for the reasons the original
-- RPC migration records; nothing about that decision is touched here.
--
-- `src/pages/UserProfile.league-isolation.test.tsx` classed `custom_theme`
-- alongside `age`, `location`, `status_message` and `socials` as a legacy
-- DATING field a League profile must never read. That was right about the
-- value's old meaning and is updated in this change: under the sitewide system
-- the column was not profile decoration at all. The other four fields keep
-- their exclusion exactly as written.
--
--
-- 2. CHOOSING A PREMIUM THEME MUST BE AUTHORIZED
-- ----------------------------------------------
-- The theme was gated in exactly one place: the picker disabled locked entries
-- and the provider then wrote the chosen id straight through with
-- `profiles.update({ custom_theme: id })`. Nothing on the server agreed, so a
-- signed-in Free user could skip the UI with a crafted
-- `profiles.update({ custom_theme: 'royal' })` and take a paid cosmetic. PT2C
-- closed this for `profile_frame` and named themes as the next surface of the
-- same shape. This is that.
--
-- THE CHANGE IS AUTHORIZED; THE STORED VALUE NEVER IS. The check fires only
-- when `NEW.custom_theme IS DISTINCT FROM OLD.custom_theme`. A row already
-- holding `royal` keeps `royal` through every later save of a bio, a frame or
-- an avatar, whatever the account's entitlement has since become — the approved
-- lapse policy: keep what you chose, lose the ability to switch, resubscribe to
-- choose again. The Profile page's save payload always re-sends
-- `custom_theme: activeThemeId` seeded from the row, so treating a resend as an
-- acquisition would have broken every unrelated save a lapsed member makes.
-- Nothing assigns to NEW.custom_theme, and an assertion below aborts if anyone
-- ever adds such a clamp — that is the PT1.13B bug, which destroyed a stored
-- cosmetic by re-evaluating entitlement against it on every write.
--
-- THE FREE LIST IS STATIC. `app_settings.theme_config.free_themes` let an admin
-- move a theme between tiers at runtime, and the shipped default disagreed with
-- the catalogue's own flags (it listed neither `light` nor `dark` as free), so
-- the product could show a user a lock the other half did not believe in. That
-- dynamism existed to tune a sitewide cosmetic. Retiring the sitewide system
-- retires the reason for it, so this function restates
-- `FREE_PROFILE_THEMES` from src/lib/profile-themes.ts literally. A settings
-- row can no longer widen what is free, which is also the fail-closed choice.
--
-- ONBOARDING NO LONGER GRANTS A THEME. The old fourth onboarding step offered
-- every new account "1 premium theme to try for free" and persisted it in the
-- statement that set `onboarding_completed`. Had it survived, this migration
-- would have needed a once-per-account carve-out keyed on that flag's
-- transition, plus a clamp stopping self-service from un-completing its own
-- onboarding to re-roll. It did not survive: the step is removed, the write is
-- gone, and so is all of that machinery. Its entire "entitlement" was a
-- localStorage key any visitor could write, so it was never a grant a server
-- could have honoured anyway.
--
-- The decision composes rather than redefines:
--   global_premium_access() OR pro_entitlement_is_effective(...)
-- Entitlement is read from OLD — the persisted truth, and unspoofable, because
-- the clamp block above it has just pinned those columns. Closing the global
-- window still writes nothing and reverts nothing. Themes are refused, not
-- clamped: `insufficient_privilege`, a 403 through PostgREST, so a crafted
-- write fails visibly instead of appearing to succeed. Scoped to self-service
-- writes (`OLD.user_id = auth.uid()`), leaving admin bot rows, the admin bypass
-- and service-role writes untouched. No policy is created, dropped or widened,
-- and no Stripe, subscription, offer or grant column is read or written.
--
-- NOTE ON app_settings. `sitewide_themes_enabled` and `theme_config` are left
-- in place. Every code dependency on them is gone, so they are inert rows;
-- deleting production settings buys nothing and is not reversible from here.

-- ---------------------------------------------------------------------------
-- 1. Which profile themes cost money
-- ---------------------------------------------------------------------------
-- Mirrors FREE_PROFILE_THEMES in src/lib/profile-themes.ts. Fail-closed on
-- unknown text: an id that is not a shipped theme is Premium, so an invented
-- string is never the cheap way past the gate, and an arbitrary value cannot be
-- written into a column several surfaces render.
--
-- NULL and empty are the absent theme and are free, so profile creation and
-- clearing are unaffected.
CREATE OR REPLACE FUNCTION public.profile_theme_requires_premium(_theme text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT _theme IS NOT NULL
     AND btrim(_theme) <> ''
     AND btrim(lower(_theme)) NOT IN ('default', 'light', 'dark', 'midnight', 'forest');
$function$;

-- ---------------------------------------------------------------------------
-- 2. The decision
-- ---------------------------------------------------------------------------
-- Takes the entitlement columns explicitly so it is testable in isolation and
-- so the trigger can pass OLD — the persisted truth — rather than a NEW that a
-- caller supplied. Identical in shape to `may_equip_profile_frame` (PT2C), and
-- built from the same two composed terms rather than a second copy of either.
CREATE OR REPLACE FUNCTION public.may_equip_profile_theme(
  _theme            text,
  _stripe_pro       boolean,
  _grant_kind       text,
  _grant_expires_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT NOT public.profile_theme_requires_premium(_theme)
      OR public.global_premium_access()
      OR public.pro_entitlement_is_effective(_stripe_pro, _grant_kind,
                                             _grant_expires_at);
$function$;

-- ---------------------------------------------------------------------------
-- 3. Enforce it on the existing BEFORE UPDATE trigger
-- ---------------------------------------------------------------------------
-- Extends `protect_profile_premium_fields` rather than adding a second trigger,
-- for PT2C's reason: one function already owns "what a self-service update may
-- not do to a profiles row", and splitting that across two triggers would make
-- the firing order part of the security argument. PT2C's frame rule is carried
-- through verbatim and an assertion below aborts if this replacement ever
-- drops it.
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

    -- PT2E — and so must a CHANGE of profile theme, on the same terms.
    IF OLD.user_id = auth.uid()
       AND NEW.custom_theme IS DISTINCT FROM OLD.custom_theme
       AND NOT public.may_equip_profile_theme(
             NEW.custom_theme, OLD.is_pro,
             OLD.pro_grant_kind, OLD.pro_grant_expires_at)
    THEN
      RAISE EXCEPTION 'custom_theme % requires Mogzy Premium', NEW.custom_theme
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Publish custom_theme on the League profile contract
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE cannot change a function's return type, so this is a
-- DROP + CREATE. Inside the BEGIN/COMMIT block that is atomic — no caller ever
-- observes the function missing. The REVOKE/GRANT pair must be re-applied
-- because a freshly created function inherits this project's permissive
-- ALTER DEFAULT PRIVILEGES. The body is ADM2 Phase A's, with one column added
-- and everything else — the auth.uid() gate, the block filter, the LIMIT —
-- character for character the same.
DROP FUNCTION IF EXISTS public.get_league_profiles(uuid[]);

CREATE FUNCTION public.get_league_profiles(_profile_ids uuid[])
RETURNS TABLE (
  id            uuid,
  display_name  text,
  avatar_url    text,
  profile_frame text,
  is_pro        boolean,
  is_bot        boolean,
  is_anonymous  boolean,
  created_at    timestamptz,
  is_disabled   boolean,
  custom_theme  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id,
         p.display_name,
         p.avatar_url,
         p.profile_frame,
         p.is_pro,
         p.is_bot,
         p.is_anonymous,
         p.created_at,
         COALESCE(p.is_disabled, false),
         p.custom_theme
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id = ANY(_profile_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks b
      JOIN public.profiles me ON me.user_id = auth.uid()
      WHERE (b.blocker_profile_id = p.id  AND b.blocked_profile_id = me.id)
         OR (b.blocker_profile_id = me.id AND b.blocked_profile_id = p.id)
    )
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.get_league_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_league_profiles(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_league_profiles(uuid[]) IS
  'Authenticated cross-user League profile reads. Returns the approved League '
  'identity contract only: id, display_name, avatar_url, profile_frame, is_pro, '
  'is_bot, is_anonymous, created_at, is_disabled, custom_theme. user_id is '
  'deliberately ABSENT. custom_theme is the PROFILE theme (PT2E) and is '
  'published for the same reason profile_frame is: a chosen cosmetic from a '
  'fixed catalogue, rendered on the profile card.';

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
    RAISE EXCEPTION 'PT2E: protect_profile_premium_fields is missing after CREATE';
  END IF;
  IF _def NOT ILIKE '%auth.uid() IS NOT NULL AND%' THEN
    RAISE EXCEPTION 'PT2E: the service-role guard is missing -- service-role writes such as the stripe-webhook sync would be silently reverted';
  END IF;

  -- PT2E's own rule.
  IF _def NOT ILIKE '%may_equip_profile_theme%' THEN
    RAISE EXCEPTION 'PT2E: the custom_theme authorization check is missing';
  END IF;
  IF _def NOT ILIKE '%NEW.custom_theme IS DISTINCT FROM OLD.custom_theme%' THEN
    RAISE EXCEPTION 'PT2E: the theme check is not gated on a change -- an already-stored theme would be re-authorized on every unrelated save';
  END IF;
  IF _def ILIKE '%NEW.custom_theme := %' THEN
    RAISE EXCEPTION 'PT2E: custom_theme is being overwritten by the trigger -- a legitimately chosen theme would be destroyed';
  END IF;

  -- PT2C's rule must survive this replacement, on the same three terms.
  IF _def NOT ILIKE '%may_equip_profile_frame%' THEN
    RAISE EXCEPTION 'PT2E: PT2C profile_frame authorization was dropped by this replacement';
  END IF;
  IF _def NOT ILIKE '%NEW.profile_frame IS DISTINCT FROM OLD.profile_frame%' THEN
    RAISE EXCEPTION 'PT2E: the PT2C frame check is no longer gated on a change';
  END IF;
  IF _def ILIKE '%NEW.profile_frame := %' THEN
    RAISE EXCEPTION 'PT2E: profile_frame is being overwritten by the trigger';
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
      RAISE EXCEPTION 'PT2E: % protection is missing from protect_profile_premium_fields', _col;
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
  WHERE n.nspname = 'public' AND p.proname = 'may_equip_profile_theme';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'PT2E: may_equip_profile_theme is missing after CREATE';
  END IF;
  IF _def NOT ILIKE '%global_premium_access()%' THEN
    RAISE EXCEPTION 'PT2E: Global Premium Access is not consulted -- a Free user would be refused during an open window';
  END IF;
  IF _def NOT ILIKE '%pro_entitlement_is_effective%' THEN
    RAISE EXCEPTION 'PT2E: per-account entitlement is not consulted through the canonical rule';
  END IF;
END
$assert_decision$;

-- The League contract must have gained custom_theme and LOST nothing. The
-- column list is the safety boundary, so it is asserted by name.
DO $assert_contract$
DECLARE
  _cols text[];
  _col  text;
BEGIN
  SELECT p.proargnames INTO _cols
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_league_profiles';

  IF _cols IS NULL THEN
    RAISE EXCEPTION 'PT2E: get_league_profiles is missing after DROP + CREATE';
  END IF;
  FOREACH _col IN ARRAY ARRAY[
    'id', 'display_name', 'avatar_url', 'profile_frame', 'is_pro', 'is_bot',
    'is_anonymous', 'created_at', 'is_disabled', 'custom_theme'
  ] LOOP
    IF NOT (_col = ANY(_cols)) THEN
      RAISE EXCEPTION 'PT2E: get_league_profiles no longer returns %', _col;
    END IF;
  END LOOP;
  -- user_id stays out. The original RPC migration explains why at length.
  IF 'user_id' = ANY(_cols) THEN
    RAISE EXCEPTION 'PT2E: get_league_profiles must not publish user_id';
  END IF;
END
$assert_contract$;
