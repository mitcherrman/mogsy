ALTER TABLE public.preset_items ADD COLUMN title_image_scale real NOT NULL DEFAULT 1.0;
ALTER TABLE public.preset_items ADD COLUMN title_image_offset_y smallint NOT NULL DEFAULT 0;
ALTER TABLE public.preset_items ADD COLUMN title_image_max_height smallint NOT NULL DEFAULT 0;