import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMultiplayerGame } from "@/hooks/useMultiplayerGame";
import MultiplayerLobby from "@/components/multiplayer/MultiplayerLobby";
import TagTeamGame from "@/components/multiplayer/TagTeamGame";
import DraftDuelGame from "@/components/multiplayer/DraftDuelGame";
import PredictionWarsGame from "@/components/multiplayer/PredictionWarsGame";
import SiegeGame from "@/components/multiplayer/SiegeGame";
import HotStreakGame from "@/components/multiplayer/HotStreakGame";
import GameResults from "@/components/multiplayer/GameResults";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProfileInfo {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export default function MultiplayerGame() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const gameState = useMultiplayerGame(gameId || null);
  const { game, teams, players, rounds, actions, myPlayer, myTeam, opponentTeam, currentRound, myProfileId, loading, error } = gameState;
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});

  // Join game on mount if not already a player
  useEffect(() => {
    if (!gameId || !myProfileId || loading) return;
    if (game && game.status === "waiting" && !myPlayer) {
      gameState.joinGame(gameId).catch(e => toast.error(e.message));
    }
  }, [gameId, myProfileId, loading, game?.status, myPlayer]);

  // Fetch player profiles
  useEffect(() => {
    const ids = players.map(p => p.profile_id);
    if (ids.length === 0) return;
    supabase.from("public_profiles").select("id, display_name, avatar_url").in("id", ids)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, ProfileInfo> = {};
          data.forEach(p => { if (p.id) map[p.id] = p as ProfileInfo; });
          setProfiles(map);
        }
      });
  }, [players.length]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{error || "Game not found."}</p>
        <Button onClick={() => navigate("/multiplayer")}>Back to Multiplayer</Button>
      </div>
    );
  }

  const isHost = myPlayer?.is_host ?? false;

  const commonGameProps = {
    ...gameState,
    onSubmitAction: gameState.submitAction,
    onUpdateScore: gameState.updateScore,
    onEndGame: gameState.endGame,
    onNextRound: gameState.nextRound,
  };

  const renderGame = () => {
    switch (game.mode) {
      case "tag_team": return <TagTeamGame {...commonGameProps} />;
      case "draft_duel": return <DraftDuelGame {...commonGameProps} />;
      case "prediction_wars": return <PredictionWarsGame {...commonGameProps} />;
      case "siege": return <SiegeGame {...commonGameProps} />;
      case "hot_streak": return <HotStreakGame {...commonGameProps} />;
      default: return null;
    }
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/multiplayer")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-black text-foreground capitalize">
          {game.mode.replace(/_/g, " ")}
        </h1>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
          game.status === "active" ? "bg-green-500/20 text-green-500" :
          game.status === "waiting" ? "bg-primary/20 text-primary" :
          game.status === "finished" ? "bg-muted text-muted-foreground" :
          "bg-muted text-muted-foreground"
        }`}>
          {game.status}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {(game.status === "waiting" || game.status === "picking") && (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MultiplayerLobby
              gameId={game.id}
              teams={teams}
              players={players}
              myPlayer={myPlayer}
              myProfileId={myProfileId}
              isHost={isHost}
              onStartGame={gameState.startGame}
              onLeaveGame={() => { gameState.leaveGame(); navigate("/multiplayer"); }}
              onSetReady={gameState.setReady}
            />
          </motion.div>
        )}

        {game.status === "active" && (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderGame()}
          </motion.div>
        )}

        {game.status === "finished" && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GameResults
              game={game}
              teams={teams}
              players={players}
              profiles={profiles}
              myProfileId={myProfileId}
              onPlayAgain={() => navigate("/multiplayer")}
              onGoHome={() => navigate("/home")}
            />
          </motion.div>
        )}

        {game.status === "cancelled" && (
          <motion.div key="cancelled" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
            <p className="text-xl font-bold text-foreground">Game Cancelled</p>
            <Button className="mt-4" onClick={() => navigate("/multiplayer")}>Back to Multiplayer</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
