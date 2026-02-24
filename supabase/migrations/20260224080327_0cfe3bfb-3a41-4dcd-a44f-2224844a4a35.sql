
-- Add ads_enabled column to profiles (default true = ads shown)
ALTER TABLE public.profiles ADD COLUMN ads_enabled boolean DEFAULT true;

-- Add global_ads_enabled app setting
INSERT INTO public.app_settings (key, value)
VALUES ('global_ads_enabled', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
