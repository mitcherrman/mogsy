DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = true) AS
  SELECT id, user_id, display_name, avatar_url, age, location,
         status_message, socials, is_pro, profile_frame, custom_theme,
         is_anonymous, created_at, updated_at
  FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;