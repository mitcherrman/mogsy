
-- Elo Check game results table
CREATE TABLE public.elo_check_games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'preset', -- 'preset' or 'user'
  shown_item_id UUID NOT NULL,
  shown_item_league_id UUID NOT NULL REFERENCES public.leagues(id),
  opponent_item_id UUID NOT NULL,
  opponent_item_league_id UUID NOT NULL REFERENCES public.leagues(id),
  guessed_higher_id UUID NOT NULL,
  actual_higher_id UUID NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.elo_check_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own elo check games"
  ON public.elo_check_games FOR SELECT
  USING (is_profile_owner(profile_id));

CREATE POLICY "Users can insert own elo check games"
  ON public.elo_check_games FOR INSERT
  WITH CHECK (is_profile_owner(profile_id));

CREATE POLICY "Admins can view all elo check games"
  ON public.elo_check_games FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Track which leagues are enabled for elo check
CREATE TABLE public.elo_check_league_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.elo_check_league_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elo check settings are publicly readable"
  ON public.elo_check_league_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert elo check settings"
  ON public.elo_check_league_settings FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update elo check settings"
  ON public.elo_check_league_settings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete elo check settings"
  ON public.elo_check_league_settings FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for fast lookups
CREATE INDEX idx_elo_check_games_profile ON public.elo_check_games(profile_id, created_at DESC);
CREATE INDEX idx_elo_check_league_settings_league ON public.elo_check_league_settings(league_id);
