-- Public read-only mirror of the live quiz broadcast scene, so an
-- unauthenticated OBS Browser Source can render it. Contains ONLY the
-- broadcast scene snapshot (current question, phase, visual config) —
-- no user data, no admin state. Writes are admin-only.

CREATE TABLE public.broadcast_live_state (
  id text PRIMARY KEY DEFAULT 'live',
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broadcast_live_state_singleton CHECK (id = 'live')
);

ALTER TABLE public.broadcast_live_state ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon / OBS) may read the current broadcast scene.
CREATE POLICY "Public can read live broadcast state"
ON public.broadcast_live_state FOR SELECT
USING (true);

-- Only admins (has_role also grants master_admin) may publish.
CREATE POLICY "Admins can insert live broadcast state"
ON public.broadcast_live_state FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update live broadcast state"
ON public.broadcast_live_state FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete live broadcast state"
ON public.broadcast_live_state FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Realtime so the public viewer updates instantly on phase changes.
ALTER TABLE public.broadcast_live_state REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_live_state;
