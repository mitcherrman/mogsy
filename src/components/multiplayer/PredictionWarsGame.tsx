import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Eye, Trophy, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GameState } from "@/hooks/useMultiplayerGame";

interface PredictionWarsGameProps extends GameState {
  onSubmitAction: (roundId: string | null, type: string, payload: Record<string, any>) => Promise<any>;
  onUpdateScore: (teamId: string, delta: number) => Promise<void>;
  onEndGame: (result: Record<string, any>) => Promise<void>;
  onNextRound: () => Promise<void>;
}

interface MatchPair {
  itemA: { id: string; name: string; image_url: string | null; elo: number };
  itemB: { id: string; name: string; image_url: string | null; elo: number };
  actualWinnerId: string;
}

const ROUNDS = 5;
const PREDICT_TIME = 15;

export default function PredictionWarsGame({
  game,
  teams,
  players,
  rounds,
  actions,
  myPlayer,
  myTeam,
  opponentTeam,
  currentRound,
  myProfileId,
  onSubmitAction,
  onUpdateScore,
  onEndGame,
  onNextRound,
}: PredictionWarsGameProps) {
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>([]);
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const [myPrediction, setMyPrediction] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(PREDICT_TIME);
  const [phase, setPhase] = useState<"predicting" | "reveal" | "finished">("predicting");
  const [teamScores, setTeamScores] = useState({ team0: 0, team1: 0 });

  // Load a batch of matchup pairs from the league
  useEffect(() => {
    if (!game?.league_id) return;
    supabase
      .from("preset_items")
      .select("id, name, image_url, elo")
      .eq("league_id", game.league_id)
      .order("elo", { ascending: false })
      .limit(ROUNDS * 2)
      .then(({ data }) => {
        if (!data || data.length < 2) return;
        const pairs: MatchPair[] = [];
        for (let i = 0; i + 1 < data.length && pairs.length < ROUNDS; i += 2) {
          const a = data[i] as any;
          const b = data[i + 1] as any;
          // Elo probability to determine "actual" winner
          const probA = 1 / (1 + Math.pow(10, (b.elo - a.elo) / 400));
          const actualWinnerId = Math.random() < probA ? a.id : b.id;
          pairs.push({ itemA: a, itemB: b, actualWinnerId });
        }
        setMatchPairs(pairs);
      });
  }, [game?.league_id]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "predicting" || !matchPairs[currentPairIndex]) return;
    setTimeLeft(PREDICT_TIME);

    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer);
          handleReveal();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [currentPairIndex, phase, matchPairs.length]);

  const handlePredict = async (itemId: string) => {
    if (myPrediction || !currentRound) return;
    setMyPrediction(itemId);
    try {
      await onSubmitAction(currentRound.id, "predict", {
        pair_index: currentPairIndex,
        predicted_winner_id: itemId,
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReveal = useCallback(async () => {
    if (phase !== "predicting") return;
    setPhase("reveal");

    const pair = matchPairs[currentPairIndex];
    if (!pair || !currentRound) return;

    // Score predictions
    const pairActions = actions.filter(
      a => a.action_type === "predict" && a.round_id === currentRound.id && (a.payload as any)?.pair_index === currentPairIndex
    );

    let newTeam0 = teamScores.team0;
    let newTeam1 = teamScores.team1;

    for (const action of pairActions) {
      const player = players.find(p => p.id === action.player_id);
      if (!player) continue;
      const predicted = (action.payload as any)?.predicted_winner_id;
      if (predicted === pair.actualWinnerId) {
        const playerTeam = teams.find(t => t.id === player.team_id);
        if (playerTeam?.team_index === 0) newTeam0++;
        else newTeam1++;
      }
    }
    setTeamScores({ team0: newTeam0, team1: newTeam1 });

    setTimeout(async () => {
      if (currentPairIndex + 1 >= matchPairs.length) {
        // Game over
        const winnerTeam = newTeam0 >= newTeam1 ? teams[0] : teams[1];
        if (winnerTeam && myPlayer?.is_host) {
          await onUpdateScore(winnerTeam.id, 1);
          await onEndGame({ winner_team_id: winnerTeam.id, team0Score: newTeam0, team1Score: newTeam1 });
        }
        setPhase("finished");
      } else {
        setCurrentPairIndex(p => p + 1);
        setMyPrediction(null);
        setPhase("predicting");
      }
    }, 2500);
  }, [phase, currentPairIndex, matchPairs, actions, players, teams, myPlayer, currentRound, teamScores, onUpdateScore, onEndGame]);

  const pair = matchPairs[currentPairIndex];

  if (!pair) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-muted-foreground mt-4">Loading matchups...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scores */}
      <div className="flex items-center gap-4">
        <div className="flex-1 text-center">
          <div className="text-3xl font-black text-foreground">{teamScores.team0}</div>
          <div className="text-xs text-muted-foreground">Team 1 Correct</div>
        </div>
        <Eye className="h-5 w-5 text-primary" />
        <div className="flex-1 text-center">
          <div className="text-3xl font-black text-foreground">{teamScores.team1}</div>
          <div className="text-xs text-muted-foreground">Team 2 Correct</div>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Round {currentPairIndex + 1} of {ROUNDS}</span>
        {phase === "predicting" && (
          <div className="flex items-center gap-1 text-primary font-bold">
            <Clock className="h-3.5 w-3.5" />
            <span>{timeLeft}s</span>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {phase !== "finished" && (
          <motion.div key={`pair-${currentPairIndex}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
            <p className="text-center text-sm font-semibold text-foreground">Who has higher Aura?</p>
            <div className="grid grid-cols-2 gap-4">
              {[pair.itemA, pair.itemB].map(item => {
                const isCorrect = phase === "reveal" && item.id === pair.actualWinnerId;
                const isWrong = phase === "reveal" && myPrediction === item.id && item.id !== pair.actualWinnerId;

                return (
                  <motion.button
                    key={item.id}
                    onClick={() => handlePredict(item.id)}
                    disabled={!!myPrediction || phase === "reveal"}
                    whileHover={{ scale: myPrediction ? 1 : 1.03 }}
                    whileTap={{ scale: myPrediction ? 1 : 0.97 }}
                    className={`relative p-4 rounded-xl border-2 text-center transition-all overflow-hidden cursor-pointer ${
                      isCorrect
                        ? "border-green-500 bg-green-500/10"
                        : isWrong
                        ? "border-destructive bg-destructive/10"
                        : myPrediction === item.id
                        ? "border-primary bg-primary/10"
                        : myPrediction || phase === "reveal"
                        ? "border-border bg-card opacity-60 cursor-not-allowed"
                        : "border-border bg-card hover:border-primary/50"
                    }`}
                  >
                    {item.image_url && (
                      <img src={item.image_url} alt={item.name} className="w-full h-24 object-cover rounded-lg mb-2" />
                    )}
                    <p className="text-sm font-bold text-foreground">{item.name}</p>
                    {phase === "reveal" && (
                      <div className="mt-2">
                        {isCorrect && <CheckCircle className="h-5 w-5 text-green-500 mx-auto" />}
                        {isWrong && <XCircle className="h-5 w-5 text-destructive mx-auto" />}
                        {!isCorrect && !isWrong && myPrediction !== item.id && (
                          <p className="text-xs text-muted-foreground">Aura: {item.elo}</p>
                        )}
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
            {phase === "reveal" && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`text-center font-bold text-sm ${myPrediction === pair.actualWinnerId ? "text-green-500" : "text-destructive"}`}
              >
                {myPrediction === pair.actualWinnerId ? "✓ Correct!" : "✗ Wrong!"}
              </motion.p>
            )}
          </motion.div>
        )}

        {phase === "finished" && (
          <motion.div key="finished" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
            <Trophy className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-xl font-black text-foreground">Game Over!</p>
            <p className="text-sm text-muted-foreground mt-2">
              Team 1: {teamScores.team0} · Team 2: {teamScores.team1}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
