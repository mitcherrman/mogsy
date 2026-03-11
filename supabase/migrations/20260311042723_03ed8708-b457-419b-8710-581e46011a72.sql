ALTER TABLE public.preset_item_images
  ADD COLUMN focal_x smallint NOT NULL DEFAULT 50,
  ADD COLUMN focal_y smallint NOT NULL DEFAULT 50,
  ADD COLUMN zoom real NOT NULL DEFAULT 1.0;