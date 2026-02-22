
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false;
