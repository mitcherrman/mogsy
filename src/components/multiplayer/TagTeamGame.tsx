import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Trophy, Clock, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import UserAvatar from "@/components/UserAvatar";
import { toast } from "sonner";
import type { GameState, MultiplayerRound } from "@/hooks/useMultiplayerGame";

interface TagTeamGameProps extends GameState {
  onSubmitAction: (roundId: string | null, type: string, payload: Record<string, any>) => Promise<any>;
  onUpdateScore: (teamId: string, delta: number) => Promise<void>;
  onEndGame: (result: Record<string, any>) => Promise<void>;
  onNextRound: () => Promise<void>;
}

interface PresetItem {
  id: string;
  name: string;
  image_url: string | null;
  elo: number;
}

const TOTAL_ROUNDS = 3;
const VOTE_TIME = 10;

export default function TagTeamGame({
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
}: TagTeamGameProps) {
  const [items, setItems] = useState<PresetItem[]>([]);
  const [myPick, setMyPick] = useState<string | null>(null);
  const [votedFor, setVotedFor] = useState<"team0" | "team1" | null>(null);
  const [timeLeft, setTimeLeft] = useState(VOTE_TIME);
  const [phase, setPhase] = useState<"picking" | "voting" | "results">("picking");

  // Fetch items from the league
  useEffect(() => {
    if (!game?.league_id) return;
    supabase
      .from("preset_items")
      .select("id, name, image_url, elo")
      .eq("league_id", game.league_id)
      .limit(20)
      .then(({ data }) => {
        if (data) setItems(data as PresetItem[]);
      });
  }, [game?.league_id]);

  // Derive phase from round state
  useEffect(() => {
    if (!currentRound) return;
    const state = currentRound.state as any;
    if (state?.phase) setPhase(state.phase);
  }, [currentRound]);

  // Voting timer
  useEffect(() => {
    if (phase !== "voting") return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer);
          handleAutoResolve();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const handlePick = async (itemId: string) => {
    if (!currentRound || myPick) return;
    setMyPick(itemId);
    try {
      await onSubmitAction(currentRound.id, "pick", { item_id: itemId });

      // Check if both teams picked
      const pickActions = actions.filter(a => a.action_type === "pick" && a.round_id === currentRound.id);
      if (pickActions.length >= 1) {
        // Update round state to voting
        await supabase.from("multiplayer_rounds").update({
          state: { phase: "voting" }
        }).eq("id", currentRound.id);
        setPhase("voting");
        setTimeLeft(VOTE_TIME);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleVote = async (teamKey: "team0" | "team1") => {
    if (!currentRound || votedFor) return;
    setVotedFor(teamKey);
    try {
      await onSubmitAction(currentRound.id, "vote", { vote: teamKey });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAutoResolve = useCallback(async () => {
    if (!currentRound || !myPlayer?.is_host) return;
    try {
      const voteActions = actions.filter(a => a.action_type === "vote" && a.round_id === currentRound.id);
      const team0Votes = voteActions.filter(a => (a.payload as any)?.vote === "team0").length;
      const team1Votes = voteActions.filter(a => (a.payload as any)?.vote === "team1").length;
      const winnerTeam = team0Votes >= team1Votes ? teams[0] : teams[1];

      await onUpdateScore(winnerTeam.id, 1);
      await supabase.from("multiplayer_rounds").update({
        state: { phase: "results", winner_team_index: winnerTeam.team_index }
      }).eq("id", currentRound.id);
      setPhase("results");

      // Check if game is over
      const allScores: Record<string, number> = {};
      teams.forEach(t => allScores[t.id] = t.score);
      allScores[winnerTeam.id] = (allScores[winnerTeam.id] || 0) + 1;
      const maxScore = Math.max(...Object.values(allScores));

      if (currentRound.round_number >= TOTAL_ROUNDS || maxScore > TOTAL_ROUNDS / 2) {
        const winnerTeamId = Object.entries(allScores).sort((a, b) => b[1] - a[1])[0][0];
        setTimeout(() => onEndGame({ winner_team_id: winnerTeamId }), 2000);
      } else {
        setTimeout(() => onNextRound(), 2000);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [currentRound, actions, teams, myPlayer, onUpdateScore, onEndGame, onNextRound]);

  const team0 = teams[0];
  const team1 = teams[1];
  const team0Items = actions.filter(a => a.action_type === "pick" && a.round_id === currentRound?.id && players.find(p => p.id === a.player_id)?.team_id === team0?.id);
  const team1Items = actions.filter(a => a.action_type === "pick" && a.round_id === currentRound?.id && players.find(p => p.id === a.player_id)?.team_id === team1?.id);

  return (
    <div className="space-y-6">
      {/* Score header */}
      <div className="flex items-center gap-4">
        <div className="flex-1 text-center">
          <div className="text-3xl font-black text-foreground">{team0?.score ?? 0}</div>
          <div className="text-xs text-muted-foreground">Team 1</div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Swords className="h-5 w-5 text-primary" />
          <span className="text-xs font-bold text-muted-foreground">Round {currentRound?.round_number ?? 1}/{TOTAL_ROUNDS}</span>
        </div>
        <div className="flex-1 text-center">
          <div className="text-3xl font-black text-foreground">{team1?.score ?? 0}</div>
          <div className="text-xs text-muted-foreground">Team 2</div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === "picking" && (
          <motion.div key="picking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-center text-sm text-muted-foreground mb-4">
              {myPick ? "Waiting for others to pick..." : "Pick your item to represent your team!"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {items.slice(0, 8).map(item => (
                <motion.button
                  key={item.id}
                  onClick={() => handlePick(item.id)}
                  disabled={!!myPick}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={`relative p-3 rounded-xl border-2 text-left transition-all overflow-hidden ${
                    myPick === item.id
                      ? "border-primary bg-primary/10"
                      : myPick
                      ? "border-border bg-muted/20 opacity-50 cursor-not-allowed"
                      : "border-border bg-card hover:border-primary/50 cursor-pointer"
                  }`}
                >
                  {item.image_url && (
                    <img src={item.image_url} alt={item.name} className="w-full h-20 object-cover rounded-lg mb-2" />
                  )}
                  <p className="text-sm font-bold truncate text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">Aura: {item.elo}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === "voting" && (
          <motion.div key="voting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Vote for the better team!</p>
              <div className="flex items-center gap-1 text-primary font-bold">
                <Clock className="h-4 w-4" />
                <span>{timeLeft}s</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[{ team: team0, picks: team0Items, key: "team0" as const }, { team: team1, picks: team1Items, key: "team1" as const }].map(({ team, picks, key }) => (
                <motion.button
                  key={key}
                  onClick={() => handleVote(key)}
                  disabled={!!votedFor}
                  whileHover={{ scale: votedFor ? 1 : 1.03 }}
                  whileTap={{ scale: votedFor ? 1 : 0.97 }}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    votedFor === key
                      ? "border-primary bg-primary/10"
                      : votedFor
                      ? "border-border opacity-50 cursor-not-allowed"
                      : "border-border bg-card hover:border-primary/30 cursor-pointer"
                  }`}
                >
                  <div className="text-sm font-bold text-foreground mb-2">Team {team?.team_index !== undefined ? team.team_index + 1 : "?"}</div>
                  {picks.map(pick => {
                    const itemId = (pick.payload as any)?.item_id;
                    const item = items.find(i => i.id === itemId);
                    return item ? (
                      <div key={pick.id} className="text-xs text-muted-foreground truncate">{item.name}</div>
                    ) : null;
                  })}
                  {picks.length === 0 && <div className="text-xs text-muted-foreground">Picking...</div>}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === "results" && (
          <motion.div key="results" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
            <Trophy className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-xl font-black text-foreground">Round Over!</p>
            <p className="text-sm text-muted-foreground mt-2">Next round starting...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
