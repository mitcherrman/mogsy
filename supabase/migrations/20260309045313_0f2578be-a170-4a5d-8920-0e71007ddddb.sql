
-- Feedback table
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general',
  page_reference text DEFAULT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  admin_notes text DEFAULT '',
  is_archived boolean NOT NULL DEFAULT false,
  upvotes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback"
ON public.feedback FOR INSERT TO authenticated
WITH CHECK (is_profile_owner(profile_id));

-- Users can view own feedback
CREATE POLICY "Users can view own feedback"
ON public.feedback FOR SELECT TO authenticated
USING (is_profile_owner(profile_id));

-- Admins can manage all feedback
CREATE POLICY "Admins can manage all feedback"
ON public.feedback FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Feedback upvotes tracking
CREATE TABLE public.feedback_upvotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feedback_id, profile_id)
);

ALTER TABLE public.feedback_upvotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own upvotes"
ON public.feedback_upvotes FOR INSERT TO authenticated
WITH CHECK (is_profile_owner(profile_id));

CREATE POLICY "Users can delete own upvotes"
ON public.feedback_upvotes FOR DELETE TO authenticated
USING (is_profile_owner(profile_id));

CREATE POLICY "Users can view upvotes"
ON public.feedback_upvotes FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage upvotes"
ON public.feedback_upvotes FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Feedback settings in app_settings
INSERT INTO public.app_settings (key, value) VALUES 
  ('feedback_config', '{"is_enabled": true, "categories": ["Bug Report", "Feature Request", "UI/UX", "Content", "General"], "page_options": ["Home", "Play", "Swipe", "Profile", "Leaderboard", "Shop", "Settings", "Multiplayer", "Aura Check", "Other"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;
