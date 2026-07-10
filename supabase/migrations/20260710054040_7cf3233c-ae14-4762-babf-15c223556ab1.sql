CREATE TABLE public.broadcast_live_state (
  id text PRIMARY KEY DEFAULT 'live',
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broadcast_live_state_singleton CHECK (id = 'live')
);

GRANT SELECT ON public.broadcast_live_state TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_live_state TO authenticated;
GRANT ALL ON public.broadcast_live_state TO service_role;

ALTER TABLE public.broadcast_live_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read live broadcast state"
ON public.broadcast_live_state FOR SELECT
USING (true);

CREATE POLICY "Admins can insert live broadcast state"
ON public.broadcast_live_state FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update live broadcast state"
ON public.broadcast_live_state FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete live broadcast state"
ON public.broadcast_live_state FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.broadcast_live_state REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_live_state;