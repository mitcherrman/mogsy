import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Json } from "@/integrations/supabase/types";

export type MultiplayerMode = "tag_team" | "draft_duel" | "prediction_wars" | "siege" | "hot_streak";
export type GameStatus = "waiting" | "picking" | "active" | "finished" | "cancelled";

export interface MultiplayerGame {
  id: string;
  mode: MultiplayerMode;
  status: GameStatus;
  league_id: string | null;
  league_type: string;
  config: Json;
  result: Json | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface MultiplayerTeam {
  id: string;
  game_id: string;
  team_index: number;
  score: number;
  created_at: string;
}

export interface MultiplayerPlayer {
  id: string;
  team_id: string;
  game_id: string;
  profile_id: string;
  is_ready: boolean;
  is_host: boolean;
  created_at: string;
}

export interface MultiplayerRound {
  id: string;
  game_id: string;
  round_number: number;
  state: Json;
  winner_team_id: string | null;
  created_at: string;
}

export interface MultiplayerAction {
  id: string;
  game_id: string;
  round_id: string | null;
  player_id: string;
  action_type: string;
  payload: Json;
  created_at: string;
}

export interface MultiplayerSettings {
  mode: MultiplayerMode;
  is_enabled: boolean;
  config: Json;
  updated_at: string;
}

export interface GameState {
  game: MultiplayerGame | null;
  teams: MultiplayerTeam[];
  players: MultiplayerPlayer[];
  rounds: MultiplayerRound[];
  actions: MultiplayerAction[];
  myPlayer: MultiplayerPlayer | null;
  myTeam: MultiplayerTeam | null;
  opponentTeam: MultiplayerTeam | null;
  currentRound: MultiplayerRound | null;
}

export function useMultiplayerGame(gameId: string | null) {
  const { user, profile } = useAuth();
  const [gameState, setGameState] = useState<GameState>({
    game: null,
    teams: [],
    players: [],
    rounds: [],
    actions: [],
    myPlayer: null,
    myTeam: null,
    opponentTeam: null,
    currentRound: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial game state
  const fetchGameState = useCallback(async () => {
    if (!gameId) return;

    try {
      const [gameRes, teamsRes, playersRes, roundsRes, actionsRes] = await Promise.all([
        supabase.from("multiplayer_games").select("*").eq("id", gameId).single(),
        supabase.from("multiplayer_teams").select("*").eq("game_id", gameId).order("team_index"),
        supabase.from("multiplayer_players").select("*").eq("game_id", gameId),
        supabase.from("multiplayer_rounds").select("*").eq("game_id", gameId).order("round_number"),
        supabase.from("multiplayer_actions").select("*").eq("game_id", gameId).order("created_at"),
      ]);

      if (gameRes.error) throw gameRes.error;

      const game = gameRes.data as MultiplayerGame;
      const teams = (teamsRes.data || []) as MultiplayerTeam[];
      const players = (playersRes.data || []) as MultiplayerPlayer[];
      const rounds = (roundsRes.data || []) as MultiplayerRound[];
      const actions = (actionsRes.data || []) as MultiplayerAction[];

      // Find my player and team
      const myPlayer = profile ? players.find(p => p.profile_id === profile.id) || null : null;
      const myTeam = myPlayer ? teams.find(t => t.id === myPlayer.team_id) || null : null;
      const opponentTeam = myTeam ? teams.find(t => t.id !== myTeam.id) || null : null;
      const currentRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

      setGameState({
        game,
        teams,
        players,
        rounds,
        actions,
        myPlayer,
        myTeam,
        opponentTeam,
        currentRound,
      });
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [gameId, profile]);

  // Set up realtime subscriptions
  useEffect(() => {
    if (!gameId) return;

    fetchGameState();

    const channel = supabase
      .channel(`multiplayer-game-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "multiplayer_games", filter: `id=eq.${gameId}` },
        () => fetchGameState()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "multiplayer_teams", filter: `game_id=eq.${gameId}` },
        () => fetchGameState()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "multiplayer_players", filter: `game_id=eq.${gameId}` },
        () => fetchGameState()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "multiplayer_rounds", filter: `game_id=eq.${gameId}` },
        () => fetchGameState()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "multiplayer_actions", filter: `game_id=eq.${gameId}` },
        () => fetchGameState()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, fetchGameState]);

  // Create a new game
  const createGame = useCallback(
    async (
      mode: MultiplayerMode,
      leagueId: string | null,
      leagueType: "preset" | "user",
      partnerId: string | null,
      config: Record<string, any> = {}
    ) => {
      if (!profile) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("create_multiplayer_game", {
        _mode: mode,
        _league_id: leagueId,
        _league_type: leagueType,
        _host_profile_id: profile.id,
        _partner_profile_id: partnerId,
        _config: config,
      });

      if (error) throw error;
      return data as { game_id: string; team_id: string; host_player_id: string; partner_player_id: string | null };
    },
    [profile]
  );

  // Join an existing game
  const joinGame = useCallback(
    async (joinGameId: string, partnerId: string | null = null) => {
      if (!profile) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("join_multiplayer_game", {
        _game_id: joinGameId,
        _profile_id: profile.id,
        _partner_profile_id: partnerId,
      });

      if (error) throw error;
      return data as { team_id: string; player_id: string; partner_player_id: string | null };
    },
    [profile]
  );

  // Submit an action
  const submitAction = useCallback(
    async (roundId: string | null, actionType: string, payload: Record<string, any> = {}) => {
      if (!gameState.myPlayer || !gameId) throw new Error("Not in a game");

      const { data, error } = await supabase.rpc("submit_multiplayer_action", {
        _game_id: gameId,
        _round_id: roundId,
        _player_id: gameState.myPlayer.id,
        _action_type: actionType,
        _payload: payload,
      });

      if (error) throw error;
      return data;
    },
    [gameId, gameState.myPlayer]
  );

  // Set player ready status
  const setReady = useCallback(
    async (ready: boolean) => {
      if (!gameState.myPlayer) throw new Error("Not in a game");

      const { error } = await supabase
        .from("multiplayer_players")
        .update({ is_ready: ready })
        .eq("id", gameState.myPlayer.id);

      if (error) throw error;
    },
    [gameState.myPlayer]
  );

  // Start the game (host only)
  const startGame = useCallback(async () => {
    if (!gameId || !gameState.myPlayer?.is_host) throw new Error("Not authorized");

    // Check all players are ready
    const allReady = gameState.players.every(p => p.is_ready);
    if (!allReady) throw new Error("Not all players are ready");

    // Update game status
    const { error } = await supabase
      .from("multiplayer_games")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", gameId);

    if (error) throw error;

    // Create first round
    await supabase.from("multiplayer_rounds").insert({
      game_id: gameId,
      round_number: 1,
      state: {},
    });
  }, [gameId, gameState.myPlayer, gameState.players]);

  // Cancel the game (host only)
  const cancelGame = useCallback(async () => {
    if (!gameId || !gameState.myPlayer?.is_host) throw new Error("Not authorized");

    const { error } = await supabase
      .from("multiplayer_games")
      .update({ status: "cancelled" })
      .eq("id", gameId);

    if (error) throw error;
  }, [gameId, gameState.myPlayer]);

  // Leave the game
  const leaveGame = useCallback(async () => {
    if (!gameState.myPlayer) return;

    const { error } = await supabase
      .from("multiplayer_players")
      .delete()
      .eq("id", gameState.myPlayer.id);

    if (error) throw error;
  }, [gameState.myPlayer]);

  // Advance to next round
  const nextRound = useCallback(async () => {
    if (!gameId || !gameState.currentRound) throw new Error("No current round");

    const nextRoundNumber = gameState.currentRound.round_number + 1;
    const { error } = await supabase.from("multiplayer_rounds").insert({
      game_id: gameId,
      round_number: nextRoundNumber,
      state: {},
    });

    if (error) throw error;
  }, [gameId, gameState.currentRound]);

  // Update team score
  const updateScore = useCallback(
    async (teamId: string, scoreChange: number) => {
      if (!gameId) throw new Error("No game");

      const team = gameState.teams.find(t => t.id === teamId);
      if (!team) throw new Error("Team not found");

      const { error } = await supabase
        .from("multiplayer_teams")
        .update({ score: team.score + scoreChange })
        .eq("id", teamId);

      if (error) throw error;
    },
    [gameId, gameState.teams]
  );

  // End the game
  const endGame = useCallback(
    async (result: Record<string, any>) => {
      if (!gameId) throw new Error("No game");

      const { error } = await supabase
        .from("multiplayer_games")
        .update({
          status: "finished",
          finished_at: new Date().toISOString(),
          result,
        })
        .eq("id", gameId);

      if (error) throw error;
    },
    [gameId]
  );

  return {
    ...gameState,
    loading,
    error,
    createGame,
    joinGame,
    submitAction,
    setReady,
    startGame,
    cancelGame,
    leaveGame,
    nextRound,
    updateScore,
    endGame,
    refetch: fetchGameState,
  };
}

// Hook to fetch multiplayer settings
export function useMultiplayerSettings() {
  const [settings, setSettings] = useState<MultiplayerSettings[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("multiplayer_settings")
      .select("*")
      .then(({ data }) => {
        if (data) setSettings(data as MultiplayerSettings[]);
        setLoading(false);
      });
  }, []);

  const getModeSettings = (mode: MultiplayerMode) => settings.find(s => s.mode === mode);
  const isEnabled = (mode: MultiplayerMode) => getModeSettings(mode)?.is_enabled ?? false;

  return { settings, loading, getModeSettings, isEnabled };
}

// Hook to fetch available games to join
export function useAvailableGames(mode?: MultiplayerMode) {
  const [games, setGames] = useState<MultiplayerGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let query = supabase
      .from("multiplayer_games")
      .select("*")
      .eq("status", "waiting")
      .order("created_at", { ascending: false })
      .limit(20);

    if (mode) {
      query = query.eq("mode", mode);
    }

    query.then(({ data }) => {
      if (data) setGames(data as MultiplayerGame[]);
      setLoading(false);
    });
  }, [mode]);

  return { games, loading };
}
