
-- Table mapping champion id -> uploaded picture
CREATE TABLE public.champion_images (
  champion_id text PRIMARY KEY,
  storage_path text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.champion_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.champion_images TO authenticated;
GRANT ALL ON public.champion_images TO service_role;

ALTER TABLE public.champion_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "champion_images public read"
  ON public.champion_images FOR SELECT
  USING (true);

CREATE POLICY "champion_images admin insert"
  ON public.champion_images FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "champion_images admin update"
  ON public.champion_images FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "champion_images admin delete"
  ON public.champion_images FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER champion_images_set_updated_at
  BEFORE UPDATE ON public.champion_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for the private champion-images bucket
CREATE POLICY "champion-images authenticated read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'champion-images');

CREATE POLICY "champion-images admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'champion-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "champion-images admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'champion-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'champion-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "champion-images admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'champion-images' AND public.has_role(auth.uid(), 'admin'));
