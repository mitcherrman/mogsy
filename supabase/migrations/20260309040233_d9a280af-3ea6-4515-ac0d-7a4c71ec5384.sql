-- Multiplayer 2v2 Game System Tables

-- Core game session table
CREATE TABLE public.multiplayer_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('tag_team', 'draft_duel', 'prediction_wars', 'siege', 'hot_streak')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'picking', 'active', 'finished', 'cancelled')),
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  league_type text NOT NULL DEFAULT 'preset' CHECK (league_type IN ('preset', 'user')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz DEFAULT NULL,
  finished_at timestamptz DEFAULT NULL
);

-- Teams within a game (always 2 per game)
CREATE TABLE public.multiplayer_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.multiplayer_games(id) ON DELETE CASCADE,
  team_index int NOT NULL CHECK (team_index IN (0, 1)),
  score int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, team_index)
);

-- Players assigned to teams
CREATE TABLE public.multiplayer_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.multiplayer_teams(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.multiplayer_games(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_ready boolean NOT NULL DEFAULT false,
  is_host boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, profile_id)
);

-- Individual rounds/turns within a game
CREATE TABLE public.multiplayer_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.multiplayer_games(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_team_id uuid REFERENCES public.multiplayer_teams(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, round_number)
);

-- Player actions (picks, votes, attacks, predictions)
CREATE TABLE public.multiplayer_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.multiplayer_games(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.multiplayer_rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.multiplayer_players(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('pick', 'vote', 'attack', 'predict', 'submit', 'ready', 'swipe')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Admin configuration per mode
CREATE TABLE public.multiplayer_settings (
  mode text PRIMARY KEY CHECK (mode IN ('tag_team', 'draft_duel', 'prediction_wars', 'siege', 'hot_streak')),
  is_enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default settings for each mode
INSERT INTO public.multiplayer_settings (mode, config) VALUES
  ('tag_team', '{"voting_time_seconds": 30, "rounds": 3}'::jsonb),
  ('draft_duel', '{"draft_time_seconds": 20, "pool_size": 10, "picks_per_team": 3}'::jsonb),
  ('prediction_wars', '{"prediction_time_seconds": 15, "rounds": 5}'::jsonb),
  ('siege', '{"tower_size": 3, "attack_time_seconds": 20}'::jsonb),
  ('hot_streak', '{"time_limit_seconds": 60, "swipe_time_seconds": 5}'::jsonb);

-- Indexes for performance
CREATE INDEX idx_multiplayer_games_status ON public.multiplayer_games(status);
CREATE INDEX idx_multiplayer_games_league ON public.multiplayer_games(league_id);
CREATE INDEX idx_multiplayer_players_profile ON public.multiplayer_players(profile_id);
CREATE INDEX idx_multiplayer_players_game ON public.multiplayer_players(game_id);
CREATE INDEX idx_multiplayer_actions_game ON public.multiplayer_actions(game_id);
CREATE INDEX idx_multiplayer_actions_round ON public.multiplayer_actions(round_id);

-- Enable RLS on all tables
ALTER TABLE public.multiplayer_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplayer_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplayer_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplayer_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplayer_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplayer_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is a player in a game
CREATE OR REPLACE FUNCTION public.is_game_player(_game_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.multiplayer_players mp
    JOIN public.profiles p ON p.id = mp.profile_id
    WHERE mp.game_id = _game_id AND p.user_id = auth.uid()
  )
$$;

-- RLS Policies for multiplayer_games
CREATE POLICY "Players can view games they're in" ON public.multiplayer_games
  FOR SELECT USING (is_game_player(id) OR status = 'waiting');

CREATE POLICY "Authenticated users can create games" ON public.multiplayer_games
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Players can update their games" ON public.multiplayer_games
  FOR UPDATE USING (is_game_player(id));

CREATE POLICY "Admins can manage all games" ON public.multiplayer_games
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for multiplayer_teams
CREATE POLICY "Players can view teams in their games" ON public.multiplayer_teams
  FOR SELECT USING (is_game_player(game_id));

CREATE POLICY "Authenticated users can create teams" ON public.multiplayer_teams
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Players can update teams in their games" ON public.multiplayer_teams
  FOR UPDATE USING (is_game_player(game_id));

CREATE POLICY "Admins can manage all teams" ON public.multiplayer_teams
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for multiplayer_players
CREATE POLICY "Players can view players in their games" ON public.multiplayer_players
  FOR SELECT USING (is_game_player(game_id));

CREATE POLICY "Authenticated users can join games" ON public.multiplayer_players
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Players can update their own player record" ON public.multiplayer_players
  FOR UPDATE USING (is_profile_owner(profile_id));

CREATE POLICY "Admins can manage all players" ON public.multiplayer_players
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for multiplayer_rounds
CREATE POLICY "Players can view rounds in their games" ON public.multiplayer_rounds
  FOR SELECT USING (is_game_player(game_id));

CREATE POLICY "Authenticated users can create rounds" ON public.multiplayer_rounds
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Players can update rounds in their games" ON public.multiplayer_rounds
  FOR UPDATE USING (is_game_player(game_id));

CREATE POLICY "Admins can manage all rounds" ON public.multiplayer_rounds
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for multiplayer_actions
CREATE POLICY "Players can view actions in their games" ON public.multiplayer_actions
  FOR SELECT USING (is_game_player(game_id));

CREATE POLICY "Players can insert their own actions" ON public.multiplayer_actions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.multiplayer_players mp
      JOIN public.profiles p ON p.id = mp.profile_id
      WHERE mp.id = player_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all actions" ON public.multiplayer_actions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for multiplayer_settings
CREATE POLICY "Settings are publicly readable" ON public.multiplayer_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage settings" ON public.multiplayer_settings
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable Realtime for live gameplay
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplayer_games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplayer_teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplayer_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplayer_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplayer_actions;

-- Security definer function to create a multiplayer game
CREATE OR REPLACE FUNCTION public.create_multiplayer_game(
  _mode text,
  _league_id uuid,
  _league_type text,
  _host_profile_id uuid,
  _partner_profile_id uuid,
  _config jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _game_id uuid;
  _team_id uuid;
  _host_player_id uuid;
  _partner_player_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _host_profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Create the game
  INSERT INTO multiplayer_games (mode, league_id, league_type, config)
  VALUES (_mode, _league_id, _league_type, _config)
  RETURNING id INTO _game_id;

  -- Create team 1
  INSERT INTO multiplayer_teams (game_id, team_index)
  VALUES (_game_id, 0)
  RETURNING id INTO _team_id;

  -- Add host as player
  INSERT INTO multiplayer_players (game_id, team_id, profile_id, is_host, is_ready)
  VALUES (_game_id, _team_id, _host_profile_id, true, true)
  RETURNING id INTO _host_player_id;

  -- Add partner if provided
  IF _partner_profile_id IS NOT NULL THEN
    INSERT INTO multiplayer_players (game_id, team_id, profile_id, is_ready)
    VALUES (_game_id, _team_id, _partner_profile_id, false)
    RETURNING id INTO _partner_player_id;
  END IF;

  RETURN jsonb_build_object(
    'game_id', _game_id,
    'team_id', _team_id,
    'host_player_id', _host_player_id,
    'partner_player_id', _partner_player_id
  );
END;
$$;

-- Security definer function to join a multiplayer game
CREATE OR REPLACE FUNCTION public.join_multiplayer_game(
  _game_id uuid,
  _profile_id uuid,
  _partner_profile_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _game_status text;
  _team_id uuid;
  _player_id uuid;
  _partner_player_id uuid;
  _team_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Check game status
  SELECT status INTO _game_status FROM multiplayer_games WHERE id = _game_id;
  IF _game_status != 'waiting' THEN
    RAISE EXCEPTION 'Game is not accepting players';
  END IF;

  -- Check if already in game
  IF EXISTS (SELECT 1 FROM multiplayer_players WHERE game_id = _game_id AND profile_id = _profile_id) THEN
    RAISE EXCEPTION 'Already in this game';
  END IF;

  -- Count existing teams
  SELECT COUNT(*) INTO _team_count FROM multiplayer_teams WHERE game_id = _game_id;

  IF _team_count >= 2 THEN
    RAISE EXCEPTION 'Game is full';
  END IF;

  -- Create team 2
  INSERT INTO multiplayer_teams (game_id, team_index)
  VALUES (_game_id, 1)
  RETURNING id INTO _team_id;

  -- Add player
  INSERT INTO multiplayer_players (game_id, team_id, profile_id, is_ready)
  VALUES (_game_id, _team_id, _profile_id, true)
  RETURNING id INTO _player_id;

  -- Add partner if provided
  IF _partner_profile_id IS NOT NULL THEN
    INSERT INTO multiplayer_players (game_id, team_id, profile_id, is_ready)
    VALUES (_game_id, _team_id, _partner_profile_id, false)
    RETURNING id INTO _partner_player_id;
  END IF;

  -- Update game status to picking if both teams ready
  IF (SELECT COUNT(*) FROM multiplayer_teams WHERE game_id = _game_id) = 2 THEN
    UPDATE multiplayer_games SET status = 'picking', updated_at = now() WHERE id = _game_id;
  END IF;

  RETURN jsonb_build_object(
    'team_id', _team_id,
    'player_id', _player_id,
    'partner_player_id', _partner_player_id
  );
END;
$$;

-- Security definer function to submit an action
CREATE OR REPLACE FUNCTION public.submit_multiplayer_action(
  _game_id uuid,
  _round_id uuid,
  _player_id uuid,
  _action_type text,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action_id uuid;
  _profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get profile_id for the player
  SELECT profile_id INTO _profile_id FROM multiplayer_players WHERE id = _player_id;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Insert action
  INSERT INTO multiplayer_actions (game_id, round_id, player_id, action_type, payload)
  VALUES (_game_id, _round_id, _player_id, _action_type, _payload)
  RETURNING id INTO _action_id;

  RETURN jsonb_build_object('action_id', _action_id);
END;
$$;

-- Update timestamp trigger for games
CREATE TRIGGER update_multiplayer_games_updated_at
  BEFORE UPDATE ON public.multiplayer_games
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update timestamp trigger for settings
CREATE TRIGGER update_multiplayer_settings_updated_at
  BEFORE UPDATE ON public.multiplayer_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();