-- Lightweight funnel event tracking for the Mogsy LoL guest quiz funnel.
-- Mirrors the ad_events pattern: open inserts, admin-only reads, silent-fail client.
CREATE TABLE public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  route text,
  viewport_w integer,
  viewport_h integer,
  is_guest boolean,
  source text NOT NULL DEFAULT 'lol_funnel',
  user_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_funnel_events_created_at ON public.funnel_events (created_at);
CREATE INDEX idx_funnel_events_event_name ON public.funnel_events (event_name);

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- Landing events can fire before the anonymous session exists, so allow anon inserts too.
CREATE POLICY "Anyone can insert funnel events" ON public.funnel_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read funnel events" ON public.funnel_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
