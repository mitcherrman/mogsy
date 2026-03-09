import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Trophy, Clock, Users, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GameState } from "@/hooks/useMultiplayerGame";

interface HotStreakGameProps extends GameState {
  onSubmitAction: (roundId: string | null, type: string, payload: Record<string, any>) => Promise<any>;
  onUpdateScore: (teamId: string, delta: number) => Promise<void>;
  onEndGame: (result: Record<string, any>) => Promise<void>;
}

interface PresetItem {
  id: string;
  name: string;
  image_url: string | null;
  elo: number;
}

const SWIPE_TIME_PER_TEAM = 60; // 60 seconds per team
const SWIPE_DELAY = 1; // seconds between swipes

export default function HotStreakGame({
  game,
  teams,
  players,
  actions,
  myPlayer,
  myTeam,
  opponentTeam,
  currentRound,
  myProfileId,
  onSubmitAction,
  onUpdateScore,
  onEndGame,
}: HotStreakGameProps) {
  const [items, setItems] = useState<PresetItem[]>([]);
  const [currentChampion, setCurrentChampion] = useState<PresetItem | null>(null);
  const [challenger, setChallenger] = useState<PresetItem | null>(null);
  const [phase, setPhase] = useState<"waiting" | "swiping" | "tagging" | "results">("waiting");
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState({ team0: 0, team1: 0 });
  const [timeLeft, setTimeLeft] = useState(SWIPE_TIME_PER_TEAM);
  const [activeTeamIndex, setActiveTeamIndex] = useState(0);
  const [usedItemIds, setUsedItemIds] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!game?.league_id) return;
    supabase
      .from("preset_items")
      .select("id, name, image_url, elo")
      .eq("league_id", game.league_id)
      .order("elo", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) {
          const shuffled = [...data as PresetItem[]].sort(() => Math.random() - 0.5);
          setItems(shuffled);
        }
      });
  }, [game?.league_id]);

  const isMyTeamActive = myTeam?.team_index === activeTeamIndex;
  const isMyTurn = isMyTeamActive && myPlayer != null;

  const getRandomItem = (exclude: Set<string>): PresetItem | null => {
    const available = items.filter(it => !exclude.has(it.id));
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
  };

  const startSwipe = () => {
    if (items.length === 0) return;
    const newUsed = new Set(usedItemIds);
    const champ = getRandomItem(newUsed);
    if (!champ) return;
    newUsed.add(champ.id);
    const chal = getRandomItem(newUsed);
    if (!chal) return;
    newUsed.add(chal.id);
    setUsedItemIds(newUsed);
    setCurrentChampion(champ);
    setChallenger(chal);
    setStreak(0);
    setPhase("swiping");
    setTimeLeft(SWIPE_TIME_PER_TEAM);
    startTimer();
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleTimeUp();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const handleTimeUp = () => {
    setPhase("tagging");
    if (myPlayer?.is_host) {
      const nextTeam = 1 - activeTeamIndex;
      if (nextTeam === 0 || (bestStreak.team0 > 0 && bestStreak.team1 > 0)) {
        // Game over
        finishGame();
      } else {
        setActiveTeamIndex(nextTeam);
        setPhase("waiting");
      }
    }
  };

  const finishGame = async () => {
    const winnerTeamIndex = bestStreak.team0 >= bestStreak.team1 ? 0 : 1;
    const winnerTeam = teams[winnerTeamIndex];
    if (winnerTeam && myPlayer?.is_host) {
      await onUpdateScore(winnerTeam.id, 1);
      await onEndGame({ winner_team_id: winnerTeam.id, ...bestStreak });
    }
    setPhase("results");
  };

  const handleSwipe = async (winner: PresetItem, loser: PresetItem) => {
    if (!currentRound) return;
    const prob = 1 / (1 + Math.pow(10, (loser.elo - winner.elo) / 400));
    const isCorrect = Math.random() < prob; // In real game: user swipes wins

    if (isCorrect) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      const teamKey = activeTeamIndex === 0 ? "team0" : "team1";
      setBestStreak(prev => ({
        ...prev,
        [teamKey]: Math.max(prev[teamKey], newStreak),
      }));

      // Get next challenger
      const newUsed = new Set(usedItemIds);
      newUsed.add(winner.id);
      newUsed.add(loser.id);
      const nextChal = getRandomItem(newUsed);
      setUsedItemIds(newUsed);

      if (nextChal) {
        setCurrentChampion(winner);
        setChallenger(nextChal);
      } else {
        handleTimeUp();
      }

      await onSubmitAction(currentRound.id, "swipe", {
        champion_id: winner.id,
        loser_id: loser.id,
        streak: newStreak,
        team_index: activeTeamIndex,
      });
    } else {
      // Lost — tag partner
      setStreak(0);
      setPhase("tagging");
      toast.info("Streak broken! Time to tag your partner.");
      setTimeout(() => {
        const newUsed = new Set(usedItemIds);
        const newChamp = getRandomItem(newUsed);
        if (!newChamp) { handleTimeUp(); return; }
        const newChal = getRandomItem(new Set([...newUsed, newChamp.id]));
        if (!newChal) { handleTimeUp(); return; }
        setUsedItemIds(new Set([...newUsed, newChamp.id, newChal.id]));
        setCurrentChampion(newChamp);
        setChallenger(newChal);
        setPhase("swiping");
      }, 1500);
    }
  };

  useEffect(() => { return () => { if (timerRef.current) clearInterval(timerRef.current); }; }, []);

  return (
    <div className="space-y-6">
      {/* Scores */}
      <div className="flex items-center gap-4">
        <div className={`flex-1 text-center p-2 rounded-xl transition-all ${activeTeamIndex === 0 ? "bg-primary/10 border-2 border-primary" : ""}`}>
          <div className="text-2xl font-black text-foreground">{bestStreak.team0}</div>
          <div className="text-xs text-muted-foreground">Team 1 Best</div>
        </div>
        <Flame className="h-5 w-5 text-orange-500" />
        <div className={`flex-1 text-center p-2 rounded-xl transition-all ${activeTeamIndex === 1 ? "bg-primary/10 border-2 border-primary" : ""}`}>
          <div className="text-2xl font-black text-foreground">{bestStreak.team1}</div>
          <div className="text-xs text-muted-foreground">Team 2 Best</div>
        </div>
      </div>

      {phase === "swiping" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-bold text-foreground">Streak: {streak}</span>
          </div>
          <div className="flex items-center gap-1 text-primary font-bold">
            <Clock className="h-4 w-4" />
            <span>{timeLeft}s</span>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {phase === "waiting" && (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center space-y-4 py-8">
            <Users className="h-12 w-12 text-primary mx-auto" />
            <p className="text-xl font-black text-foreground">
              Team {activeTeamIndex + 1}'s Turn
            </p>
            <p className="text-sm text-muted-foreground">
              {isMyTeamActive ? "Get ready to swipe!" : "Cheer on the other team!"}
            </p>
            {isMyTurn && (
              <motion.button
                onClick={startSwipe}
                disabled={items.length === 0}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-lg mx-auto block"
              >
                Start Swiping!
              </motion.button>
            )}
          </motion.div>
        )}

        {phase === "swiping" && currentChampion && challenger && (
          <motion.div key="swiping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <p className="text-center text-sm font-semibold text-foreground">
              {isMyTurn ? "Pick the one with higher Aura!" : "Watching..."}
            </p>
            <div className="grid grid-cols-2 gap-4">
              {[currentChampion, challenger].map(item => (
                <motion.button
                  key={item.id}
                  onClick={() => isMyTurn && handleSwipe(item, item === currentChampion ? challenger : currentChampion)}
                  disabled={!isMyTurn}
                  whileHover={{ scale: isMyTurn ? 1.04 : 1 }}
                  whileTap={{ scale: isMyTurn ? 0.96 : 1 }}
                  className={`p-4 rounded-xl border-2 text-center transition-all overflow-hidden ${
                    isMyTurn
                      ? "border-border bg-card hover:border-primary cursor-pointer"
                      : "border-border bg-card cursor-not-allowed opacity-70"
                  }`}
                >
                  {item.image_url && (
                    <img src={item.image_url} alt={item.name} className="w-full h-28 object-cover rounded-lg mb-2" />
                  )}
                  <p className="text-sm font-bold text-foreground">{item.name}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === "tagging" && (
          <motion.div key="tagging" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-8">
            <ArrowRight className="h-12 w-12 text-primary mx-auto mb-3 animate-bounce" />
            <p className="text-xl font-black text-foreground">Tag your partner!</p>
          </motion.div>
        )}

        {phase === "results" && (
          <motion.div key="results" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
            <Trophy className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-xl font-black text-foreground">Game Over!</p>
            <p className="text-sm text-muted-foreground mt-2">
              Team 1: {bestStreak.team0} · Team 2: {bestStreak.team1}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
