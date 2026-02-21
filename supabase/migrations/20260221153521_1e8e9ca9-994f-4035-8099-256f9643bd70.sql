
-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  age integer,
  location text DEFAULT '',
  status_message text DEFAULT '',
  socials jsonb DEFAULT '{}',
  avatar_url text DEFAULT '',
  is_pro boolean DEFAULT false,
  boost_credits integer DEFAULT 0,
  active_boost_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Leagues table
CREATE TABLE public.leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  type text NOT NULL DEFAULT 'user' CHECK (type IN ('user', 'preset')),
  is_system boolean DEFAULT false,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Profile photos table
CREATE TABLE public.profile_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  url text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- League memberships table
CREATE TABLE public.league_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  elo integer NOT NULL DEFAULT 1200,
  matches_played integer NOT NULL DEFAULT 0,
  last_active_at timestamptz DEFAULT now(),
  UNIQUE(league_id, profile_id)
);

-- Matches table
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE NOT NULL,
  winner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  loser_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  winner_item_id uuid,
  loser_item_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Preset items table
CREATE TABLE public.preset_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  image_url text DEFAULT '',
  external_link text DEFAULT '',
  elo integer NOT NULL DEFAULT 1200,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Boosts table
CREATE TABLE public.boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  credits integer DEFAULT 0,
  active_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Now create helper functions (tables exist)
CREATE OR REPLACE FUNCTION public.is_profile_owner(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _profile_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_league_creator(_league_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leagues
    WHERE id = _league_id AND created_by_user_id = auth.uid()
  )
$$;

-- RLS: profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are publicly readable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- RLS: profile_photos
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profile photos are publicly readable" ON public.profile_photos FOR SELECT USING (true);
CREATE POLICY "Users can insert own photos" ON public.profile_photos FOR INSERT TO authenticated WITH CHECK (public.is_profile_owner(profile_id));
CREATE POLICY "Users can delete own photos" ON public.profile_photos FOR DELETE TO authenticated USING (public.is_profile_owner(profile_id));
CREATE POLICY "Users can update own photos" ON public.profile_photos FOR UPDATE TO authenticated USING (public.is_profile_owner(profile_id));

-- RLS: leagues
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leagues are publicly readable" ON public.leagues FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create leagues" ON public.leagues FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by_user_id);
CREATE POLICY "League creators can update" ON public.leagues FOR UPDATE TO authenticated USING (public.is_league_creator(id));

-- RLS: league_memberships
ALTER TABLE public.league_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Memberships are publicly readable" ON public.league_memberships FOR SELECT USING (true);
CREATE POLICY "Users can join leagues" ON public.league_memberships FOR INSERT TO authenticated WITH CHECK (public.is_profile_owner(profile_id));
CREATE POLICY "Users can update own membership" ON public.league_memberships FOR UPDATE TO authenticated USING (public.is_profile_owner(profile_id));

-- RLS: matches
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Matches are publicly readable" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create matches" ON public.matches FOR INSERT TO authenticated WITH CHECK (true);

-- RLS: preset_items
ALTER TABLE public.preset_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Preset items are publicly readable" ON public.preset_items FOR SELECT USING (true);
CREATE POLICY "League creators can manage preset items" ON public.preset_items FOR INSERT TO authenticated WITH CHECK (public.is_league_creator(league_id));
CREATE POLICY "League creators can update preset items" ON public.preset_items FOR UPDATE TO authenticated USING (public.is_league_creator(league_id));
CREATE POLICY "League creators can delete preset items" ON public.preset_items FOR DELETE TO authenticated USING (public.is_league_creator(league_id));

-- RLS: boosts
ALTER TABLE public.boosts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own boosts" ON public.boosts FOR SELECT TO authenticated USING (public.is_profile_owner(profile_id));
CREATE POLICY "Users can insert own boosts" ON public.boosts FOR INSERT TO authenticated WITH CHECK (public.is_profile_owner(profile_id));

-- Triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-photos', 'profile-photos', true);

CREATE POLICY "Anyone can view profile photos" ON storage.objects FOR SELECT USING (bucket_id = 'profile-photos');
CREATE POLICY "Authenticated users can upload profile photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own profile photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Seed system leagues
INSERT INTO public.leagues (name, type, is_system, description) VALUES
  ('Global Rankings', 'user', true, 'The global player leaderboard'),
  ('North America', 'user', true, 'North American rankings'),
  ('Europe', 'user', true, 'European rankings'),
  ('Asia Pacific', 'user', true, 'Asia Pacific rankings');

-- Seed preset leagues with items
DO $$
DECLARE
  _restaurants_id uuid := gen_random_uuid();
  _fastfood_id uuid := gen_random_uuid();
  _movies2025_id uuid := gen_random_uuid();
  _moviesalltime_id uuid := gen_random_uuid();
  _celebrity_id uuid := gen_random_uuid();
  _cars_id uuid := gen_random_uuid();
  _anime_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.leagues (id, name, type, is_system, description) VALUES
    (_restaurants_id, 'Best Restaurant', 'preset', true, '🍽️ Vote for the best restaurant'),
    (_fastfood_id, 'Best Fast Food', 'preset', true, '🍔 Vote for the best fast food'),
    (_movies2025_id, 'Best Movie of 2025', 'preset', true, '🎬 Vote for the best 2025 movie'),
    (_moviesalltime_id, 'Best Movie of All Time', 'preset', true, '🏆 Vote for the greatest movie ever'),
    (_celebrity_id, 'Best Celebrity', 'preset', true, '⭐ Vote for the best celebrity'),
    (_cars_id, 'Best Car', 'preset', true, '🏎️ Vote for the best car'),
    (_anime_id, 'Best Anime', 'preset', true, '🎌 Vote for the best anime');

  INSERT INTO public.preset_items (league_id, name, elo) VALUES
    (_restaurants_id, 'Nobu', 1500),
    (_restaurants_id, 'Eleven Madison Park', 1480),
    (_restaurants_id, 'Noma', 1460),
    (_fastfood_id, 'In-N-Out Burger', 1550),
    (_fastfood_id, 'Chick-fil-A', 1520),
    (_fastfood_id, 'Five Guys', 1480),
    (_movies2025_id, 'Thunderbolt', 1450),
    (_movies2025_id, 'Eclipse Rising', 1380),
    (_movies2025_id, 'Neon Horizon', 1320),
    (_movies2025_id, 'Silent Depths', 1290),
    (_celebrity_id, 'Keanu Reeves', 1500),
    (_celebrity_id, 'Zendaya', 1480),
    (_cars_id, 'Tesla Model S', 1450),
    (_cars_id, 'Porsche 911', 1520),
    (_anime_id, 'Attack on Titan', 1500),
    (_anime_id, 'Fullmetal Alchemist', 1480);
END $$;
