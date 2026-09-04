-- PT1.4 (part 2) — the invite path becomes a promo grant
--
-- PROBLEM
-- -------
-- 20260903120000 established the authority contract: `profiles.is_pro` is
-- Stripe-derived state ONLY. One executable writer still violated it:
-- `public.redeem_invite_link` (20260402173928) does
--
--     is_pro = CASE WHEN COALESCE(_invite.grant_pro, false) THEN true ELSE is_pro END
--
-- so an invite-granted Pro was still revoked by the next Stripe reconciliation
-- (a Shop visit is enough). Same bug, last writer.
--
-- HISTORICAL SEMANTICS PRESERVED
-- ------------------------------
-- `invite_links` has no Pro-duration column. Its `expires_at` bounds how long
-- the *code* may be redeemed, not how long the granted Pro lasts, and nothing
-- ever expired an invite-granted Pro. So `grant_pro = true` has always meant
-- PERMANENT Pro, and it is preserved here as a promo grant with a NULL expiry.
-- No expiration is invented merely because the schema now supports one.
--
-- `promo` is the accurate already-supported kind: an invite link is a
-- promotional distribution channel, not a playtest comp or a purchased gift.
--
-- UNCHANGED
-- ---------
-- The function keeps its signature, its SECURITY DEFINER authorization model
-- (`auth.uid()` must be non-null and equal `_user_id`), its EXECUTE grants
-- (revoked from anon/public by 20260514042724), every failure reason string,
-- and its return contract — including `'grant_pro'`, which callers and the
-- generated types both declare. Only the *storage* of the Pro grant changes.
--
-- NOT A WRITER: `custom_links.grant_pro` is admin-editable but has no applier
-- anywhere. `src/pages/CustomLink.tsx` hardcodes `grant_pro: false` into the
-- client config and no server path reads the column. It is dead configuration,
-- not an executable write, so there is nothing to convert.

-- ---------------------------------------------------------------------------
-- 1. Shared write path for automatic (non-admin) grant sources
-- ---------------------------------------------------------------------------
-- Encapsulates the grant write plus one collision rule, so automatic sources
-- (invite promo today, and any future one) do not each re-derive it.
--
-- Collision rule: NEVER WEAKEN. The single grant slot holds one grant, so an
-- automatic source may only overwrite a grant it is at least as strong as.
-- Concretely, with a NULL (permanent) expiry the incoming grant is stronger
-- than any expiring grant and equal to a permanent one — so the only case it
-- must not touch is an existing still-valid permanent grant, where overwriting
-- would change nothing about access while destroying the reason/granted_by
-- provenance of, say, an admin playtester comp.
--
-- This is deliberately the same shape as redeem-gift's stacking guard.
--
-- `admin_set_pro_grant` does NOT route through this: an admin explicitly
-- setting or revoking a grant is an override and must be allowed to shorten
-- one. That is an authorization difference, not duplicated composition logic —
-- neither path composes effective Pro, which stays solely in
-- `pro_entitlement_is_effective`.
CREATE OR REPLACE FUNCTION public.apply_pro_grant(
  _profile_id uuid,
  _kind text,
  _expires_at timestamptz,
  _reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _existing_kind    text;
  _existing_expires timestamptz;
BEGIN
  IF _kind IS NULL OR _kind NOT IN ('manual', 'playtest', 'promo', 'gift') THEN
    RAISE EXCEPTION 'Unknown grant kind: %', _kind;
  END IF;

  SELECT p.pro_grant_kind, p.pro_grant_expires_at
    INTO _existing_kind, _existing_expires
  FROM public.profiles p
  WHERE p.id = _profile_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Do not overwrite a stronger or equally strong existing grant.
  IF public.pro_grant_is_valid(_existing_kind, _existing_expires) THEN
    IF _existing_expires IS NULL THEN
      -- Existing grant never expires: nothing an automatic source adds.
      RETURN false;
    END IF;
    IF _expires_at IS NOT NULL AND _expires_at <= _existing_expires THEN
      -- Incoming grant would end no later than the current one.
      RETURN false;
    END IF;
  END IF;

  UPDATE public.profiles SET
    pro_grant_kind       = _kind,
    pro_grant_expires_at = _expires_at,
    pro_grant_reason     = _reason,
    pro_grant_granted_at = now(),
    pro_grant_granted_by = NULL   -- automatic source, no granting admin
  WHERE id = _profile_id;

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_pro_grant(uuid, text, timestamptz, text) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. redeem_invite_link — identical except for where Pro is stored
-- ---------------------------------------------------------------------------
-- Reproduced verbatim from 20260402173928, the most recent definition and the
-- rollback text, with exactly two changes, both marked PT1.4:
--   * the profiles UPDATE no longer touches is_pro;
--   * a promo grant is applied afterwards when the invite grants Pro.
CREATE OR REPLACE FUNCTION public.redeem_invite_link(
  _code text,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite invite_links%ROWTYPE;
  _profile_id uuid;
  _updates jsonb := '{}'::jsonb;
  _settings record;
  _referrer_profile record;
BEGIN
  -- Verify caller is authenticated and matches the user_id
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() != _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Find the invite link
  SELECT * INTO _invite FROM invite_links
  WHERE code = _code AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_code');
  END IF;

  -- Check expiry
  IF _invite.expires_at IS NOT NULL AND _invite.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'expired');
  END IF;

  -- Check max uses
  IF _invite.max_uses IS NOT NULL AND COALESCE(_invite.times_used, 0) >= _invite.max_uses THEN
    RETURN jsonb_build_object('success', false, 'reason', 'max_uses_reached');
  END IF;

  -- Check if already redeemed by this user
  IF EXISTS (SELECT 1 FROM invite_redemptions WHERE invite_link_id = _invite.id AND redeemed_by_user_id = _user_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_redeemed');
  END IF;

  -- Get the user's profile
  SELECT id INTO _profile_id FROM profiles WHERE user_id = _user_id;
  IF _profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_profile');
  END IF;

  -- Apply grants to profile (bypasses protect_premium_fields since we're SECURITY DEFINER)
  -- PT1.4: is_pro is Stripe-owned and is no longer written here. The Pro half
  -- of an invite is applied below as a promo grant.
  UPDATE profiles SET
    diamonds = diamonds + COALESCE(_invite.grant_diamonds, 0),
    boost_credits = boost_credits + COALESCE(_invite.grant_boost_credits, 0),
    elo_shields = elo_shields + COALESCE(_invite.grant_elo_shields, 0),
    reveals = reveals + COALESCE(_invite.grant_reveals, 0),
    rewinds = rewinds + COALESCE(_invite.grant_rewinds, 0),
    preferred_categories = CASE
      WHEN _invite.recommended_categories IS NOT NULL AND array_length(_invite.recommended_categories, 1) > 0
      THEN _invite.recommended_categories
      ELSE preferred_categories
    END
  WHERE id = _profile_id;

  -- PT1.4: invite Pro is a permanent promo grant (NULL expiry), matching the
  -- historical behaviour of setting is_pro true and never expiring it. It
  -- survives Stripe reconciliation, and it never shortens a stronger grant.
  IF COALESCE(_invite.grant_pro, false) THEN
    PERFORM public.apply_pro_grant(
      _profile_id,
      'promo',
      NULL,
      'Invite link' || COALESCE(': ' || _invite.label, '')
    );
  END IF;

  -- Grant admin role if specified
  IF COALESCE(_invite.grant_admin, false) THEN
    INSERT INTO user_roles (user_id, role)
    VALUES (_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Grant moderator role if specified
  IF COALESCE(_invite.grant_moderator, false) THEN
    INSERT INTO user_roles (user_id, role)
    VALUES (_user_id, 'moderator')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Record redemption
  INSERT INTO invite_redemptions (invite_link_id, redeemed_by_user_id, referrer_user_id)
  VALUES (
    _invite.id,
    _user_id,
    CASE WHEN _invite.type = 'user' THEN _invite.created_by_user_id ELSE NULL END
  );

  -- Increment times_used
  UPDATE invite_links SET times_used = COALESCE(times_used, 0) + 1 WHERE id = _invite.id;

  -- Handle referrer rewards for user-type invites
  IF _invite.type = 'user' THEN
    SELECT * INTO _settings FROM user_invite_settings LIMIT 1;
    IF _settings IS NOT NULL AND _settings.is_enabled THEN
      SELECT id, diamonds, boost_credits INTO _referrer_profile
      FROM profiles WHERE user_id = _invite.created_by_user_id;
      IF _referrer_profile.id IS NOT NULL THEN
        UPDATE profiles SET
          diamonds = COALESCE(diamonds, 0) + COALESCE(_settings.referrer_diamonds, 0),
          boost_credits = COALESCE(boost_credits, 0) + COALESCE(_settings.referrer_boost_credits, 0)
        WHERE id = _referrer_profile.id;
      END IF;
    END IF;
  END IF;

  -- PT1.4: return contract unchanged, including 'grant_pro'. Auth.tsx and the
  -- generated types both declare it; it reports what the INVITE grants, which
  -- is still true even though the storage moved.
  RETURN jsonb_build_object(
    'success', true,
    'grant_admin', COALESCE(_invite.grant_admin, false),
    'grant_moderator', COALESCE(_invite.grant_moderator, false),
    'grant_pro', COALESCE(_invite.grant_pro, false)
  );
END;
$$;

-- The function is recreated, so re-apply the narrowing from 20260514042724.
REVOKE EXECUTE ON FUNCTION public.redeem_invite_link(text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.redeem_invite_link(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Assertions
-- ---------------------------------------------------------------------------
DO $assert_invite$
DECLARE
  _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'redeem_invite_link';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'PT1.4: redeem_invite_link is missing after CREATE';
  END IF;

  -- The whole point: no executable write to is_pro remains on this path.
  IF _def ~* '\mis_pro\M\s*=' THEN
    RAISE EXCEPTION 'PT1.4: redeem_invite_link still writes is_pro -- Stripe reconciliation would revoke invite Pro';
  END IF;

  -- The authorization model must survive the rewrite.
  IF _def NOT ILIKE '%auth.uid() != _user_id%' THEN
    RAISE EXCEPTION 'PT1.4: redeem_invite_link lost its caller-identity check';
  END IF;
  IF _def NOT ILIKE '%RAISE EXCEPTION ''Not authenticated''%' THEN
    RAISE EXCEPTION 'PT1.4: redeem_invite_link lost its authentication check';
  END IF;

  -- The return contract must survive the rewrite.
  IF _def NOT ILIKE '%''grant_pro'', COALESCE(_invite.grant_pro, false)%' THEN
    RAISE EXCEPTION 'PT1.4: redeem_invite_link changed its return contract';
  END IF;

  -- And it must actually apply the promo grant.
  IF _def NOT ILIKE '%apply_pro_grant%' THEN
    RAISE EXCEPTION 'PT1.4: redeem_invite_link no longer applies a promo grant';
  END IF;
END
$assert_invite$;
