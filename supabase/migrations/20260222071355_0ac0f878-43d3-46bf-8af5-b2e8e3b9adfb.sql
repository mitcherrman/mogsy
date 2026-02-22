
-- Add underage flag for admin moderation
ALTER TABLE public.profiles ADD COLUMN is_flagged_underage boolean DEFAULT false;
