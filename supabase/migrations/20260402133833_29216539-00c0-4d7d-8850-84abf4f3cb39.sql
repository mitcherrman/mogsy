INSERT INTO public.app_settings (key, value)
VALUES ('nav_tab_mode', '{"mode": "play"}'::jsonb)
ON CONFLICT (key) DO NOTHING;