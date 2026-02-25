
-- Table for notifications sent to users
CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'general',
  image_url text,
  league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL,
  item_id uuid REFERENCES public.preset_items(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  sent_by_user_id uuid NOT NULL,
  target_type text NOT NULL DEFAULT 'all',
  target_league_ids uuid[] DEFAULT '{}'::uuid[],
  target_categories text[] DEFAULT '{}'::text[]
);

-- Per-user read tracking
CREATE TABLE public.user_notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.user_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notification_id, user_id)
);

-- RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_reads ENABLE ROW LEVEL SECURITY;

-- Notifications are readable by authenticated users
CREATE POLICY "Authenticated can read notifications" ON public.user_notifications
  FOR SELECT TO authenticated USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert notifications" ON public.user_notifications
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete
CREATE POLICY "Admins can delete notifications" ON public.user_notifications
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can read own read records
CREATE POLICY "Users can read own reads" ON public.user_notification_reads
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Users can insert own read records
CREATE POLICY "Users can insert own reads" ON public.user_notification_reads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
