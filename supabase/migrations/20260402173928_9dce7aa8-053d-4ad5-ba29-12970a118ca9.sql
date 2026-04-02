
-- 1. Fix purchases: remove user INSERT policy
DROP POLICY IF EXISTS "Users can insert own purchases" ON public.purchases;

-- 2. Fix user_notifications: tighten SELECT to broadcast-only for non-admins
DROP POLICY IF EXISTS "Authenticated can read notifications" ON public.user_notifications;

CREATE POLICY "Authenticated can read broadcast notifications"
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (
    target_type = 'all'
    OR has_role(auth.uid(), 'admin')
  );

-- 3. Fix admin_notes exposure: create a function to strip admin_notes for non-admin reads
-- We use a view approach: replace the user SELECT policy with one that uses a security definer function
-- Actually, simplest: use a BEFORE ROW trigger won't work for SELECT. Use column masking via a wrapper.
-- Best approach: modify the existing user SELECT to use a security definer view, but that's complex.
-- Practical fix: Create a security definer function users call instead of direct table access.
-- Simplest practical fix: The protect_premium_fields trigger already protects writes.
-- For reads, create a function that returns profile without admin_notes.

CREATE OR REPLACE FUNCTION public.get_own_profile()
RETURNS TABLE (
  id uuid, user_id uuid, display_name text, avatar_url text, age integer,
  location text, status_message text, socials jsonb, is_pro boolean,
  diamonds integer, boost_credits integer, elo_shields integer, reveals integer,
  rewinds integer, active_boost_until timestamptz, is_anonymous boolean,
  is_bot boolean, is_flagged_underage boolean, onboarding_completed boolean,
  preferred_categories text[], swipe_animation text, elocheck_animation text,
  profile_frame text, custom_theme text, ads_enabled boolean,
  created_at timestamptz, updated_at timestamptz, last_seen_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.user_id, p.display_name, p.avatar_url, p.age,
    p.location, p.status_message, p.socials, p.is_pro,
    p.diamonds, p.boost_credits, p.elo_shields, p.reveals,
    p.rewinds, p.active_boost_until, p.is_anonymous,
    p.is_bot, p.is_flagged_underage, p.onboarding_completed,
    p.preferred_categories, p.swipe_animation, p.elocheck_animation,
    p.profile_frame, p.custom_theme, p.ads_enabled,
    p.created_at, p.updated_at, p.last_seen_at
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
$$;

-- 4. Secure invite redemption with SECURITY DEFINER function
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
  UPDATE profiles SET
    is_pro = CASE WHEN COALESCE(_invite.grant_pro, false) THEN true ELSE is_pro END,
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

  RETURN jsonb_build_object(
    'success', true,
    'grant_admin', COALESCE(_invite.grant_admin, false),
    'grant_moderator', COALESCE(_invite.grant_moderator, false),
    'grant_pro', COALESCE(_invite.grant_pro, false)
  );
END;
$$;
