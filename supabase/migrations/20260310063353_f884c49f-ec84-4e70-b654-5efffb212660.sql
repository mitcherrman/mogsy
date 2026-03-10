
-- Moderators can insert preset items
CREATE POLICY "Moderators can insert preset items"
ON public.preset_items FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));

-- Moderators can update preset items
CREATE POLICY "Moderators can update preset items"
ON public.preset_items FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- Moderators can delete preset items
CREATE POLICY "Moderators can delete preset items"
ON public.preset_items FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- Moderators can delete preset item images
CREATE POLICY "Moderators can delete images"
ON public.preset_item_images FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- Moderators can read play layout configs
CREATE POLICY "Moderators can read all configs"
ON public.play_layout_config FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));
