
-- Create saved_profiles table for "save profile to view later"
CREATE TABLE public.saved_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  saved_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, saved_profile_id)
);

ALTER TABLE public.saved_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved profiles"
  ON public.saved_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved profiles"
  ON public.saved_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved profiles"
  ON public.saved_profiles FOR DELETE
  USING (auth.uid() = user_id);
