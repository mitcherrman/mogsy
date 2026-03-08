
CREATE TABLE public.custom_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  destination_type text NOT NULL DEFAULT 'league',
  league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL,
  recommended_categories text[] DEFAULT '{}',
  recommended_league_ids uuid[] DEFAULT '{}',
  default_theme text DEFAULT 'default',
  default_swipe_animation text DEFAULT 'default',
  grant_diamonds integer DEFAULT 0,
  grant_pro boolean DEFAULT false,
  label text DEFAULT '',
  is_active boolean DEFAULT true,
  visits integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  created_by_user_id uuid NOT NULL
);

ALTER TABLE public.custom_links ENABLE ROW LEVEL SECURITY;

-- Admins full CRUD
CREATE POLICY "Admins can manage custom links"
ON public.custom_links FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Public can read active links (for slug resolution)
CREATE POLICY "Anyone can read active custom links"
ON public.custom_links FOR SELECT
TO anon, authenticated
USING (is_active = true);
