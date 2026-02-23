
-- Invite links system
CREATE TABLE public.invite_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'admin' CHECK (type IN ('admin', 'user')),
  label TEXT,
  created_by_user_id UUID NOT NULL,
  -- Rewards on signup
  grant_admin BOOLEAN DEFAULT false,
  grant_pro BOOLEAN DEFAULT false,
  grant_diamonds INTEGER DEFAULT 0,
  grant_boost_credits INTEGER DEFAULT 0,
  grant_elo_shields INTEGER DEFAULT 0,
  grant_reveals INTEGER DEFAULT 0,
  grant_rewinds INTEGER DEFAULT 0,
  -- Category/subcategory recommendations
  recommended_categories TEXT[] DEFAULT '{}',
  recommended_league_ids UUID[] DEFAULT '{}',
  -- Limits & tracking
  max_uses INTEGER,
  times_used INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_links ENABLE ROW LEVEL SECURITY;

-- Admins can manage invite links
CREATE POLICY "Admins can manage invite links"
ON public.invite_links
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Anyone can read active invite links (for redemption)
CREATE POLICY "Anyone can read active invite links"
ON public.invite_links
FOR SELECT
USING (is_active = true);

-- Track who redeemed what
CREATE TABLE public.invite_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invite_link_id UUID NOT NULL REFERENCES public.invite_links(id) ON DELETE CASCADE,
  redeemed_by_user_id UUID NOT NULL,
  referrer_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view redemptions"
ON public.invite_redemptions
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert redemptions"
ON public.invite_redemptions
FOR INSERT
WITH CHECK (auth.uid() = redeemed_by_user_id);

-- User invite link settings (admin toggles for what users can reward)
CREATE TABLE public.user_invite_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reward_diamonds INTEGER DEFAULT 5,
  reward_boost_credits INTEGER DEFAULT 0,
  reward_elo_bonus INTEGER DEFAULT 0,
  referrer_diamonds INTEGER DEFAULT 10,
  referrer_boost_credits INTEGER DEFAULT 1,
  is_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_invite_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read invite settings"
ON public.user_invite_settings
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage invite settings"
ON public.user_invite_settings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default settings
INSERT INTO public.user_invite_settings (reward_diamonds, reward_boost_credits, reward_elo_bonus, referrer_diamonds, referrer_boost_credits, is_enabled)
VALUES (5, 0, 0, 10, 1, true);
