
CREATE TABLE public.ad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid REFERENCES public.ad_creatives(id) ON DELETE SET NULL,
  event_type text NOT NULL DEFAULT 'impression',
  placement text NOT NULL DEFAULT 'swipe',
  ad_mode text NOT NULL DEFAULT 'popup',
  ad_source text NOT NULL DEFAULT 'custom',
  profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_events_created_at ON public.ad_events (created_at);
CREATE INDEX idx_ad_events_creative_id ON public.ad_events (creative_id);
CREATE INDEX idx_ad_events_event_type ON public.ad_events (event_type);

ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own events
CREATE POLICY "Users can insert ad events" ON public.ad_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Admins can read all events
CREATE POLICY "Admins can read ad events" ON public.ad_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
