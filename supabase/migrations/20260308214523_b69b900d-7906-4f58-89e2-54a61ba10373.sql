
CREATE TABLE public.ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  brand_name text NOT NULL DEFAULT '',
  cta_text text NOT NULL DEFAULT 'Learn More',
  destination_url text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT true,
  placement text NOT NULL DEFAULT 'swipe',
  view_duration_seconds integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ad creatives" ON public.ad_creatives
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Enabled ad creatives are readable by authenticated" ON public.ad_creatives
  FOR SELECT TO authenticated
  USING (is_enabled = true);
