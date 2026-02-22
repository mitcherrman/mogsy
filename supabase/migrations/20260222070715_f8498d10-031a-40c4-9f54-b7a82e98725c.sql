
-- Add admin_notes column to profiles for admin-only notes
ALTER TABLE public.profiles ADD COLUMN admin_notes text DEFAULT '';
