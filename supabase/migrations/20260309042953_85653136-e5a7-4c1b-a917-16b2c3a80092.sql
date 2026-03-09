
-- User blocks table
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(blocker_profile_id, blocked_profile_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks" ON public.user_blocks
FOR SELECT TO authenticated USING (is_profile_owner(blocker_profile_id));

CREATE POLICY "Users can insert own blocks" ON public.user_blocks
FOR INSERT TO authenticated WITH CHECK (is_profile_owner(blocker_profile_id));

CREATE POLICY "Users can delete own blocks" ON public.user_blocks
FOR DELETE TO authenticated USING (is_profile_owner(blocker_profile_id));

CREATE POLICY "Admins can manage all blocks" ON public.user_blocks
FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- User reports table
CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'inappropriate',
  details text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own reports" ON public.user_reports
FOR INSERT TO authenticated WITH CHECK (is_profile_owner(reporter_profile_id));

CREATE POLICY "Users can view own reports" ON public.user_reports
FOR SELECT TO authenticated USING (is_profile_owner(reporter_profile_id));

CREATE POLICY "Admins can manage all reports" ON public.user_reports
FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Tutorial tips table
CREATE TABLE IF NOT EXISTS public.tutorial_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_route text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  target_selector text,
  position text NOT NULL DEFAULT 'bottom',
  sort_order integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tutorial_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tips are publicly readable" ON public.tutorial_tips
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage tips" ON public.tutorial_tips
FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Track which tips users have dismissed
CREATE TABLE IF NOT EXISTS public.tutorial_tip_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tip_id uuid NOT NULL REFERENCES public.tutorial_tips(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, tip_id)
);

ALTER TABLE public.tutorial_tip_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dismissals" ON public.tutorial_tip_dismissals
FOR SELECT TO authenticated USING (is_profile_owner(profile_id));

CREATE POLICY "Users can insert own dismissals" ON public.tutorial_tip_dismissals
FOR INSERT TO authenticated WITH CHECK (is_profile_owner(profile_id));
