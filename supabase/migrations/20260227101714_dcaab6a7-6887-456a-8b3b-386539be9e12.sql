
-- Table for user's manually pinned favorite items/profiles
CREATE TABLE public.profile_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'preset_item', -- 'preset_item' or 'user_profile'
  item_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profile_id, item_type, item_id)
);

ALTER TABLE public.profile_favorites ENABLE ROW LEVEL SECURITY;

-- Anyone can view favorites (public profiles)
CREATE POLICY "Favorites are publicly readable" ON public.profile_favorites
  FOR SELECT USING (true);

-- Users can manage own favorites
CREATE POLICY "Users can insert own favorites" ON public.profile_favorites
  FOR INSERT WITH CHECK (is_profile_owner(profile_id));

CREATE POLICY "Users can delete own favorites" ON public.profile_favorites
  FOR DELETE USING (is_profile_owner(profile_id));

CREATE POLICY "Users can update own favorites" ON public.profile_favorites
  FOR UPDATE USING (is_profile_owner(profile_id));
