import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Trophy, Crown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import SwipeAd from "@/components/SwipeAd";
import TierBadge from "@/components/TierBadge";
import { getTierFromElo } from "@/lib/mock-data";
import { calculateElo } from "@/lib/elo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface PresetItem {
  id: string;
  name: string;
  image_url: string | null;
  elo: number;
  league_id: string;
}

const AD_INTERVAL = 10;

function generateMatchups(items: PresetItem[]): [PresetItem, PresetItem][] {
  const pairs: [PresetItem, PresetItem][] = [];
  const rounds = 2;
  for (let r = 0; r < rounds; r++) {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      pairs.push([shuffled[i], shuffled[i + 1]]);
    }
  }
  return pairs;
}

export default function SwipePreset() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user } = useAuth();
  const [items, setItems] = useState<PresetItem[]>([]);
  const [matchups, setMatchups] = useState<[PresetItem, PresetItem][]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [leagueName, setLeagueName] = useState("");
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<0 | 1 | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [finished, setFinished] = useState(false);

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
      setMatchups(generateMatchups(data));
    }

    if (user) {
      const { data: profile } = await supabase
        .from("profiles").select("is_pro").eq("user_id", user.id).single();
      if (profile?.is_pro) setIsPro(true);
    }

    setLoading(false);
  };

  const pair = currentIndex < matchups.length ? matchups[currentIndex] : null;
  const progress = matchups.length > 0 ? (currentIndex / matchups.length) * 100 : 0;

  const handleChoose = useCallback(
    async (winnerIndex: 0 | 1) => {
      if (!pair || chosen !== null) return;
      setChosen(winnerIndex);
      const winner = pair[winnerIndex];
      const loser = pair[winnerIndex === 0 ? 1 : 0];

      const currentWinner = items.find(i => i.id === winner.id)!;
      const currentLoser = items.find(i => i.id === loser.id)!;
      const { newWinnerElo, newLoserElo } = calculateElo(currentWinner.elo, currentLoser.elo);

      await Promise.all([
        supabase.from("matches").insert({
          league_id: leagueId!,
          winner_item_id: winner.id,
          loser_item_id: loser.id,
        }),
        supabase.from("preset_items").update({ elo: newWinnerElo }).eq("id", winner.id),
        supabase.from("preset_items").update({ elo: newLoserElo }).eq("id", loser.id),
      ]);

      setItems((prev) =>
        prev.map((i) => {
          if (i.id === winner.id) return { ...i, elo: newWinnerElo };
          if (i.id === loser.id) return { ...i, elo: newLoserElo };
          return i;
        })
      );

      const newCount = matchCount + 1;
      const nextIndex = currentIndex + 1;

      setTimeout(() => {
        setMatchCount(newCount);
        setChosen(null);
        if (nextIndex >= matchups.length) {
          setFinished(true);
        } else if (!isPro && newCount % AD_INTERVAL === 0) {
          setShowAd(true);
        } else {
          setCurrentIndex(nextIndex);
        }
      }, 600);
    },
    [pair, items, leagueId, chosen, matchCount, isPro, currentIndex, matchups.length]
  );

  const handleRestart = () => {
    setMatchups(generateMatchups(items));
    setCurrentIndex(0);
    setMatchCount(0);
    setFinished(false);
  };

  const sortedResults = useMemo(
    () => [...items].sort((a, b) => b.elo - a.elo),
    [items]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!matchups.length || items.length < 2) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 flex items-center justify-center">
        <p className="text-muted-foreground">Not enough items to compare yet.</p>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="container mx-auto max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <Link to="/presets">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-extrabold text-foreground flex-1">{leagueName} Results</h1>
          </div>

          <p className="text-muted-foreground text-sm mb-4">
            You voted <span className="text-primary font-bold">{matchCount}</span> times. Here's how things stand:
          </p>

          <div className="space-y-2">
            {sortedResults.map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 rounded-xl border border-border bg-card p-3 ${idx === 0 ? "ring-2 ring-primary" : ""}`}
              >
                <span className="w-8 text-center font-bold text-muted-foreground">
                  {idx === 0 ? <Crown className="h-5 w-5 text-primary mx-auto" /> : `#${idx + 1}`}
                </span>
                <div className="h-10 w-10 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="h-full w-full object-contain p-1" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                      {item.name.charAt(0)}
                    </span>
                  )}
                </div>
                <span className="font-semibold text-foreground flex-1 truncate">{item.name}</span>
                <span className="text-sm text-primary font-bold">{item.elo}</span>
                <TierBadge tier={getTierFromElo(item.elo)} />
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <Button onClick={handleRestart} variant="outline" className="flex-1 gap-2">
              <RotateCcw className="h-4 w-4" /> Play Again
            </Button>
            <Link to={`/leaderboard/${leagueId}`} className="flex-1">
              <Button className="w-full gap-2">
                <Trophy className="h-4 w-4" /> Full Rankings
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {showAd && (
        <SwipeAd
          isPro={isPro}
          onClose={() => {
            setShowAd(false);
            setCurrentIndex(currentIndex + 1);
          }}
        />
      )}
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/presets">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-extrabold text-foreground">{leagueName}</h1>
              <p className="text-muted-foreground text-sm">
                {currentIndex + 1} / {matchups.length}
              </p>
            </div>
            <Link to={`/leaderboard/${leagueId}`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Trophy className="h-4 w-4" /> Rankings
              </Button>
            </Link>
          </div>

          <Progress value={progress} className="mb-6 h-2" />

          {pair && (
            <AnimatePresence mode="wait">
              <motion.div
                key={`pair-${pair[0].id}-${pair[1].id}-${currentIndex}`}
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
                        <span className="text-6xl font-black text-muted-foreground/30">{item.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="text-lg font-bold text-foreground truncate">{item.name}</h3>
                    </div>
                  </button>
                ))}
              </motion.div>
            </AnimatePresence>
          )}

          <div className="flex items-center justify-center my-6">
            <span className="text-2xl font-black text-gradient">VS</span>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Tap the one you prefer.
          </p>
        </div>
      </div>
    </>
  );
}
