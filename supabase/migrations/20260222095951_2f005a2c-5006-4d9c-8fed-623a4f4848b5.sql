
-- Fix the security definer view issue by dropping it and using SECURITY INVOKER
DROP VIEW IF EXISTS public.public_profiles;

-- Recreate without security definer (default is SECURITY INVOKER in PG15+)
CREATE VIEW public.public_profiles 
WITH (security_invoker = true)
AS
SELECT 
  id, user_id, display_name, avatar_url, age, location, 
  status_message, socials, is_pro, boost_credits, 
  active_boost_until, profile_frame, custom_theme, 
  elo_shields, reveals, rewinds, diamonds,
  is_bot, is_anonymous, created_at, updated_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
