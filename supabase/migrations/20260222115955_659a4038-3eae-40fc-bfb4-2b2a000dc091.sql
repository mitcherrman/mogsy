-- Recreate public_profiles view with security_invoker = true to enforce RLS of querying user
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles 
WITH (security_invoker = true)
AS
SELECT 
  id, user_id, display_name, avatar_url, age, location, 
  status_message, socials, is_pro, profile_frame, custom_theme,
  active_boost_until, is_bot, is_anonymous, created_at, updated_at
FROM public.profiles;