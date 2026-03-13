
-- Create storage bucket for animation assets (images, gifs, sounds)
INSERT INTO storage.buckets (id, name, public) VALUES ('animation-assets', 'animation-assets', true);

-- Allow admins to upload/delete animation assets
CREATE POLICY "Admins can upload animation assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'animation-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update animation assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'animation-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete animation assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'animation-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Animation assets are publicly readable"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'animation-assets');

-- Create table for custom animations
CREATE TABLE public.custom_animations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '✨',
  image_url text,
  sound_url text,
  duration_ms integer NOT NULL DEFAULT 2000,
  sound_delay_ms integer NOT NULL DEFAULT 0,
  sound_duration_ms integer,
  effects jsonb NOT NULL DEFAULT '{"fadeIn": true, "fadeOut": true, "scale": false, "shake": false, "blur": false, "rotate": false, "slideUp": false, "slideDown": false}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  pro_only boolean NOT NULL DEFAULT false,
  contexts text[] NOT NULL DEFAULT '{swipe,elocheck}'::text[],
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_animations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage custom animations"
ON public.custom_animations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Custom animations are publicly readable"
ON public.custom_animations FOR SELECT TO public
USING (is_enabled = true);
