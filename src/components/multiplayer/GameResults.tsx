import { motion } from "framer-motion";
import { Trophy, Star, Medal, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MultiplayerGame, MultiplayerTeam, MultiplayerPlayer } from "@/hooks/useMultiplayerGame";
import UserAvatar from "@/components/UserAvatar";

interface GameResultsProps {
  game: MultiplayerGame;
  teams: MultiplayerTeam[];
  players: MultiplayerPlayer[];
  profiles: Record<string, { id: string; display_name: string | null; avatar_url: string | null }>;
  myProfileId: string | null;
  onPlayAgain: () => void;
  onGoHome: () => void;
}

const MODE_LABELS: Record<string, string> = {
  tag_team: "Tag Team Battle",
  draft_duel: "Draft & Duel",
  prediction_wars: "Prediction Wars",
  siege: "Siege Mode",
  hot_streak: "Hot Streak Relay",
};

export default function GameResults({
  game,
  teams,
  players,
  profiles,
  myProfileId,
  onPlayAgain,
  onGoHome,
}: GameResultsProps) {
  const result = game.result as any;
  const winnerTeamId = result?.winner_team_id;
  const winnerTeam = teams.find(t => t.id === winnerTeamId);
  const myTeam = players.find(p => p.profile_id === myProfileId)?.team_id
    ? teams.find(t => t.id === players.find(p => p.profile_id === myProfileId)?.team_id)
    : null;
  const iWon = myTeam?.id === winnerTeamId;

  const sortedTeams = [...teams].sort((a, b) => {
    if (a.id === winnerTeamId) return -1;
    if (b.id === winnerTeamId) return 1;
    return b.score - a.score;
  });

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", bounce: 0.4 }}
        className="text-center"
      >
        {iWon ? (
          <>
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="text-6xl mb-3"
            >
              🏆
            </motion.div>
            <h2 className="text-3xl font-black text-foreground">Victory!</h2>
            <p className="text-sm text-muted-foreground mt-1">Your team dominated!</p>
          </>
        ) : (
          <>
            <div className="text-6xl mb-3">😤</div>
            <h2 className="text-3xl font-black text-foreground">Defeat</h2>
            <p className="text-sm text-muted-foreground mt-1">Good effort! Try again?</p>
          </>
        )}
      </motion.div>

      {/* Mode badge */}
      <div className="text-center">
        <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
          {MODE_LABELS[game.mode] || game.mode}
        </span>
      </div>

      {/* Scoreboard */}
      <div className="space-y-3">
        {sortedTeams.map((team, rank) => {
          const teamPlayers = players.filter(p => p.team_id === team.id);
          const isWinner = team.id === winnerTeamId;
          const isMyTeam = myTeam?.id === team.id;

          return (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, x: rank === 0 ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + rank * 0.1 }}
              className={`p-4 rounded-xl border-2 ${
                isWinner
                  ? "border-amber-500/50 bg-amber-500/10"
                  : isMyTeam
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {isWinner ? (
                    <Trophy className="h-6 w-6 text-amber-500" />
                  ) : (
                    <Medal className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-foreground">Team {team.team_index + 1}</span>
                    {isWinner && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold">WINNER</span>
                    )}
                    {isMyTeam && !isWinner && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">YOUR TEAM</span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {teamPlayers.map(player => {
                      const p = profiles[player.profile_id];
                      return (
                        <div key={player.id} className="flex items-center gap-1.5">
                          <UserAvatar src={p?.avatar_url} name={p?.display_name || "Player"} size="xs" />
                          <span className="text-xs text-muted-foreground">{p?.display_name || "Player"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-2xl font-black text-foreground">{team.score}</div>
                  <div className="text-[10px] text-muted-foreground">score</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onGoHome}>
          <Home className="h-4 w-4 mr-1" />
          Home
        </Button>
        <Button variant="hero" className="flex-1" onClick={onPlayAgain}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Play Again
        </Button>
      </div>
    </div>
  );
}
