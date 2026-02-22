
-- Multiple images per preset item
CREATE TABLE public.preset_item_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  preset_item_id uuid NOT NULL REFERENCES public.preset_items(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  report_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.preset_item_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Images are publicly readable" ON public.preset_item_images FOR SELECT USING (true);
CREATE POLICY "Admins can insert images" ON public.preset_item_images FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update images" ON public.preset_item_images FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete images" ON public.preset_item_images FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Image reports from users
CREATE TABLE public.image_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_id uuid NOT NULL REFERENCES public.preset_item_images(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reason text DEFAULT 'not_representative',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(image_id, user_id)
);

ALTER TABLE public.image_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert reports" ON public.image_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own reports" ON public.image_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all reports" ON public.image_reports FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin notifications for image reports
CREATE TABLE public.admin_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL DEFAULT 'image_report',
  title text NOT NULL,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read notifications" ON public.admin_notifications FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update notifications" ON public.admin_notifications FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert notifications" ON public.admin_notifications FOR INSERT WITH CHECK (true);

-- Add show_elo and show_rank toggles to leagues
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS show_elo boolean DEFAULT true;
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS show_rank boolean DEFAULT true;

-- Index for performance
CREATE INDEX idx_preset_item_images_item ON public.preset_item_images(preset_item_id);
CREATE INDEX idx_image_reports_image ON public.image_reports(image_id);
