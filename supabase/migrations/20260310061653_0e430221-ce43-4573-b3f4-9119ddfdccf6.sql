
CREATE POLICY "Moderators can insert images"
ON public.preset_item_images FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));

CREATE POLICY "Moderators can update images"
ON public.preset_item_images FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));
