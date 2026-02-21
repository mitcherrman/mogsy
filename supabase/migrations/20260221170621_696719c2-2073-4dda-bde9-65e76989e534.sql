
-- Add diamonds currency column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS diamonds integer DEFAULT 0;
