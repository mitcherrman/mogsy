
-- Table for layout config (draft/published JSONB blobs)
CREATE TABLE public.play_layout_config (
  id text PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.play_layout_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published config is publicly readable" ON public.play_layout_config
  FOR SELECT USING (id = 'published');

CREATE POLICY "Admins can read all configs" ON public.play_layout_config
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Master admins can manage configs" ON public.play_layout_config
  FOR ALL USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

-- Table for per-league animation scheduling rules
CREATE TABLE public.league_animation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  animation_id text NOT NULL,
  every_n_swipes integer NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_id, animation_id)
);

ALTER TABLE public.league_animation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rules are publicly readable" ON public.league_animation_rules
  FOR SELECT USING (true);

CREATE POLICY "Master admins can manage rules" ON public.league_animation_rules
  FOR ALL USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));
