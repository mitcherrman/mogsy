
-- Add animation preference fields to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS swipe_animation text DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS elocheck_animation text DEFAULT 'default';

-- Create animation usage tracking table
CREATE TABLE public.animation_usage_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  animation_id text NOT NULL,
  context text NOT NULL DEFAULT 'swipe', -- 'swipe' or 'elocheck'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for analytics queries
CREATE INDEX idx_animation_usage_animation ON public.animation_usage_logs(animation_id);
CREATE INDEX idx_animation_usage_context ON public.animation_usage_logs(context);
CREATE INDEX idx_animation_usage_created ON public.animation_usage_logs(created_at);

-- RLS
ALTER TABLE public.animation_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own animation logs"
  ON public.animation_usage_logs FOR INSERT
  WITH CHECK (is_profile_owner(profile_id));

CREATE POLICY "Admins can read all animation logs"
  ON public.animation_usage_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
