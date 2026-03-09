import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Trophy, ChevronRight, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GameState } from "@/hooks/useMultiplayerGame";

interface DraftDuelGameProps extends GameState {
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

const PICKS_PER_TEAM = 3;
const DRAFT_TIME = 20;

// Snake draft: 0, 1, 1, 0, 0, 1 (team indices)
const SNAKE_ORDER = [0, 1, 1, 0, 0, 1];

export default function DraftDuelGame({
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
}: DraftDuelGameProps) {
  const [poolItems, setPoolItems] = useState<PresetItem[]>([]);
  const [timeLeft, setTimeLeft] = useState(DRAFT_TIME);
  const [phase, setPhase] = useState<"drafting" | "dueling" | "results">("drafting");

  useEffect(() => {
    if (!game?.league_id) return;
    supabase
      .from("preset_items")
      .select("id, name, image_url, elo")
      .eq("league_id", game.league_id)
      .order("elo", { ascending: false })
      .limit(12)
      .then(({ data }) => { if (data) setPoolItems(data as PresetItem[]); });
  }, [game?.league_id]);

  useEffect(() => {
    if (!currentRound) return;
    const state = currentRound.state as any;
    if (state?.phase) setPhase(state.phase);
  }, [currentRound]);

  // Picks so far from actions
  const pickActions = actions.filter(a => a.action_type === "pick");
  const team0Picks = pickActions.filter(a => players.find(p => p.id === a.player_id)?.team_id === teams[0]?.id);
  const team1Picks = pickActions.filter(a => players.find(p => p.id === a.player_id)?.team_id === teams[1]?.id);

  const currentDraftIndex = pickActions.length;
  const currentDraftTeamIndex = SNAKE_ORDER[currentDraftIndex] ?? -1;
  const draftComplete = pickActions.length >= PICKS_PER_TEAM * 2;
  const isMyTurn = myTeam?.team_index === currentDraftTeamIndex && !draftComplete;

  const pickedItemIds = new Set(pickActions.map(a => (a.payload as any)?.item_id));

  const handleDraftPick = async (itemId: string) => {
    if (!isMyTurn || !currentRound) return;
    try {
      await onSubmitAction(currentRound.id, "pick", { item_id: itemId });

      if (currentDraftIndex + 1 >= PICKS_PER_TEAM * 2) {
        // All picks done, start dueling
        await supabase.from("multiplayer_rounds").update({ state: { phase: "dueling" } }).eq("id", currentRound.id);
        setPhase("dueling");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const simulateDuels = useCallback(async () => {
    if (!myPlayer?.is_host || !currentRound) return;
    let team0Wins = 0;
    let team1Wins = 0;
    const minPicks = Math.min(team0Picks.length, team1Picks.length);
    for (let i = 0; i < minPicks; i++) {
      const item0Id = (team0Picks[i]?.payload as any)?.item_id;
      const item1Id = (team1Picks[i]?.payload as any)?.item_id;
      const item0 = poolItems.find(it => it.id === item0Id);
      const item1 = poolItems.find(it => it.id === item1Id);
      if (!item0 || !item1) continue;
      const prob = 1 / (1 + Math.pow(10, (item1.elo - item0.elo) / 400));
      if (Math.random() < prob) team0Wins++; else team1Wins++;
    }

    const winnerTeam = team0Wins > team1Wins ? teams[0] : teams[1];
    if (winnerTeam) await onUpdateScore(winnerTeam.id, 1);

    await supabase.from("multiplayer_rounds").update({
      state: { phase: "results", team0Wins, team1Wins }
    }).eq("id", currentRound.id);
    setPhase("results");

    setTimeout(() => {
      const winnerScore = Math.max(...teams.map(t => t.score + (t.id === winnerTeam?.id ? 1 : 0)));
      onEndGame({ winner_team_id: winnerTeam?.id, team0Wins, team1Wins });
    }, 3000);
  }, [myPlayer, currentRound, team0Picks, team1Picks, poolItems, teams, onUpdateScore, onEndGame]);

  // Timer during drafting
  useEffect(() => {
    if (phase !== "drafting" || draftComplete) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer);
          if (isMyTurn) {
            const available = poolItems.filter(it => !pickedItemIds.has(it.id));
            if (available[0]) handleDraftPick(available[0].id);
          }
          return DRAFT_TIME;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, draftComplete, isMyTurn]);

  useEffect(() => {
    if (phase === "dueling" && myPlayer?.is_host) {
      simulateDuels();
    }
  }, [phase]);

  const getTeamItemNames = (picks: typeof team0Picks) =>
    picks.map(a => poolItems.find(it => it.id === (a.payload as any)?.item_id)?.name || "?");

  return (
    <div className="space-y-6">
      {/* Score */}
      <div className="flex items-center gap-4">
        <div className="flex-1 text-center">
          <div className="text-3xl font-black text-foreground">{teams[0]?.score ?? 0}</div>
          <div className="text-xs text-muted-foreground">Team 1</div>
        </div>
        <Shuffle className="h-5 w-5 text-primary" />
        <div className="flex-1 text-center">
          <div className="text-3xl font-black text-foreground">{teams[1]?.score ?? 0}</div>
          <div className="text-xs text-muted-foreground">Team 2</div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === "drafting" && (
          <motion.div key="drafting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">
                  {draftComplete ? "Draft complete!" : isMyTurn ? "Your pick!" : `Team ${currentDraftTeamIndex + 1}'s turn`}
                </p>
                <p className="text-xs text-muted-foreground">Pick {currentDraftIndex + 1} of {PICKS_PER_TEAM * 2}</p>
              </div>
              {!draftComplete && (
                <div className="flex items-center gap-1 text-primary font-bold">
                  <Clock className="h-4 w-4" />
                  <span>{timeLeft}s</span>
                </div>
              )}
            </div>

            {/* Team rosters */}
            <div className="grid grid-cols-2 gap-3">
              {[{ label: "Team 1", picks: team0Picks }, { label: "Team 2", picks: team1Picks }].map(({ label, picks }, i) => (
                <div key={i} className={`p-3 rounded-xl border-2 ${myTeam?.team_index === i ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                  <p className="text-xs font-bold text-foreground mb-2">{label}</p>
                  <div className="space-y-1">
                    {getTeamItemNames(picks).map((name, j) => (
                      <div key={j} className="text-xs text-muted-foreground truncate">• {name}</div>
                    ))}
                    {Array.from({ length: PICKS_PER_TEAM - picks.length }).map((_, j) => (
                      <div key={`e-${j}`} className="text-xs text-muted-foreground/30">• —</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Pool */}
            <div className="grid grid-cols-2 gap-2">
              {poolItems.filter(it => !pickedItemIds.has(it.id)).map(item => (
                <motion.button
                  key={item.id}
                  onClick={() => handleDraftPick(item.id)}
                  disabled={!isMyTurn}
                  whileHover={{ scale: isMyTurn ? 1.03 : 1 }}
                  whileTap={{ scale: isMyTurn ? 0.97 : 1 }}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    isMyTurn ? "border-border bg-card hover:border-primary/50 cursor-pointer" : "border-border bg-muted/10 cursor-not-allowed opacity-60"
                  }`}
                >
                  {item.image_url && <img src={item.image_url} alt={item.name} className="w-full h-16 object-cover rounded-lg mb-1" />}
                  <p className="text-xs font-bold truncate text-foreground">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">Aura: {item.elo}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === "dueling" && (
          <motion.div key="dueling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-8">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="text-4xl">⚔️</div>
            </div>
            <p className="text-xl font-black text-foreground">Battle in progress...</p>
            <p className="text-sm text-muted-foreground mt-2">Aura resolving matchups</p>
          </motion.div>
        )}

        {phase === "results" && (
          <motion.div key="results" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
            <Trophy className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-xl font-black text-foreground">Draft Battle Complete!</p>
            {(() => {
              const state = currentRound?.state as any;
              return state?.team0Wins !== undefined ? (
                <p className="text-sm text-muted-foreground mt-2">
                  Team 1: {state.team0Wins}W · Team 2: {state.team1Wins}W
                </p>
              ) : null;
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
