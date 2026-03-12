
CREATE TABLE public.processed_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  original_url text NOT NULL,
  mp4_url text,
  webm_url text,
  thumbnail_url text,
  media_type text NOT NULL DEFAULT 'image',
  duration real,
  width integer,
  height integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.processed_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage processed_media" ON public.processed_media
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Processed media is publicly readable" ON public.processed_media
  FOR SELECT TO public
  USING (true);
