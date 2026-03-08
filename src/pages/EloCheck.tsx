import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Trophy, History, Zap, Users, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSwipeSound } from "@/hooks/useSwipeSound";
import UserAvatar from "@/components/UserAvatar";
import SEOHead from "@/components/SEOHead";

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
  itemType: string;
}

interface LeaderboardItem {
  id: string;
  name: string;
  imageUrl: string | null;
  swipeCount: number;
  type: "preset" | "user";
}

const AUTO_ADVANCE_DELAY = 2000;

export default function EloCheck() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { playCorrectSound, playWrongSound } = useSwipeSound();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [presetItems, setPresetItems] = useState<GameItem[]>([]);
  const [userItems, setUserItems] = useState<GameItem[]>([]);
  const [pair, setPair] = useState<[GameItem, GameItem] | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [lastGuessCorrect, setLastGuessCorrect] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameMode, setGameMode] = useState<"items" | "users">("items");
  const [mainTab, setMainTab] = useState("play");

  // History
  const [presetHistory, setPresetHistory] = useState<GameResult[]>([]);
  const [userHistory, setUserHistory] = useState<GameResult[]>([]);
  const [presetStats, setPresetStats] = useState({ played: 0, correct: 0 });
  const [userStats, setUserStats] = useState({ played: 0, correct: 0 });

  // Leaderboard
  const [presetLeaderboard, setPresetLeaderboard] = useState<LeaderboardItem[]>([]);
  const [userLeaderboard, setUserLeaderboard] = useState<LeaderboardItem[]>([]);

  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadGame();
    return () => { if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current); };
  }, [user]);

  useEffect(() => {
    // When switching game mode, pick a new pair
    if (!loading) {
      const items = gameMode === "items" ? presetItems : userItems;
      if (items.length >= 2) {
        setRevealed(false);
        setLastGuessCorrect(null);
        setPair(getRandomPair(items));
      } else {
        setPair(null);
      }
    }
  }, [gameMode, loading]);

  const loadGame = async () => {
    let pid: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("user_id", user.id).single();
      if (profile) { pid = profile.id; setProfileId(profile.id); }
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
    const pItems: GameItem[] = [];
    const uItems: GameItem[] = [];

    // Load preset items
    const presetLeagueIds = enabledLeagues.filter(l => l.type === "preset").map(l => l.id);
    if (presetLeagueIds.length > 0) {
      const { data: presetItemsData } = await supabase
        .from("preset_items").select("id, name, image_url, elo, league_id")
        .in("league_id", presetLeagueIds);
      const leagueNameMap = new Map(enabledLeagues.map(l => [l.id, l.name]));
      presetItemsData?.forEach(item => {
        pItems.push({
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
          .from("public_profiles").select("id, display_name, avatar_url")
          .in("id", profileIds);
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        const leagueNameMap = new Map(enabledLeagues.map(l => [l.id, l.name]));
        memberships.forEach(m => {
          const p = profileMap.get(m.profile_id);
          if (p) {
            uItems.push({
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

    setPresetItems(pItems);
    setUserItems(uItems);

    const defaultItems = pItems.length >= 2 ? pItems : uItems;
    if (pItems.length < 2 && uItems.length >= 2) setGameMode("users");
    if (defaultItems.length >= 2) {
      setPair(getRandomPair(defaultItems));
    }

    // Load history & leaderboard
    if (pid) {
      await loadHistory(pid);
      await loadLeaderboard();
    }

    setLoading(false);
  };

  const loadHistory = async (pid: string) => {
    const { data: games } = await supabase
      .from("elo_check_games")
      .select("*")
      .eq("profile_id", pid)
      .order("created_at", { ascending: false })
      .limit(100);

    if (games) {
      const presetGames: GameResult[] = [];
      const userGames: GameResult[] = [];
      let presetCorrect = 0, userCorrect = 0;

      // Get all item/profile names for history display
      const allItemIds = new Set<string>();
      const allProfileIds = new Set<string>();
      games.forEach((g: any) => {
        if (g.item_type === "preset") {
          allItemIds.add(g.shown_item_id);
          allItemIds.add(g.opponent_item_id);
        } else {
          allProfileIds.add(g.shown_item_id);
          allProfileIds.add(g.opponent_item_id);
        }
      });

      const itemNameMap = new Map<string, string>();
      const profileNameMap = new Map<string, string>();

      if (allItemIds.size > 0) {
        const { data: items } = await supabase
          .from("preset_items").select("id, name").in("id", [...allItemIds]);
        items?.forEach(i => itemNameMap.set(i.id, i.name));
      }
      if (allProfileIds.size > 0) {
        const { data: profiles } = await supabase
          .from("public_profiles").select("id, display_name").in("id", [...allProfileIds]);
        profiles?.forEach(p => profileNameMap.set(p.id, p.display_name));
      }

      // Get league names
      const leagueIds = new Set<string>();
      games.forEach((g: any) => { leagueIds.add(g.shown_item_league_id); });
      const leagueNameMap = new Map<string, string>();
      if (leagueIds.size > 0) {
        const { data: lgs } = await supabase
          .from("leagues").select("id, name").in("id", [...leagueIds]);
        lgs?.forEach(l => leagueNameMap.set(l.id, l.name));
      }

      games.forEach((g: any) => {
        const nameMap = g.item_type === "preset" ? itemNameMap : profileNameMap;
        const result: GameResult = {
          id: g.id,
          isCorrect: g.is_correct,
          createdAt: g.created_at,
          shownItemName: nameMap.get(g.shown_item_id) || "Unknown",
          opponentItemName: nameMap.get(g.opponent_item_id) || "Unknown",
          leagueName: leagueNameMap.get(g.shown_item_league_id) || "",
          itemType: g.item_type,
        };
        if (g.item_type === "preset") {
          presetGames.push(result);
          if (g.is_correct) presetCorrect++;
        } else {
          userGames.push(result);
          if (g.is_correct) userCorrect++;
        }
      });

      setPresetHistory(presetGames);
      setUserHistory(userGames);
      setPresetStats({ played: presetGames.length, correct: presetCorrect });
      setUserStats({ played: userGames.length, correct: userCorrect });
    }
  };

  const loadLeaderboard = async () => {
    // Most swiped on preset items
    const { data: presetCounts } = await supabase.rpc("get_elo_check_preset_leaderboard" as any).limit(20);
    // Fallback: manual query
    if (!presetCounts) {
      // We'll do a manual aggregation
      const { data: allGames } = await supabase
        .from("elo_check_games")
        .select("shown_item_id, opponent_item_id, item_type")
        .eq("item_type", "preset")
        .limit(1000);
      if (allGames) {
        const countMap = new Map<string, number>();
        allGames.forEach((g: any) => {
          countMap.set(g.shown_item_id, (countMap.get(g.shown_item_id) || 0) + 1);
          countMap.set(g.opponent_item_id, (countMap.get(g.opponent_item_id) || 0) + 1);
        });
        const sorted = [...countMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
        if (sorted.length > 0) {
          const ids = sorted.map(s => s[0]);
          const { data: items } = await supabase
            .from("preset_items").select("id, name, image_url").in("id", ids);
          const itemMap = new Map(items?.map(i => [i.id, i]) || []);
          setPresetLeaderboard(sorted.map(([id, count]) => {
            const item = itemMap.get(id);
            return {
              id,
              name: item?.name || "Unknown",
              imageUrl: item?.image_url || null,
              swipeCount: count,
              type: "preset",
            };
          }));
        }
      }
    }

    // Most swiped on users
    const { data: allUserGames } = await supabase
      .from("elo_check_games")
      .select("shown_item_id, opponent_item_id, item_type")
      .eq("item_type", "user")
      .limit(1000);
    if (allUserGames) {
      const countMap = new Map<string, number>();
      allUserGames.forEach((g: any) => {
        countMap.set(g.shown_item_id, (countMap.get(g.shown_item_id) || 0) + 1);
        countMap.set(g.opponent_item_id, (countMap.get(g.opponent_item_id) || 0) + 1);
      });
      const sorted = [...countMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      if (sorted.length > 0) {
        const ids = sorted.map(s => s[0]);
        const { data: profiles } = await supabase
          .from("public_profiles").select("id, display_name, avatar_url").in("id", ids);
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        setUserLeaderboard(sorted.map(([id, count]) => {
          const p = profileMap.get(id);
          return {
            id,
            name: p?.display_name || "Unknown",
            imageUrl: p?.avatar_url || null,
            swipeCount: count,
            type: "user",
          };
        }));
      }
    }
  };

  function getRandomPair(items: GameItem[]): [GameItem, GameItem] {
    // Cross-league pairing: pick two random items from any enabled leagues
    if (items.length < 2) {
      return [items[0], items[0]]; // fallback
    }
    let a = 0, b = 0;
    // Try to pick from different leagues for variety, but allow same-league too
    const maxAttempts = 20;
    let attempts = 0;
    do {
      a = Math.floor(Math.random() * items.length);
      b = Math.floor(Math.random() * items.length);
      attempts++;
    } while (a === b && attempts < maxAttempts);
    return [items[a], items[b]];
  }

  const handleGuess = useCallback(async (guessedIndex: 0 | 1) => {
    if (!pair || revealed) return;

    const guessed = pair[guessedIndex];
    const other = pair[guessedIndex === 0 ? 1 : 0];
    const actualHigher = pair[0].elo >= pair[1].elo ? pair[0] : pair[1];
    const isCorrect = guessed.id === actualHigher.id || pair[0].elo === pair[1].elo;

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

    // Auto-advance
    autoAdvanceRef.current = setTimeout(() => {
      handleNext();
    }, AUTO_ADVANCE_DELAY);
  }, [pair, revealed, profileId, playCorrectSound, playWrongSound]);

  const handleNext = useCallback(() => {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    setRevealed(false);
    setLastGuessCorrect(null);
    const items = gameMode === "items" ? presetItems : userItems;
    setPair(getRandomPair(items));
  }, [gameMode, presetItems, userItems]);

  const currentItems = gameMode === "items" ? presetItems : userItems;

  if (loading) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] px-4 py-4 flex flex-col">
      <SEOHead title="Aura Check — Mogsy" description="Guess who's ranked higher in Mogsy's Aura Check game. Test your knowledge across all leagues and prove your ranking instincts." />
      <div className="container mx-auto max-w-2xl flex flex-col flex-1">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/play")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-extrabold text-foreground flex-1">Aura Check</h1>
        </div>

        <Tabs value={mainTab} onValueChange={setMainTab} className="flex-1 flex flex-col">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="play" className="flex-1 gap-1.5"><Zap className="h-3.5 w-3.5" /> Play</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 gap-1.5"><History className="h-3.5 w-3.5" /> History</TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex-1 gap-1.5"><Trophy className="h-3.5 w-3.5" /> Top</TabsTrigger>
          </TabsList>

          {/* ─── PLAY ─── */}
          <TabsContent value="play" className="flex-1 flex flex-col">
            {/* Mode toggle */}
            <div className="flex gap-2 mb-4">
              <Button
                variant={gameMode === "items" ? "default" : "outline"}
                size="sm"
                onClick={() => setGameMode("items")}
                className="flex-1 gap-1.5"
              >
                <Layers className="h-3.5 w-3.5" /> Items
              </Button>
              <Button
                variant={gameMode === "users" ? "default" : "outline"}
                size="sm"
                onClick={() => setGameMode("users")}
                className="flex-1 gap-1.5"
              >
                <Users className="h-3.5 w-3.5" /> Users
              </Button>
            </div>

            {currentItems.length < 2 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-muted-foreground text-sm">Not enough {gameMode === "items" ? "items" : "users"} available.</p>
              </div>
            ) : (
              <>
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

                {pair && (
                  <p className="text-center text-sm text-muted-foreground mb-4">
                    Who's ranked higher in their league?
                  </p>
                )}

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
                        const isOnFire = !revealed && streak >= 3;

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
                                : isOnFire
                                ? "on-fire cursor-pointer hover:scale-[1.01] active:scale-[0.98]"
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

                {/* Result feedback */}
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
                      <Button onClick={handleNext} variant="outline" size="sm" className="gap-2">
                        Skip <Zap className="h-3.5 w-3.5" />
                      </Button>
                      {/* Auto-advance progress bar */}
                      <motion.div
                        className="h-0.5 bg-primary/40 rounded-full"
                        initial={{ width: "100%" }}
                        animate={{ width: "0%" }}
                        transition={{ duration: AUTO_ADVANCE_DELAY / 1000, ease: "linear" }}
                        style={{ maxWidth: "200px" }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {!revealed && pair && (
                  <p className="text-center text-xs text-muted-foreground mt-4">
                    Tap the one you think is ranked higher
                  </p>
                )}
              </>
            )}
          </TabsContent>

          {/* ─── HISTORY ─── */}
          <TabsContent value="history">
            <Tabs defaultValue="items" className="w-full">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="items" className="flex-1 gap-1.5"><Layers className="h-3.5 w-3.5" /> Items</TabsTrigger>
                <TabsTrigger value="users" className="flex-1 gap-1.5"><Users className="h-3.5 w-3.5" /> Users</TabsTrigger>
              </TabsList>

              <TabsContent value="items">
                <HistorySection history={presetHistory} stats={presetStats} />
              </TabsContent>
              <TabsContent value="users">
                <HistorySection history={userHistory} stats={userStats} />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ─── LEADERBOARD ─── */}
          <TabsContent value="leaderboard">
            <Tabs defaultValue="items" className="w-full">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="items" className="flex-1 gap-1.5"><Layers className="h-3.5 w-3.5" /> Items</TabsTrigger>
                <TabsTrigger value="users" className="flex-1 gap-1.5"><Users className="h-3.5 w-3.5" /> Users</TabsTrigger>
              </TabsList>

              <TabsContent value="items">
                <LeaderboardSection items={presetLeaderboard} type="preset" />
              </TabsContent>
              <TabsContent value="users">
                <LeaderboardSection items={userLeaderboard} type="user" />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ─── History Section ─── */
function HistorySection({ history, stats }: { history: GameResult[]; stats: { played: number; correct: number } }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Played</p>
          <p className="text-xl font-black text-foreground">{stats.played}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Correct</p>
          <p className="text-xl font-black text-emerald-400">{stats.correct}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Win Rate</p>
          <p className="text-xl font-black text-primary">
            {stats.played > 0 ? Math.round((stats.correct / stats.played) * 100) : 0}%
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {history.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">No games played yet.</p>
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
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {game.shownItemName} vs {game.opponentItemName}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{game.leagueName}</p>
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {new Date(game.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Leaderboard Section ─── */
function LeaderboardSection({ items, type }: { items: LeaderboardItem[]; type: "preset" | "user" }) {
  if (items.length === 0) {
    return <p className="text-center text-muted-foreground text-sm py-8">No data yet. Play some rounds!</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => {
        const rank = i + 1;
        const isTop3 = rank <= 3;
        const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

        return (
          <div
            key={item.id}
            className={`flex items-center gap-3 rounded-xl border border-border bg-card p-3 ${isTop3 ? "border-primary/20" : ""}`}
          >
            <span className={`w-6 text-center font-black ${isTop3 ? "text-base" : "text-xs text-muted-foreground"}`}>
              {medal || rank}
            </span>
            {type === "preset" ? (
              <div className={`${isTop3 ? "h-10 w-10" : "h-8 w-8"} rounded-full overflow-hidden flex-shrink-0 bg-muted`}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {item.name.charAt(0)}
                  </div>
                )}
              </div>
            ) : (
              <UserAvatar src={item.imageUrl} name={item.name} size={isTop3 ? "sm" : "xs"} />
            )}
            <div className="flex-1 min-w-0">
              <p className={`font-bold truncate ${isTop3 ? "text-sm text-foreground" : "text-xs text-muted-foreground"}`}>
                {item.name}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-primary">{item.swipeCount}</p>
              <p className="text-[9px] text-muted-foreground">appearances</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
