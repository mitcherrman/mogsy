
ALTER TABLE public.preset_item_images
  ADD COLUMN mobile_focal_x real,
  ADD COLUMN mobile_focal_y real,
  ADD COLUMN mobile_zoom real,
  ADD COLUMN mobile_pad_top real,
  ADD COLUMN mobile_pad_left real;

ALTER TABLE public.preset_items
  ADD COLUMN mobile_title_image_scale real,
  ADD COLUMN mobile_title_image_offset_y real,
  ADD COLUMN mobile_title_image_offset_x real,
  ADD COLUMN mobile_title_image_max_height real;
