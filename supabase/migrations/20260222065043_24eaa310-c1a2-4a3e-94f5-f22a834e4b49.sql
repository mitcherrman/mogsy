
-- App settings table for admin toggles
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "Settings are publicly readable"
ON public.app_settings FOR SELECT USING (true);

-- Only admins can modify
CREATE POLICY "Admins can update settings"
ON public.app_settings FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert settings"
ON public.app_settings FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed the default setting
INSERT INTO public.app_settings (key, value) VALUES ('require_auth', '{"enabled": true}'::jsonb);
