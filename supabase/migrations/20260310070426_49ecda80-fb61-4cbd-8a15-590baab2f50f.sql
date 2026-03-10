
-- Track image clicks/views during gameplay
CREATE TABLE public.image_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.preset_item_images(id) ON DELETE CASCADE,
  preset_item_id uuid NOT NULL REFERENCES public.preset_items(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast aggregation
CREATE INDEX idx_image_clicks_image_id ON public.image_clicks(image_id);
CREATE INDEX idx_image_clicks_preset_item_id ON public.image_clicks(preset_item_id);
CREATE INDEX idx_image_clicks_created_at ON public.image_clicks(created_at);

ALTER TABLE public.image_clicks ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert clicks
CREATE POLICY "Users can insert image clicks"
ON public.image_clicks FOR INSERT TO authenticated
WITH CHECK (true);

-- Admins and moderators can read all clicks
CREATE POLICY "Admins can read image clicks"
ON public.image_clicks FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Moderators can read image clicks"
ON public.image_clicks FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));
