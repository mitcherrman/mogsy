import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Trophy, Crown, RotateCcw, Flag, Eye, EyeOff, Camera, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import SwipeComments from "@/components/SwipeComments";
import { Progress } from "@/components/ui/progress";
import SwipeAd from "@/components/SwipeAd";
import TierBadge from "@/components/TierBadge";
import EloChangeIndicator from "@/components/EloChangeIndicator";
import MatchupCapture from "@/components/MatchupCapture";
import SliceBattleAnimation from "@/components/SliceBattleAnimation";
import { getTierFromElo } from "@/lib/mock-data";
import { calculateElo } from "@/lib/elo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSwipeSound } from "@/hooks/useSwipeSound";
import { useScreenshot } from "@/hooks/useScreenshot";
import { toast } from "sonner";

interface PresetItem {
  id: string;
  name: string;
  image_url: string | null;
  elo: number;
  league_id: string;
}

interface ItemImage {
  id: string;
  preset_item_id: string;
  image_url: string;
  is_hidden: boolean;
  sort_order: number;
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
  const navigate = useNavigate();
  const location = useLocation();
  const captureRef = useRef<HTMLDivElement>(null);
  const { capture } = useScreenshot(captureRef);
  const [items, setItems] = useState<PresetItem[]>([]);
  const [matchups, setMatchups] = useState<[PresetItem, PresetItem][]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [leagueName, setLeagueName] = useState("");
  const [leagueCategory, setLeagueCategory] = useState<string | null>(null);
  const [leagueSubcategory, setLeagueSubcategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<0 | 1 | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showElo, setShowElo] = useState(true);
  const [showRank, setShowRank] = useState(true);
  const [userShowElo, setUserShowElo] = useState(true);
  const [userShowRank, setUserShowRank] = useState(true);
  const [eloChanges, setEloChanges] = useState<Map<string, number>>(new Map());
  const [rankChanges, setRankChanges] = useState<Map<string, { old: number; new: number }>>(new Map());
  const { playSwipeSound } = useSwipeSound();
  const [sliceWinner, setSliceWinner] = useState<0 | 1 | null>(null);
  const pendingAction = useRef<(() => void) | null>(null);

  // Gauntlet mode
  const [gauntletMode, setGauntletMode] = useState(false);
  const [gauntletChampion, setGauntletChampion] = useState<PresetItem | null>(null);
  const [gauntletStreak, setGauntletStreak] = useState(0);
  const [gauntletPair, setGauntletPair] = useState<[PresetItem, PresetItem] | null>(null);

  // Multi-image state
  const [itemImages, setItemImages] = useState<Map<string, ItemImage[]>>(new Map());
  const [currentImageIndex, setCurrentImageIndex] = useState<Map<string, number>>(new Map());

  // Apply theme immediately from navigation state (before data loads) to prevent flash
  useEffect(() => {
    const state = location.state as { subcategory?: string } | null;
    if (state?.subcategory === "League of Legends") {
      document.documentElement.classList.add("theme-lol");
    }
  }, []);

  useEffect(() => {
    if (leagueId) loadItems();
    return () => { document.documentElement.classList.remove("theme-lol"); };
  }, [leagueId]);

  const loadItems = async () => {
    const [{ data: league }, { data }] = await Promise.all([
      supabase.from("leagues").select("name, category, show_elo, show_rank, subcategory").eq("id", leagueId!).single(),
      supabase.from("preset_items").select("*").eq("league_id", leagueId!),
    ]);
    if (league) {
      setLeagueName(league.name);
      setLeagueCategory((league as any).category);
      setLeagueSubcategory((league as any).subcategory ?? null);
      setShowElo((league as any).show_elo ?? true);
      setShowRank((league as any).show_rank ?? true);
      // Check if this is a League of Legends subcategory league
      if ((league as any).subcategory === "League of Legends") {
        document.documentElement.classList.add("theme-lol");
      }
    }
    if (data && data.length >= 2) {
      setItems(data);
      setMatchups(generateMatchups(data));

      const itemIds = data.map(i => i.id);
      const { data: images } = await supabase
        .from("preset_item_images")
        .select("*")
        .in("preset_item_id", itemIds)
        .eq("is_hidden", false)
        .order("sort_order");

      if (images) {
        const map = new Map<string, ItemImage[]>();
        const idxMap = new Map<string, number>();
        images.forEach(img => {
          const list = map.get(img.preset_item_id) || [];
          list.push(img as ItemImage);
          map.set(img.preset_item_id, list);
          if (!idxMap.has(img.preset_item_id)) {
            idxMap.set(img.preset_item_id, Math.floor(Math.random() * (list.length)));
          }
        });
        map.forEach((imgs, itemId) => {
          idxMap.set(itemId, Math.floor(Math.random() * imgs.length));
        });
        setItemImages(map);
        setCurrentImageIndex(idxMap);
      }
    }

    if (user) {
      const { data: profile } = await supabase
        .from("profiles").select("is_pro").eq("user_id", user.id).single();
      if (profile?.is_pro) setIsPro(true);
    }

    setLoading(false);
  };

  const getDisplayImage = (item: PresetItem): string | null => {
    const images = itemImages.get(item.id);
    if (images && images.length > 0) {
      const idx = currentImageIndex.get(item.id) || 0;
      return images[idx % images.length].image_url;
    }
    return item.image_url;
  };

  const getCurrentImageId = (item: PresetItem): string | null => {
    const images = itemImages.get(item.id);
    if (images && images.length > 0) {
      const idx = currentImageIndex.get(item.id) || 0;
      return images[idx % images.length].id;
    }
    return null;
  };

  const handleReportImage = async (item: PresetItem) => {
    if (!user) { toast.error("Sign in to report images"); return; }
    const imageId = getCurrentImageId(item);
    if (!imageId) return;

    const { error } = await supabase.from("image_reports").insert({
      image_id: imageId,
      user_id: user.id,
    });

    if (error) {
      if (error.code === "23505") toast.info("Already reported this image");
      else toast.error("Failed to report");
      return;
    }

    // Auto-hide logic is handled atomically by the database trigger check_and_auto_hide_image()
    // Send a basic report notification (critical auto-hide notification is handled by the trigger)
    await supabase.from("admin_notifications").insert({
      type: "image_report",
      title: `Image reported: ${item.name}`,
      message: `A user reported an image for "${item.name}" as not representative.`,
      metadata: { image_id: imageId, item_id: item.id },
    });

    const images = itemImages.get(item.id);
    if (images && images.length > 1) {
      setCurrentImageIndex(prev => {
        const next = new Map(prev);
        next.set(item.id, ((prev.get(item.id) || 0) + 1) % images.length);
        return next;
      });
    }

    toast.success("Reported — showing a different image");
  };

  const getGauntletChallenger = useCallback((champion: PresetItem): PresetItem => {
    const others = items.filter(i => i.id !== champion.id);
    return others[Math.floor(Math.random() * others.length)];
  }, [items]);

  const pair = gauntletMode
    ? gauntletPair
    : (currentIndex < matchups.length ? matchups[currentIndex] : null);
  const progress = matchups.length > 0 ? (currentIndex / matchups.length) * 100 : 0;

  const rankMap = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.elo - a.elo);
    const map = new Map<string, number>();
    sorted.forEach((item, idx) => map.set(item.id, idx + 1));
    return map;
  }, [items]);

  const executeChoice = useCallback(
    async (winnerIndex: 0 | 1) => {
      if (!pair) return;
      const winner = pair[winnerIndex];
      const loser = pair[winnerIndex === 0 ? 1 : 0];

      const currentWinner = items.find(i => i.id === winner.id)!;
      const currentLoser = items.find(i => i.id === loser.id)!;
      const { newWinnerElo, newLoserElo } = calculateElo(currentWinner.elo, currentLoser.elo);

      const oldRanks = new Map<string, number>();
      [...items].sort((a, b) => b.elo - a.elo).forEach((item, idx) => oldRanks.set(item.id, idx + 1));

      const updatedItems = items.map(i => {
        if (i.id === winner.id) return { ...i, elo: newWinnerElo };
        if (i.id === loser.id) return { ...i, elo: newLoserElo };
        return i;
      });
      const newRanks = new Map<string, number>();
      [...updatedItems].sort((a, b) => b.elo - a.elo).forEach((item, idx) => newRanks.set(item.id, idx + 1));

      setEloChanges(new Map([
        [winner.id, newWinnerElo - currentWinner.elo],
        [loser.id, newLoserElo - currentLoser.elo],
      ]));
      setRankChanges(new Map([
        [winner.id, { old: oldRanks.get(winner.id)!, new: newRanks.get(winner.id)! }],
        [loser.id, { old: oldRanks.get(loser.id)!, new: newRanks.get(loser.id)! }],
      ]));

      const { error: rpcError } = await supabase.rpc("record_preset_match", {
        _league_id: leagueId!,
        _winner_item_id: winner.id,
        _loser_item_id: loser.id,
      });

      if (rpcError) {
        console.error("Preset match RPC error:", rpcError);
      }

      setItems(updatedItems);

      const newCount = matchCount + 1;

      setMatchCount(newCount);
      setChosen(null);
      setEloChanges(new Map());
      setRankChanges(new Map());
      setCurrentImageIndex(prev => {
        const next = new Map(prev);
        pair.forEach(p => {
          const imgs = itemImages.get(p.id);
          if (imgs && imgs.length > 1) {
            next.set(p.id, ((prev.get(p.id) || 0) + 1) % imgs.length);
          }
        });
        return next;
      });

      if (gauntletMode) {
        const updatedWinner = updatedItems.find(i => i.id === winner.id)!;
        setGauntletChampion(updatedWinner);
        setGauntletStreak(prev => {
          if (gauntletChampion && winner.id === gauntletChampion.id) return prev + 1;
          return 1;
        });
        const challenger = getGauntletChallenger(updatedWinner);
        const winnerWasLeft = pair[0].id === winner.id;
        setGauntletPair(winnerWasLeft ? [updatedWinner, challenger] : [challenger, updatedWinner]);
        if (!isPro && newCount % AD_INTERVAL === 0) {
          setShowAd(true);
        }
      } else {
        const nextIndex = currentIndex + 1;
        if (nextIndex >= matchups.length) {
          setFinished(true);
        } else if (!isPro && newCount % AD_INTERVAL === 0) {
          setShowAd(true);
        } else {
          setCurrentIndex(nextIndex);
        }
      }
    },
    [pair, items, leagueId, matchCount, isPro, currentIndex, matchups.length, itemImages, gauntletMode, gauntletChampion]
  );

  const handleChoose = useCallback(
    (winnerIndex: 0 | 1) => {
      if (!pair || chosen !== null || sliceWinner !== null) return;
      setChosen(winnerIndex);
      playSwipeSound();
      // Trigger slice animation
      setSliceWinner(winnerIndex);
      pendingAction.current = () => executeChoice(winnerIndex);
    },
    [pair, chosen, sliceWinner, playSwipeSound, executeChoice]
  );

  const handleSliceComplete = useCallback(() => {
    // Clear chosen state first so the old loser card never renders in faded state
    setChosen(null);
    pendingAction.current?.();
    setSliceWinner(null);
    pendingAction.current = null;
  }, []);

  const handleToggleGauntlet = () => {
    const next = !gauntletMode;
    setGauntletMode(next);
    setGauntletChampion(null);
    setGauntletStreak(0);
    if (next && items.length >= 2) {
      // Start gauntlet with current matchup pair or random pair
      const currentPair = currentIndex < matchups.length ? matchups[currentIndex] : null;
      if (currentPair) {
        setGauntletPair(currentPair);
      } else {
        const shuffled = [...items].sort(() => Math.random() - 0.5);
        setGauntletPair([shuffled[0], shuffled[1]]);
      }
    } else {
      setGauntletPair(null);
    }
  };

  const handleRestart = () => {
    setMatchups(generateMatchups(items));
    setCurrentIndex(0);
    setMatchCount(0);
    setFinished(false);
    setGauntletChampion(null);
    setGauntletStreak(0);
  };

  const handleBack = () => {
    navigate("/play", { state: { restoreCategory: leagueCategory, restoreSubcategory: leagueSubcategory } });
  };

  const sortedResults = useMemo(
    () => [...items].sort((a, b) => b.elo - a.elo),
    [items]
  );

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!matchups.length || items.length < 2) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 flex items-center justify-center">
        <p className="text-muted-foreground">Not enough items to compare yet.</p>
      </div>
    );
  }

  const eloVisible = showElo && userShowElo;
  const rankVisible = showRank && userShowRank;

  if (finished) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="container mx-auto max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={handleBack} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Button>
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
                    <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                      {item.name.charAt(0)}
                    </span>
                  )}
                </div>
                <span className="font-semibold text-foreground flex-1 truncate">{item.name}</span>
                {eloVisible && <span className="text-sm text-primary font-bold">{item.elo}</span>}
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
            if (!gauntletMode) {
              setCurrentIndex(currentIndex + 1);
            }
          }}
        />
      )}
      <div className="min-h-[calc(100dvh-4rem)] bg-background px-3 py-2 md:px-6 md:py-4 flex flex-col">
        <div className="container mx-auto max-w-lg md:max-w-2xl lg:max-w-4xl flex flex-col flex-1">
          {/* Controls bar */}
          <div className="flex items-center gap-2 mb-1.5">
            <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate flex-1 text-center">
              {leagueName}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={capture}
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                title="Save snapshot"
              >
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                variant={gauntletMode ? "default" : "ghost"}
                size="icon"
                onClick={handleToggleGauntlet}
                className={`h-8 w-8 ${gauntletMode ? "text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}
                title={gauntletMode ? "Gauntlet Mode ON" : "Gauntlet Mode OFF"}
              >
                <Swords className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const next = !(userShowElo && userShowRank);
                  setUserShowElo(next);
                  setUserShowRank(next);
                }}
                className="h-8 w-8 text-muted-foreground"
                title={userShowElo && userShowRank ? "Hide Stats" : "Show Stats"}
              >
                {userShowElo && userShowRank ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
              <Link to={`/leaderboard/${leagueId}`}>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                  <Trophy className="h-3.5 w-3.5" /> Rankings
                </Button>
              </Link>
            </div>
          </div>

          {gauntletMode ? (
            <div className="flex items-center justify-center gap-2 mb-2">
              <Swords className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-primary">Gauntlet</span>
              {gauntletStreak > 0 && (
                <span className="text-[10px] font-bold text-muted-foreground">
                  🔥 {gauntletStreak} win streak
                </span>
              )}
            </div>
          ) : (
            <Progress value={progress} className="mb-2 h-1" />
          )}

          {/* Matchup area */}
          {pair && (
            <MatchupCapture ref={captureRef} leagueName={leagueName}>
              {gauntletMode ? (
                /* Gauntlet: render champion stable, only challenger animates */
                <div className="flex flex-col portrait:flex-col landscape:flex-row md:flex-row gap-2 landscape:gap-4 md:gap-5 lg:gap-8 flex-1">
                  {pair.map((item, idx) => {
                    const isChampion = gauntletChampion && item.id === gauntletChampion.id;
                    return (
                      <GauntletCard
                        key={`slot-${idx}`}
                        item={item}
                        idx={idx}
                        isChampion={!!isChampion}
                        matchCount={matchCount}
                        chosen={chosen}
                        rankMap={rankMap}
                        itemImages={itemImages}
                        currentImageIndex={currentImageIndex}
                        eloVisible={eloVisible}
                        rankVisible={rankVisible}
                        items={items}
                        eloChanges={eloChanges}
                        rankChanges={rankChanges}
                        getDisplayImage={getDisplayImage}
                        handleChoose={handleChoose}
                        handleReportImage={handleReportImage}
                      />
                    );
                  })}
                </div>
              ) : (
              <AnimatePresence mode="sync" initial={false}>
                <motion.div
                  key={`pair-${pair[0].id}-${pair[1].id}-${currentIndex}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="flex flex-col portrait:flex-col landscape:flex-row md:flex-row gap-2 landscape:gap-4 md:gap-5 lg:gap-8 flex-1"
                >
                  {pair.map((item, idx) => {
                    const displayImage = getDisplayImage(item);
                    const rank = rankMap.get(item.id);
                    const hasMultipleImages = (itemImages.get(item.id)?.length || 0) > 0;
                    const isWinner = chosen === idx;
                    const isLoser = chosen !== null && chosen !== idx;

                    return (
                      <div key={item.id} className="relative flex flex-col flex-1 min-h-0">
                        <motion.button
                          onClick={() => handleChoose(idx as 0 | 1)}
                          drag={chosen === null ? "x" : false}
                          dragConstraints={{ left: 0, right: 0 }}
                          dragElastic={0.3}
                          onDragEnd={(_e, info) => {
                            if (Math.abs(info.offset.x) > 60) {
                              handleChoose(idx as 0 | 1);
                            }
                          }}
                          whileTap={{ scale: 0.97 }}
                          className={`relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 flex-1 ${
                            isWinner
                              ? "ring-2 ring-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)] scale-[1.02]"
                              : isLoser
                              ? `${sliceWinner !== null ? "opacity-0" : "opacity-50"} scale-[0.97]`
                              : "hover:scale-[1.01]"
                          }`}
                        >
                          {/* Image container - fills available space */}
                          <div className="w-full h-full min-h-[140px] portrait:aspect-[4/3] landscape:aspect-[3/4] md:aspect-[3/4] bg-white overflow-hidden">
                            {displayImage ? (
                              <img
                                src={displayImage}
                                alt={item.name}
                                className="w-full h-full object-contain bg-white"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=200`;
                                }}
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-4xl font-black text-muted-foreground/30">
                                {item.name.charAt(0)}
                              </span>
                            )}
                          </div>

                          {/* Winner crown */}
                          {isWinner && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg"
                            >
                              <Crown className="h-4 w-4" />
                            </motion.div>
                          )}
                        </motion.button>

                        {/* Report button */}
                        {hasMultipleImages && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReportImage(item); }}
                            className="absolute top-2 right-2 h-6 w-6 rounded-full bg-background/70 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors z-10"
                            title="Report image as not representative"
                          >
                            <Flag className="h-3 w-3" />
                          </button>
                        )}

                        {/* Name & stats below image */}
                        <div className="pt-1.5 text-center flex-shrink-0">
                          <h3 className="text-sm md:text-base lg:text-lg font-extrabold text-foreground truncate">{item.name}</h3>
                          <div className="flex items-center justify-center gap-2 mt-0.5">
                            {rankVisible && rank && (
                              <span className="text-[10px] md:text-xs font-semibold text-muted-foreground">#{rank}</span>
                            )}
                            {eloVisible && (
                              <span className="text-[10px] md:text-xs font-bold text-primary">{items.find(i => i.id === item.id)?.elo || item.elo}</span>
                            )}
                          </div>
                        </div>

                        {/* Elo change indicator */}
                        {chosen !== null && (
                          <div className="flex justify-center mt-0.5 flex-shrink-0">
                            <EloChangeIndicator
                              change={eloChanges.get(item.id) ?? null}
                              oldRank={rankChanges.get(item.id)?.old ?? null}
                              newRank={rankChanges.get(item.id)?.new ?? null}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
              )}

              {/* VS badge centered between cards */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-sm md:text-base lg:text-lg font-black text-muted-foreground bg-background/90 border border-border rounded-full px-2.5 py-1 md:px-4 md:py-1.5 shadow-md z-10">VS</span>
              </div>

              {/* Slice battle animation */}
              <SliceBattleAnimation
                winnerSide={sliceWinner}
                loserImageUrl={pair && sliceWinner !== null ? getDisplayImage(pair[sliceWinner === 0 ? 1 : 0]) : null}
                loserName={pair && sliceWinner !== null ? pair[sliceWinner === 0 ? 1 : 0].name : ""}
                onComplete={handleSliceComplete}
              />
            </MatchupCapture>
          )}

          <p className="text-center text-[10px] text-muted-foreground mt-1.5">
            {gauntletMode
              ? `Tap to choose · Winner stays · ${matchCount} votes`
              : `Tap or swipe to choose · ${currentIndex + 1}/${matchups.length}`}
          </p>

          {/* Comments section */}
          {leagueId && <SwipeComments leagueId={leagueId} />}
        </div>
      </div>
    </>
  );
}

/* ─── Gauntlet Card: champion stays stable, challenger fades in ─── */
function GauntletCard({
  item, idx, isChampion, matchCount, chosen, rankMap, itemImages, currentImageIndex,
  eloVisible, rankVisible, items, eloChanges, rankChanges, getDisplayImage, handleChoose, handleReportImage,
}: {
  item: PresetItem; idx: number; isChampion: boolean; matchCount: number;
  chosen: 0 | 1 | null; rankMap: Map<string, number>;
  itemImages: Map<string, ItemImage[]>; currentImageIndex: Map<string, number>;
  eloVisible: boolean; rankVisible: boolean; items: PresetItem[];
  eloChanges: Map<string, number>; rankChanges: Map<string, { old: number; new: number }>;
  getDisplayImage: (item: PresetItem) => string | null;
  handleChoose: (idx: 0 | 1) => void;
  handleReportImage: (item: PresetItem) => void;
}) {
  const displayImage = getDisplayImage(item);
  const rank = rankMap.get(item.id);
  const hasMultipleImages = (itemImages.get(item.id)?.length || 0) > 0;
  const isWinner = chosen === idx;
  const isLoser = chosen !== null && chosen !== idx;

  const cardContent = (
    <div className="relative flex flex-col flex-1 min-h-0">
      <motion.button
        onClick={() => handleChoose(idx as 0 | 1)}
        drag={chosen === null ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.3}
        onDragEnd={(_e: any, info: any) => {
          if (Math.abs(info.offset.x) > 60) handleChoose(idx as 0 | 1);
        }}
        whileTap={{ scale: 0.97 }}
        className={`relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 flex-1 ${
          isChampion && chosen === null ? "champion-stay ring-2 ring-primary/40" : ""
        } ${
          isWinner
            ? "ring-2 ring-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)] scale-[1.02]"
            : isLoser
            ? "opacity-50 scale-[0.97]"
            : "hover:scale-[1.01]"
        }`}
      >
        <div className="w-full h-full min-h-[140px] portrait:aspect-[4/3] landscape:aspect-[3/4] md:aspect-[3/4] bg-white overflow-hidden">
          {displayImage ? (
            <img src={displayImage} alt={item.name} className="w-full h-full object-contain bg-white"
              onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=200`; }}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-4xl font-black text-muted-foreground/30">{item.name.charAt(0)}</span>
          )}
        </div>
        {isWinner && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="absolute top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg">
            <Crown className="h-4 w-4" />
          </motion.div>
        )}
      </motion.button>
      {hasMultipleImages && (
        <button onClick={(e) => { e.stopPropagation(); handleReportImage(item); }}
          className="absolute top-2 right-2 h-6 w-6 rounded-full bg-background/70 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors z-10"
          title="Report image as not representative">
          <Flag className="h-3 w-3" />
        </button>
      )}
      <div className="pt-1.5 text-center flex-shrink-0">
        <h3 className="text-sm md:text-base lg:text-lg font-extrabold text-foreground truncate">{item.name}</h3>
        <div className="flex items-center justify-center gap-2 mt-0.5">
          {rankVisible && rank && <span className="text-[10px] md:text-xs font-semibold text-muted-foreground">#{rank}</span>}
          {eloVisible && <span className="text-[10px] md:text-xs font-bold text-primary">{items.find(i => i.id === item.id)?.elo || item.elo}</span>}
        </div>
      </div>
      {chosen !== null && (
        <div className="flex justify-center mt-0.5 flex-shrink-0">
          <EloChangeIndicator change={eloChanges.get(item.id) ?? null} oldRank={rankChanges.get(item.id)?.old ?? null} newRank={rankChanges.get(item.id)?.new ?? null} />
        </div>
      )}
    </div>
  );

  if (isChampion) {
    // Champion stays stable — no AnimatePresence exit/enter
    return <div className="flex flex-col flex-1 min-h-0">{cardContent}</div>;
  }

  // Challenger fades in
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`challenger-${item.id}-${matchCount}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col flex-1 min-h-0"
      >
        {cardContent}
      </motion.div>
    </AnimatePresence>
  );
}
