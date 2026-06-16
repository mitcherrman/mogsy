DROP POLICY IF EXISTS "Images are publicly readable" ON public.preset_item_images;

CREATE POLICY "Images are publicly readable when not hidden"
ON public.preset_item_images
FOR SELECT
USING (is_hidden = false OR is_hidden IS NULL);

CREATE POLICY "Admins and moderators can read hidden images"
ON public.preset_item_images
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
);