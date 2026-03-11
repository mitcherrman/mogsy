ALTER TABLE public.preset_item_images
  ADD COLUMN pad_top smallint NOT NULL DEFAULT 0,
  ADD COLUMN pad_left smallint NOT NULL DEFAULT 0;