
ALTER TABLE public.user_notifications 
ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_rule text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recurrence_end_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_sent boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS action_url text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS emoji text DEFAULT NULL;
