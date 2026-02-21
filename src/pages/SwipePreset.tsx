import { useState, useCallback, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateElo } from "@/lib/elo";
import { supabase } from "@/integrations/supabase/client";

interface PresetItem {
  id: string;
  name: string;
  image_url: string | null;
  elo: number;
  league_id: string;
}

export default function SwipePreset() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [items, setItems] = useState<PresetItem[]>([]);
  const [pair, setPair] = useState<[PresetItem, PresetItem] | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [leagueName, setLeagueName] = useState("");
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<0 | 1 | null>(null);

  useEffect(() => {
    if (leagueId) loadItems();
  }, [leagueId]);

  const loadItems = async () => {
    const [{ data: league }, { data }] = await Promise.all([
      supabase.from("leagues").select("name").eq("id", leagueId!).single(),
      supabase.from("preset_items").select("*").eq("league_id", leagueId!),
    ]);
    if (league) setLeagueName(league.name);
    if (data && data.length >= 2) {
      setItems(data);
      setPair(getRandomPair(data));
    }
    setLoading(false);
  };

  function getRandomPair(list: PresetItem[], exclude?: [string, string]): [PresetItem, PresetItem] {
    let a: number, b: number;
    do {
      a = Math.floor(Math.random() * list.length);
      b = Math.floor(Math.random() * list.length);
    } while (a === b || (exclude && exclude.includes(list[a].id) && exclude.includes(list[b].id)));
    return [list[a], list[b]];
  }

  const handleChoose = useCallback(
    async (winnerIndex: 0 | 1) => {
      if (!pair || chosen !== null) return;
      setChosen(winnerIndex);
      const winner = pair[winnerIndex];
      const loser = pair[winnerIndex === 0 ? 1 : 0];

      const { newWinnerElo, newLoserElo } = calculateElo(winner.elo, loser.elo);

      await Promise.all([
        supabase.from("matches").insert({
          league_id: leagueId!,
          winner_item_id: winner.id,
          loser_item_id: loser.id,
        }),
        supabase.from("preset_items").update({ elo: newWinnerElo }).eq("id", winner.id),
        supabase.from("preset_items").update({ elo: newLoserElo }).eq("id", loser.id),
      ]);

      // Update local state
      setItems((prev) =>
        prev.map((i) => {
          if (i.id === winner.id) return { ...i, elo: newWinnerElo };
          if (i.id === loser.id) return { ...i, elo: newLoserElo };
          return i;
        })
      );

      setTimeout(() => {
        setMatchCount((c) => c + 1);
        setChosen(null);
        setPair(getRandomPair(items, [pair[0].id, pair[1].id]));
      }, 600);
    },
    [pair, items, leagueId, chosen]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!pair || items.length < 2) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 flex items-center justify-center">
        <p className="text-muted-foreground">Not enough items to compare yet.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/presets">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-foreground">{leagueName}</h1>
            <p className="text-muted-foreground text-sm">
              Votes cast: <span className="text-primary font-bold">{matchCount}</span>
            </p>
          </div>
          <Link to={`/leaderboard/${leagueId}`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Trophy className="h-4 w-4" /> Rankings
            </Button>
          </Link>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`pair-${pair[0].id}-${pair[1].id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {pair.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => handleChoose(idx as 0 | 1)}
                className={`relative rounded-2xl border border-border bg-card overflow-hidden group cursor-pointer text-left transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                  chosen === idx ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="aspect-square w-full bg-secondary flex items-center justify-center overflow-hidden">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-contain p-8 transition-transform duration-300 group-hover:scale-110"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=200`;
                      }}
                    />
                  ) : (
                    <span className="text-6xl font-black text-muted-foreground/30">
                      {item.name.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-bold text-foreground truncate">{item.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Elo: <span className="text-primary font-semibold">{item.elo}</span>
                  </p>
                </div>
              </button>
            ))}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-center my-6">
          <span className="text-2xl font-black text-gradient">VS</span>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Tap the one you prefer. Rankings update instantly.
        </p>
      </div>
    </div>
  );
}
