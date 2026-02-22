import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Trophy, History, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSwipeSound } from "@/hooks/useSwipeSound";
import UserAvatar from "@/components/UserAvatar";

interface GameItem {
  id: string;
  name: string;
  imageUrl: string | null;
  elo: number;
  leagueId: string;
  leagueName: string;
  type: "preset" | "user";
}

interface GameResult {
  id: string;
  isCorrect: boolean;
  createdAt: string;
  shownItemName?: string;
  opponentItemName?: string;
  leagueName?: string;
}

export default function EloCheck() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { playCorrectSound, playWrongSound } = useSwipeSound();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<GameItem[]>([]);
  const [pair, setPair] = useState<[GameItem, GameItem] | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [lastGuessCorrect, setLastGuessCorrect] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<GameResult[]>([]);
  const [totalPlayed, setTotalPlayed] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);

  useEffect(() => {
    loadGame();
  }, [user]);

  const loadGame = async () => {
    // Get profile
    if (user) {
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("user_id", user.id).single();
      if (profile) setProfileId(profile.id);
    }

    // Get enabled leagues
    const { data: settings } = await supabase
      .from("elo_check_league_settings").select("league_id, is_enabled");
    const disabledIds = new Set(
      (settings || []).filter(s => !(s as any).is_enabled).map(s => s.league_id)
    );

    const { data: leagues } = await supabase
      .from("leagues").select("id, name, type");
    if (!leagues) { setLoading(false); return; }

    const enabledLeagues = leagues.filter(l => !disabledIds.has(l.id));
    const items: GameItem[] = [];

    // Load preset items
    const presetLeagueIds = enabledLeagues.filter(l => l.type === "preset").map(l => l.id);
    if (presetLeagueIds.length > 0) {
      const { data: presetItems } = await supabase
        .from("preset_items").select("id, name, image_url, elo, league_id")
        .in("league_id", presetLeagueIds);
      const leagueNameMap = new Map(enabledLeagues.map(l => [l.id, l.name]));
      presetItems?.forEach(item => {
        items.push({
          id: item.id,
          name: item.name,
          imageUrl: item.image_url,
          elo: item.elo,
          leagueId: item.league_id,
          leagueName: leagueNameMap.get(item.league_id) || "",
          type: "preset",
        });
      });
    }

    // Load user league memberships
    const userLeagueIds = enabledLeagues.filter(l => l.type === "user").map(l => l.id);
    if (userLeagueIds.length > 0) {
      const { data: memberships } = await supabase
        .from("league_memberships").select("profile_id, elo, league_id")
        .in("league_id", userLeagueIds);
      if (memberships && memberships.length > 0) {
        const profileIds = [...new Set(memberships.map(m => m.profile_id))];
        const { data: profiles } = await supabase
          .from("profiles").select("id, display_name, avatar_url")
          .in("id", profileIds);
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        const leagueNameMap = new Map(enabledLeagues.map(l => [l.id, l.name]));
        memberships.forEach(m => {
          const p = profileMap.get(m.profile_id);
          if (p) {
            items.push({
              id: `${m.profile_id}_${m.league_id}`,
              name: p.display_name,
              imageUrl: p.avatar_url,
              elo: m.elo,
              leagueId: m.league_id,
              leagueName: leagueNameMap.get(m.league_id) || "",
              type: "user",
            });
          }
        });
      }
    }

    setAllItems(items);
    if (items.length >= 2) {
      setPair(getRandomPair(items));
    }

    // Load history
    if (user) {
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("user_id", user.id).single();
      if (profile) {
        const { data: games, count } = await supabase
          .from("elo_check_games")
          .select("*", { count: "exact" })
          .eq("profile_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (games) {
          setHistory(games.map((g: any) => ({
            id: g.id,
            isCorrect: g.is_correct,
            createdAt: g.created_at,
          })));
          setTotalPlayed(count || 0);
          setTotalCorrect(games.filter((g: any) => g.is_correct).length);
        }
      }
    }

    setLoading(false);
  };

  function getRandomPair(items: GameItem[]): [GameItem, GameItem] {
    // Pick two items from the same league for fair comparison
    const leagueGroups = new Map<string, GameItem[]>();
    items.forEach(item => {
      const list = leagueGroups.get(item.leagueId) || [];
      list.push(item);
      leagueGroups.set(item.leagueId, list);
    });

    // Filter leagues with at least 2 items
    const validLeagues = [...leagueGroups.entries()].filter(([, v]) => v.length >= 2);
    if (validLeagues.length === 0) {
      // Fallback: any two items
      let a = 0, b = 0;
      while (a === b) {
        a = Math.floor(Math.random() * items.length);
        b = Math.floor(Math.random() * items.length);
      }
      return [items[a], items[b]];
    }

    const [, leagueItems] = validLeagues[Math.floor(Math.random() * validLeagues.length)];
    let a = 0, b = 0;
    while (a === b) {
      a = Math.floor(Math.random() * leagueItems.length);
      b = Math.floor(Math.random() * leagueItems.length);
    }
    return [leagueItems[a], leagueItems[b]];
  }

  const handleGuess = useCallback(async (guessedIndex: 0 | 1) => {
    if (!pair || revealed) return;

    const guessed = pair[guessedIndex];
    const other = pair[guessedIndex === 0 ? 1 : 0];

    // Determine actual higher
    const actualHigher = pair[0].elo >= pair[1].elo ? pair[0] : pair[1];
    const isCorrect = guessed.id === actualHigher.id || pair[0].elo === pair[1].elo; // tie = always correct

    setRevealed(true);
    setLastGuessCorrect(isCorrect);

    if (isCorrect) {
      playCorrectSound();
      setScore(s => s + 1);
      setStreak(s => {
        const newStreak = s + 1;
        setBestStreak(b => Math.max(b, newStreak));
        return newStreak;
      });
    } else {
      playWrongSound();
      setScore(s => Math.max(0, s - 1));
      setStreak(0);
    }

    // Save to DB
    if (profileId) {
      await supabase.from("elo_check_games").insert({
        profile_id: profileId,
        item_type: guessed.type,
        shown_item_id: pair[0].type === "user" ? pair[0].id.split("_")[0] : pair[0].id,
        shown_item_league_id: pair[0].leagueId,
        opponent_item_id: pair[1].type === "user" ? pair[1].id.split("_")[0] : pair[1].id,
        opponent_item_league_id: pair[1].leagueId,
        guessed_higher_id: guessed.type === "user" ? guessed.id.split("_")[0] : guessed.id,
        actual_higher_id: actualHigher.type === "user" ? actualHigher.id.split("_")[0] : actualHigher.id,
        is_correct: isCorrect,
      });
    }
  }, [pair, revealed, profileId, playCorrectSound, playWrongSound]);

  const handleNext = useCallback(() => {
    setRevealed(false);
    setLastGuessCorrect(null);
    setPair(getRandomPair(allItems));
  }, [allItems]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (allItems.length < 2) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 flex items-center justify-center">
        <p className="text-muted-foreground">Not enough items available for Elo Check.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-background px-4 py-4 flex flex-col">
      <div className="container mx-auto max-w-2xl flex flex-col flex-1">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-extrabold text-foreground flex-1">Elo Check</h1>
        </div>

        <Tabs defaultValue="play" className="flex-1 flex flex-col">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="play" className="flex-1 gap-1.5"><Zap className="h-3.5 w-3.5" /> Play</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 gap-1.5"><History className="h-3.5 w-3.5" /> History</TabsTrigger>
          </TabsList>

          <TabsContent value="play" className="flex-1 flex flex-col">
            {/* Score bar */}
            <div className="flex items-center justify-center gap-6 mb-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Score</p>
                <p className="text-2xl font-black text-primary">{score}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Streak</p>
                <p className="text-2xl font-black text-foreground">{streak}🔥</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Best</p>
                <p className="text-2xl font-black text-muted-foreground">{bestStreak}</p>
              </div>
            </div>

            <p className="text-center text-sm text-muted-foreground mb-4">
              Who's ranked higher in <span className="font-bold text-foreground">{pair?.[0].leagueName}</span>?
            </p>

            {/* Cards */}
            {pair && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${pair[0].id}-${pair[1].id}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-2 gap-3 flex-1"
                >
                  {pair.map((item, idx) => {
                    const isHigher = item.elo >= pair[idx === 0 ? 1 : 0].elo;
                    const wasGuessed = revealed && lastGuessCorrect !== null;

                    return (
                      <motion.button
                        key={item.id}
                        onClick={() => handleGuess(idx as 0 | 1)}
                        disabled={revealed}
                        className={`relative rounded-2xl border bg-card overflow-hidden text-left transition-all duration-200 flex flex-col ${
                          revealed
                            ? isHigher
                              ? "border-emerald-500/50 ring-2 ring-emerald-500/30"
                              : "border-red-500/30 opacity-70"
                            : "border-border hover:border-primary/40 hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
                        }`}
                        whileTap={!revealed ? { scale: 0.97 } : undefined}
                      >
                        <div className="aspect-[3/4] w-full bg-muted flex items-center justify-center overflow-hidden relative">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=200`;
                              }}
                            />
                          ) : item.type === "user" ? (
                            <div className="flex items-center justify-center w-full h-full">
                              <UserAvatar src={item.imageUrl} name={item.name} size="xl" />
                            </div>
                          ) : (
                            <span className="text-5xl font-black text-muted-foreground/20">{item.name.charAt(0)}</span>
                          )}

                          {/* Reveal overlay */}
                          <AnimatePresence>
                            {revealed && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className={`absolute inset-0 flex flex-col items-center justify-center ${
                                  isHigher ? "bg-emerald-500/20" : "bg-red-500/20"
                                }`}
                              >
                                <motion.div
                                  initial={{ scale: 0, rotate: -20 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
                                >
                                  {isHigher ? (
                                    <CheckCircle2 className="h-12 w-12 text-emerald-400 drop-shadow-lg" />
                                  ) : (
                                    <XCircle className="h-12 w-12 text-red-400 drop-shadow-lg" />
                                  )}
                                </motion.div>
                                <motion.div
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: 0.2 }}
                                  className="mt-2 rounded-full bg-background/80 backdrop-blur-sm px-3 py-1"
                                >
                                  <span className="text-sm font-bold text-foreground">Elo: {item.elo}</span>
                                </motion.div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="p-3">
                          <h3 className="text-sm font-bold text-foreground truncate">{item.name}</h3>
                          <p className="text-[10px] text-muted-foreground truncate">{item.leagueName}</p>
                          {revealed && (
                            <motion.p
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className={`text-xs font-bold mt-1 ${isHigher ? "text-emerald-400" : "text-red-400"}`}
                            >
                              {isHigher ? "Higher ✓" : "Lower ✗"}
                            </motion.p>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            )}

            {/* Result feedback & next */}
            <AnimatePresence>
              {revealed && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 flex flex-col items-center gap-3"
                >
                  <motion.p
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    className={`text-lg font-black ${lastGuessCorrect ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {lastGuessCorrect ? "Correct! 🎉" : "Wrong! 😬"}
                  </motion.p>
                  <Button onClick={handleNext} className="gap-2">
                    Next Round <Zap className="h-4 w-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {!revealed && (
              <p className="text-center text-xs text-muted-foreground mt-4">
                Tap the one you think is ranked higher
              </p>
            )}
          </TabsContent>

          <TabsContent value="history">
            <div className="space-y-4">
              {/* Stats summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">Played</p>
                  <p className="text-xl font-black text-foreground">{totalPlayed}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">Correct</p>
                  <p className="text-xl font-black text-emerald-400">{totalCorrect}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                  <p className="text-xl font-black text-primary">
                    {totalPlayed > 0 ? Math.round((totalCorrect / totalPlayed) * 100) : 0}%
                  </p>
                </div>
              </div>

              {/* History list */}
              <div className="space-y-1.5">
                {history.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-8">No games played yet. Start guessing!</p>
                ) : (
                  history.map((game) => (
                    <div
                      key={game.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 ${
                        game.isCorrect ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
                      }`}
                    >
                      {game.isCorrect ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${game.isCorrect ? "text-emerald-400" : "text-red-400"}`}>
                          {game.isCorrect ? "Correct" : "Wrong"}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(game.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
