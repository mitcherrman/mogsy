import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Castle, Swords, Clock, Trophy, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GameState } from "@/hooks/useMultiplayerGame";

interface SiegeGameProps extends GameState {
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

const TOWER_SIZE = 3;
const ATTACK_TIME = 20;

export default function SiegeGame({
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
}: SiegeGameProps) {
  const [items, setItems] = useState<PresetItem[]>([]);
  const [phase, setPhase] = useState<"setup" | "attack" | "results">("setup");
  const [timeLeft, setTimeLeft] = useState(ATTACK_TIME);

  const [myTower, setMyTower] = useState<string[]>([]);      // item ids my team defends
  const [enemyTower, setEnemyTower] = useState<string[]>([]); // item ids enemy defends
  const [destroyed, setDestroyed] = useState<Set<string>>(new Set());
  const [selectedAttacker, setSelectedAttacker] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [attackLog, setAttackLog] = useState<{ attId: string; defId: string; success: boolean }[]>([]);

  useEffect(() => {
    if (!game?.league_id) return;
    supabase
      .from("preset_items")
      .select("id, name, image_url, elo")
      .eq("league_id", game.league_id)
      .order("elo", { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setItems(data as PresetItem[]); });
  }, [game?.league_id]);

  useEffect(() => {
    if (!currentRound) return;
    const state = currentRound.state as any;
    if (state?.phase) setPhase(state.phase);
    if (state?.myTower) setMyTower(state.myTower);
    if (state?.enemyTower) setEnemyTower(state.enemyTower);
    if (state?.destroyed) setDestroyed(new Set(state.destroyed));
    if (state?.attackLog) setAttackLog(state.attackLog);
  }, [currentRound]);

  const handleTowerPick = async (itemId: string) => {
    if (myTower.length >= TOWER_SIZE) return;
    const newTower = [...myTower, itemId];
    setMyTower(newTower);
    if (newTower.length === TOWER_SIZE && currentRound) {
      await onSubmitAction(currentRound.id, "submit", { tower: newTower });
    }
  };

  // Check if both towers are set → move to attack phase
  const setupActions = actions.filter(a => a.action_type === "submit");
  const bothTowersSet = setupActions.length >= 2;

  useEffect(() => {
    if (bothTowersSet && phase === "setup" && currentRound && myPlayer?.is_host) {
      const team0Tower = (setupActions.find(a => players.find(p => p.id === a.player_id)?.team_id === teams[0]?.id)?.payload as any)?.tower || [];
      const team1Tower = (setupActions.find(a => players.find(p => p.id === a.player_id)?.team_id === teams[1]?.id)?.payload as any)?.tower || [];
      supabase.from("multiplayer_rounds").update({
        state: { phase: "attack", team0Tower, team1Tower, destroyed: [], attackLog: [] }
      }).eq("id", currentRound.id);
      setPhase("attack");
      setEnemyTower(myTeam?.team_index === 0 ? team1Tower : team0Tower);
    }
  }, [bothTowersSet, phase]);

  // Attack timer
  useEffect(() => {
    if (phase !== "attack") return;
    setTimeLeft(ATTACK_TIME);
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timer); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const handleAttack = async () => {
    if (!selectedAttacker || !selectedTarget || !currentRound) return;
    const attacker = items.find(it => it.id === selectedAttacker);
    const defender = items.find(it => it.id === selectedTarget);
    if (!attacker || !defender) return;

    const prob = 1 / (1 + Math.pow(10, (defender.elo - attacker.elo) / 400));
    const success = Math.random() < prob;

    const newLog = [...attackLog, { attId: selectedAttacker, defId: selectedTarget, success }];
    const newDestroyed = new Set(destroyed);
    if (success) newDestroyed.add(selectedTarget);

    setAttackLog(newLog);
    setDestroyed(newDestroyed);
    setSelectedAttacker(null);
    setSelectedTarget(null);

    // Check win condition
    if (newDestroyed.size >= TOWER_SIZE) {
      if (myPlayer?.is_host) {
        const winnerTeam = myTeam!;
        await onUpdateScore(winnerTeam.id, 1);
        await supabase.from("multiplayer_rounds").update({
          state: { phase: "results", winner_team_id: winnerTeam.id }
        }).eq("id", currentRound.id);
        setPhase("results");
        setTimeout(() => onEndGame({ winner_team_id: winnerTeam.id }), 2000);
      }
    } else {
      await onSubmitAction(currentRound.id, "attack", { attId: selectedAttacker, defId: selectedTarget, success });
    }
  };

  const pickedItemIds = new Set(myTower);
  const availableItems = items.filter(it => !pickedItemIds.has(it.id));

  return (
    <div className="space-y-6">
      {/* Score */}
      <div className="flex items-center gap-4">
        <div className="flex-1 text-center">
          <div className="text-3xl font-black text-foreground">{teams[0]?.score ?? 0}</div>
          <div className="text-xs text-muted-foreground">Team 1</div>
        </div>
        <Castle className="h-5 w-5 text-primary" />
        <div className="flex-1 text-center">
          <div className="text-3xl font-black text-foreground">{teams[1]?.score ?? 0}</div>
          <div className="text-xs text-muted-foreground">Team 2</div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === "setup" && (
          <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <p className="text-center text-sm font-semibold text-foreground">
              {myTower.length < TOWER_SIZE ? `Pick ${TOWER_SIZE - myTower.length} more item${TOWER_SIZE - myTower.length !== 1 ? "s" : ""} for your tower` : "Tower set! Waiting for opponent..."}
            </p>

            {/* My tower preview */}
            <div className="p-3 rounded-xl border-2 border-primary bg-primary/5">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Your Tower</span>
              </div>
              <div className="flex gap-2">
                {Array.from({ length: TOWER_SIZE }).map((_, i) => {
                  const item = items.find(it => it.id === myTower[i]);
                  return (
                    <div key={i} className={`flex-1 p-2 rounded-lg border text-center ${item ? "border-primary bg-primary/10" : "border-dashed border-muted"}`}>
                      {item ? <p className="text-xs font-bold truncate text-foreground">{item.name}</p> : <p className="text-xs text-muted-foreground">—</p>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {items.map(item => (
                <motion.button
                  key={item.id}
                  onClick={() => handleTowerPick(item.id)}
                  disabled={myTower.includes(item.id) || myTower.length >= TOWER_SIZE}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    myTower.includes(item.id)
                      ? "border-primary bg-primary/10 cursor-not-allowed"
                      : myTower.length >= TOWER_SIZE
                      ? "border-border bg-muted/20 opacity-50 cursor-not-allowed"
                      : "border-border bg-card hover:border-primary/50 cursor-pointer"
                  }`}
                >
                  {item.image_url && <img src={item.image_url} alt={item.name} className="w-full h-14 object-cover rounded-lg mb-1" />}
                  <p className="text-xs font-bold truncate text-foreground">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">Aura: {item.elo}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === "attack" && (
          <motion.div key="attack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">Select attacker → target</p>
              <div className="flex items-center gap-1 text-primary font-bold">
                <Clock className="h-4 w-4" />
                <span>{timeLeft}s</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* My roster */}
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-2">YOUR ITEMS</p>
                <div className="space-y-2">
                  {myTower.map(itemId => {
                    const item = items.find(it => it.id === itemId);
                    return item ? (
                      <motion.button
                        key={itemId}
                        onClick={() => setSelectedAttacker(itemId)}
                        whileHover={{ scale: 1.02 }}
                        className={`w-full p-2 rounded-lg border-2 text-left cursor-pointer transition-all ${
                          selectedAttacker === itemId ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/30"
                        }`}
                      >
                        <p className="text-xs font-bold truncate text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">Aura: {item.elo}</p>
                      </motion.button>
                    ) : null;
                  })}
                </div>
              </div>

              {/* Enemy tower */}
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-2">ENEMY TOWER</p>
                <div className="space-y-2">
                  {enemyTower.map(itemId => {
                    const item = items.find(it => it.id === itemId);
                    const isDestroyed = destroyed.has(itemId);
                    return item ? (
                      <motion.button
                        key={itemId}
                        onClick={() => !isDestroyed && setSelectedTarget(itemId)}
                        disabled={isDestroyed}
                        whileHover={{ scale: isDestroyed ? 1 : 1.02 }}
                        className={`w-full p-2 rounded-lg border-2 text-left transition-all ${
                          isDestroyed
                            ? "border-border bg-muted/20 opacity-40 cursor-not-allowed line-through"
                            : selectedTarget === itemId
                            ? "border-destructive bg-destructive/10 cursor-pointer"
                            : "border-border bg-card hover:border-destructive/30 cursor-pointer"
                        }`}
                      >
                        <p className="text-xs font-bold truncate text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">Aura: {item.elo}</p>
                        {isDestroyed && <span className="text-[10px] text-destructive font-bold">DESTROYED</span>}
                      </motion.button>
                    ) : null;
                  })}
                </div>
              </div>
            </div>

            {selectedAttacker && selectedTarget && (
              <motion.button
                onClick={handleAttack}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2"
              >
                <Swords className="h-4 w-4" />
                Attack!
              </motion.button>
            )}

            {/* Attack log */}
            {attackLog.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground">BATTLE LOG</p>
                {attackLog.slice(-3).map((log, i) => {
                  const att = items.find(it => it.id === log.attId);
                  const def = items.find(it => it.id === log.defId);
                  return (
                    <p key={i} className={`text-xs ${log.success ? "text-green-500" : "text-destructive"}`}>
                      {att?.name} vs {def?.name}: {log.success ? "✓ Destroyed!" : "✗ Blocked"}
                    </p>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {phase === "results" && (
          <motion.div key="results" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
            <Trophy className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-xl font-black text-foreground">Siege Won!</p>
            <p className="text-sm text-muted-foreground mt-2">
              {destroyed.size}/{TOWER_SIZE} towers destroyed
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
