import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";
import MultiplayerModeCard from "@/components/multiplayer/MultiplayerModeCard";
import { useMultiplayerSettings, useMultiplayerGame, useAvailableGames, type MultiplayerMode } from "@/hooks/useMultiplayerGame";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const MODES: MultiplayerMode[] = ["tag_team", "draft_duel", "prediction_wars", "siege", "hot_streak"];

export default function Multiplayer() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings, loading: settingsLoading, isEnabled } = useMultiplayerSettings();
  const { games: openGames, loading: gamesLoading } = useAvailableGames();
  const [creating, setCreating] = useState(false);
  const [selectedMode, setSelectedMode] = useState<MultiplayerMode | null>(null);
  const [leagues, setLeagues] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const { myProfileId, createGame } = useMultiplayerGame(null);

  useEffect(() => {
    supabase
      .from("leagues")
      .select("id, name, type")
      .eq("type", "preset")
      .limit(20)
      .then(({ data }) => { if (data) setLeagues(data); });
  }, []);

  const handleCreateGame = async () => {
    if (!selectedMode || !selectedLeague) {
      toast.error("Select a mode and league first");
      return;
    }
    setCreating(true);
    try {
      const result = await createGame(selectedMode, selectedLeague, "preset", null, {});
      navigate(`/multiplayer/game/${result.game_id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinGame = (gameId: string) => {
    navigate(`/multiplayer/game/${gameId}`);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Please sign in to play multiplayer.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <SEOHead title="Multiplayer — Mogsy" description="Play 2v2 games with friends." />

      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/play")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Multiplayer
          </h1>
          <p className="text-xs text-muted-foreground">2v2 games with friends</p>
        </div>
      </div>

      {/* Mode selection */}
      <div className="space-y-3 mb-6">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Choose a Mode</h2>
        {settingsLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : (
          MODES.map(mode => (
            <div key={mode} onClick={() => isEnabled(mode) && setSelectedMode(selectedMode === mode ? null : mode)}>
              <MultiplayerModeCard
                mode={mode}
                onClick={() => isEnabled(mode) && setSelectedMode(selectedMode === mode ? null : mode)}
                disabled={!isEnabled(mode)}
              />
              {selectedMode === mode && isEnabled(mode) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3"
                >
                  <p className="text-xs font-bold text-foreground">Select a League</p>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {leagues.map(l => (
                      <button
                        key={l.id}
                        onClick={() => setSelectedLeague(selectedLeague === l.id ? null : l.id)}
                        className={`p-2 rounded-lg border text-xs font-semibold text-left transition-all ${
                          selectedLeague === l.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-foreground hover:border-primary/40"
                        }`}
                      >
                        {l.name}
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={handleCreateGame}
                    disabled={!selectedLeague || creating}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {creating ? "Creating..." : "Create Game"}
                  </Button>
                </motion.div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Open games to join */}
      {openGames.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Search className="h-4 w-4" /> Open Games
          </h2>
          <div className="space-y-2">
            {openGames.map(game => (
              <div key={game.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground capitalize">{game.mode.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">Waiting for players</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleJoinGame(game.id)}>
                  Join
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
