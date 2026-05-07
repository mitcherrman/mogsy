import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { Trophy, Undo2, Shield, ArrowLeft, Camera, Sword, Swords, Globe, Eye, EyeOff, MessageCircle } from "lucide-react";
import ProfileCard from "@/components/ProfileCard";
import SwipeAd from "@/components/SwipeAd";
import SwipeAdCard from "@/components/SwipeAdCard";
import type { AdCreative } from "@/components/SwipeAdCard";
import EloChangeIndicator from "@/components/EloChangeIndicator";
import MatchupCapture from "@/components/MatchupCapture";
import SwipeComments from "@/components/SwipeComments";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import CardAnimationRouter from "@/components/animations/CardAnimationRouter";
import SwipeAnimationPicker from "@/components/SwipeAnimationPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSwipeSound } from "@/hooks/useSwipeSound";
import { useAnimationSound } from "@/hooks/useAnimationSound";
import { useCardAnimation } from "@/hooks/useCardAnimation";
import { useScreenshot } from "@/hooks/useScreenshot";
import { useSwipeTimer } from "@/hooks/useSwipeTimer";
import SwipeTimer from "@/components/SwipeTimer";
import SwipeReadyOverlay from "@/components/SwipeReadyOverlay";
import ScrollToCommentsHint from "@/components/ScrollToCommentsHint";
import SwipeInventoryButton from "@/components/SwipeInventoryButton";
import { useLeagueAnimationRules, getAnimationOverride } from "@/hooks/useLeagueAnimationRules";
import { getTierFromElo } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAdSystem } from "@/hooks/useAdSystem";

interface SwipeProfile {
  id: string;
  displayName: string;
  age: number;
  location: string;
  statusMessage: string;
  avatarUrl: string;
  socials: Record<string, string>;
  elo: number;
  tier: string;
  isPro: boolean;
  profileFrame: string;
  isBoosted: boolean;
}

export default function Swipe() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const captureRef = useRef<HTMLDivElement>(null);
  const { capture } = useScreenshot(captureRef);
  const [profiles, setProfiles] = useState<SwipeProfile[]>([]);
  const [pair, setPair] = useState<[SwipeProfile, SwipeProfile] | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [globalLeagueId, setGlobalLeagueId] = useState<string | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [showInSwipeAd, setShowInSwipeAd] = useState<AdCreative | null>(null);
  const [showAdsenseInSwipe, setShowAdsenseInSwipe] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [lastMatch, setLastMatch] = useState<{ winner: SwipeProfile; loser: SwipeProfile; prevWinnerElo: number; prevLoserElo: number } | null>(null);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [myRewinds, setMyRewinds] = useState(0);
  const [myShields, setMyShields] = useState(0);
  const [myReveals, setMyReveals] = useState(0);
  const [localElos, setLocalElos] = useState<Map<string, number>>(new Map());
  const [eloChanges, setEloChanges] = useState<Map<string, number>>(new Map());
  const [globalDirections, setGlobalDirections] = useState<Map<string, "up" | "down" | "none">>(new Map());
  const [countsTowardGlobal, setCountsTowardGlobal] = useState<boolean | null>(null);
  const [gauntletMode, setGauntletMode] = useState(false);
  const [gauntletChampion, setGauntletChampion] = useState<SwipeProfile | null>(null);
  const [gauntletStreak, setGauntletStreak] = useState(0);
  const { playSwipeSound } = useSwipeSound();
  const { playAnimationSound, preloadSounds } = useAnimationSound();
  const { swipeAnimation, setSwipeAnimation, logUsage } = useCardAnimation();
  const [sliceWinner, setSliceWinner] = useState<0 | 1 | null>(null);
  const pendingChoose = useRef<(() => void) | null>(null);
  const { rules: animRules } = useLeagueAnimationRules(globalLeagueId);
  const [effectiveAnim, setEffectiveAnim] = useState(swipeAnimation);
  const [readyDelay, setReadyDelay] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { shouldShowAd, getRandomCreative, adSource, adsenseClientId, adsenseSlot } = useAdSystem("swipe");
  const [showMatchCount, setShowMatchCount] = useState(true);

  // Lock scroll on mobile to prevent any scrolling past game area
  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isMobile]);

  useEffect(() => {
    const t = setTimeout(() => setReadyDelay(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Fetch swipe UI settings
  useEffect(() => {
    supabase.from("app_settings").select("key, value").in("key", ["show_match_count"]).then(({ data }) => {
      if (data) {
        for (const row of data) {
          if (row.key === "show_match_count") setShowMatchCount((row.value as any)?.enabled ?? true);
        }
      }
    });
  }, []);

  const handleTimerTimeout = useCallback(() => {
    if (!pair || sliceWinner !== null) return;
    // Random skip — just advance to next pair
    if (gauntletMode && gauntletChampion) {
      const others = profiles.filter(p => p.id !== gauntletChampion.id);
      const challenger = others[Math.floor(Math.random() * others.length)];
      setPair([gauntletChampion, challenger]);
    } else {
      setPair(getRandomPair(profiles, [pair[0].id, pair[1].id]));
    }
    setMatchCount(c => c + 1);
  }, [pair, sliceWinner, profiles, gauntletMode, gauntletChampion]);

  const { timerEnabled, timeLeft, duration, resetTimer } = useSwipeTimer(handleTimerTimeout, showAd || !pair || sliceWinner !== null || readyDelay);

  useEffect(() => { preloadSounds(); }, [preloadSounds]);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    const { data: league } = await supabase
      .from("leagues").select("id").eq("name", "Global Rankings").single();
    if (league) setGlobalLeagueId(league.id);

    if (user) {
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("id, is_pro, rewinds, elo_shields, reveals")
        .eq("user_id", user.id)
        .single();
      if (myProfile) {
        setMyProfileId(myProfile.id);
        // Admins/moderators always see ads (for QA/verification)
        const { data: roles } = await supabase
          .from("user_roles").select("role").eq("user_id", user.id);
        const isStaff = !!roles?.some((r: any) => r.role === "admin" || r.role === "master_admin" || r.role === "moderator");
        setIsPro(!!myProfile.is_pro && !isStaff);
        setMyRewinds(myProfile.rewinds || 0);
        setMyShields(myProfile.elo_shields || 0);
        setMyReveals(myProfile.reveals || 0);

        // Fetch local rankings for global league
        if (league) {
          const { data: localRanks } = await supabase
            .from("local_rankings")
            .select("target_profile_id, local_elo")
            .eq("profile_id", myProfile.id)
            .eq("league_id", league.id);
          if (localRanks) {
            const map = new Map<string, number>();
            localRanks.forEach((r: any) => {
              if (r.target_profile_id) map.set(r.target_profile_id, r.local_elo);
            });
            setLocalElos(map);
          }
        }
      }
    }

    const { data } = await supabase.from("public_profiles").select("id, display_name, avatar_url, age, location, status_message, socials, is_pro, profile_frame, active_boost_until").neq("display_name", "").not("avatar_url", "is", null).neq("avatar_url", "").neq("is_anonymous", true);

    let eloMap = new Map<string, number>();
    if (league) {
      const { data: memberships } = await supabase
        .from("league_memberships").select("profile_id, elo").eq("league_id", league.id);
      if (memberships) memberships.forEach((m: any) => eloMap.set(m.profile_id, m.elo));
    }

    if (data && data.length >= 2) {
      const now = new Date();
      const mapped: SwipeProfile[] = data.map((p: any) => ({
        id: p.id,
        displayName: p.display_name,
        age: p.age || 0,
        location: p.location || "",
        statusMessage: p.status_message || "",
        avatarUrl: p.avatar_url || "",
        socials: (p.socials as any) || {},
        elo: eloMap.get(p.id) ?? 1200,
        tier: getTierFromElo(eloMap.get(p.id) ?? 1200),
        isPro: p.is_pro || false,
        profileFrame: p.profile_frame || "default",
        isBoosted: p.active_boost_until ? new Date(p.active_boost_until) > now : false,
      }));

      const boosted = mapped.filter((p) => p.isBoosted);
      const withBoosts = [...mapped, ...boosted, ...boosted];
      setProfiles(withBoosts);
      setPair(getRandomPair(mapped));
    }
    setLoading(false);
  };

  // ── Media prebuffering: preload upcoming profile avatars ──
  useEffect(() => {
    if (!pair || profiles.length < 2) return;
    // Preload a few random other profile avatars for next pairs
    const otherProfiles = profiles.filter(p => p.id !== pair[0].id && p.id !== pair[1].id);
    const toPreload = otherProfiles.slice(0, 6);
    toPreload.forEach(p => {
      if (p.avatarUrl) {
        const img = new Image();
        img.src = p.avatarUrl;
      }
    });
  }, [pair, profiles]);

  function getRandomPair(list: SwipeProfile[], lastPair?: [string, string]): [SwipeProfile, SwipeProfile] {
    let a: number, b: number;
    do {
      a = Math.floor(Math.random() * list.length);
      b = Math.floor(Math.random() * list.length);
    } while (a === b || list[a].id === list[b].id || (lastPair && lastPair.includes(list[a].id) && lastPair.includes(list[b].id)));
    return [list[a], list[b]];
  }

  const executeChoice = useCallback(
    async (winnerIndex: 0 | 1) => {
      if (!pair) return;
      const winner = pair[winnerIndex];
      const loser = pair[winnerIndex === 0 ? 1 : 0];

      if (globalLeagueId && myProfileId) {
        const { data: rpcResult, error: rpcError } = await supabase.rpc("record_dual_user_match", {
          _league_id: globalLeagueId,
          _winner_profile_id: winner.id,
          _loser_profile_id: loser.id,
          _caller_profile_id: myProfileId,
        });

        if (rpcError) {
          console.error("Dual match RPC error:", rpcError);
          return;
        }

        const result = rpcResult as any;

        if (result.shieldUsed) {
          setMyShields((s) => s - 1);
          toast({ title: "🛡️ ELO Shield activated!", description: "Your rating was protected." });
        }

        setLastMatch({ winner, loser, prevWinnerElo: winner.elo, prevLoserElo: loser.elo });

        setEloChanges(new Map([
          [winner.id, result.localWinnerChange],
          [loser.id, result.localLoserChange],
        ]));
        setGlobalDirections(new Map([
          [winner.id, result.globalDirectionWinner as "up" | "down" | "none"],
          [loser.id, result.globalDirectionLoser as "up" | "down" | "none"],
        ]));
        if (countsTowardGlobal === null) {
          setCountsTowardGlobal(result.countsTowardGlobal);
        }

        // Update local elos
        setLocalElos(prev => {
          const next = new Map(prev);
          next.set(winner.id, result.localWinnerElo);
          next.set(loser.id, result.localLoserElo);
          return next;
        });

        // Still update profile state with global elo for display consistency
        const newWinnerElo = result.countsTowardGlobal ? winner.elo + Math.abs(result.localWinnerChange) : winner.elo;
        const finalLoserElo = result.countsTowardGlobal ? loser.elo - Math.abs(result.localLoserChange) : loser.elo;

        setProfiles((prev) =>
          prev.map((p) => {
            if (p.id === winner.id) return { ...p, elo: newWinnerElo, tier: getTierFromElo(newWinnerElo) };
            if (p.id === loser.id) return { ...p, elo: finalLoserElo, tier: getTierFromElo(finalLoserElo) };
            return p;
          })
        );
      }

      const newCount = matchCount + 1;
      setMatchCount(newCount);

      if (gauntletMode) {
        setEloChanges(new Map());
        setGlobalDirections(new Map());
        setGauntletChampion(winner);
        setGauntletStreak(prev => {
          if (gauntletChampion && winner.id === gauntletChampion.id) return prev + 1;
          return 1;
        });
        const adType = shouldShowAd(newCount, isPro);
        if (adType === "in_swipe") {
          const creative = getRandomCreative();
          if (creative) { setShowInSwipeAd(creative); }
          else if (adSource !== "custom") { setShowAdsenseInSwipe(true); }
          else { setShowAd(true); }
        } else if (adType === "popup") {
          setShowAd(true);
        } else {
          const others = profiles.filter(p => p.id !== winner.id);
          const challenger = others[Math.floor(Math.random() * others.length)];
          const winnerWasLeft = pair[0].id === winner.id;
          setPair(winnerWasLeft ? [winner, challenger] : [challenger, winner]);
        }
      } else {
        const adType = shouldShowAd(newCount, isPro);
        if (adType === "in_swipe") {
          const creative = getRandomCreative();
          if (creative) { setShowInSwipeAd(creative); }
          else if (adSource !== "custom") { setShowAdsenseInSwipe(true); }
          else { setShowAd(true); }
          setEloChanges(new Map());
          setGlobalDirections(new Map());
        } else if (adType === "popup") {
          setShowAd(true);
          setEloChanges(new Map());
          setGlobalDirections(new Map());
        } else {
          setEloChanges(new Map());
          setGlobalDirections(new Map());
          setPair(getRandomPair(profiles, [pair[0].id, pair[1].id]));
        }
      }

      // Clear slice overlay AFTER new pair state is committed
      setSliceWinner(null);
      resetTimer();
    },
    [pair, profiles, globalLeagueId, matchCount, isPro, myProfileId, myShields, gauntletMode, gauntletChampion]
  );

  const handleChoose = useCallback(
    (winnerIndex: 0 | 1) => {
      if (!pair || sliceWinner !== null || readyDelay) return;
      // Check for animation override from league rules
      const override = getAnimationOverride(matchCount + 1, animRules);
      const animToUse = override || swipeAnimation;
      if (animToUse === "default") playSwipeSound();
      playAnimationSound(animToUse);
      logUsage(animToUse, "swipe");
      setEffectiveAnim(animToUse);
      setSliceWinner(winnerIndex);
      pendingChoose.current = () => executeChoice(winnerIndex);
    },
    [pair, sliceWinner, readyDelay, swipeAnimation, playSwipeSound, playAnimationSound, logUsage, executeChoice, matchCount, animRules]
  );

  const handleSliceComplete = useCallback(() => {
    pendingChoose.current?.();
    pendingChoose.current = null;
    // sliceWinner cleared in executeChoice after pair is committed
  }, []);

  const handleRewind = async () => {
    if (!lastMatch || myRewinds <= 0 || !globalLeagueId || !myProfileId) return;

    const { error } = await supabase.rpc("rewind_user_match", {
      _league_id: globalLeagueId,
      _winner_profile_id: lastMatch.winner.id,
      _loser_profile_id: lastMatch.loser.id,
      _prev_winner_elo: lastMatch.prevWinnerElo,
      _prev_loser_elo: lastMatch.prevLoserElo,
      _caller_profile_id: myProfileId,
    });

    if (error) {
      console.error("Rewind error:", error);
      toast({ title: "Rewind failed", description: error.message });
      return;
    }

    setMyRewinds((r) => r - 1);
    setPair([lastMatch.winner, lastMatch.loser]);
    setLastMatch(null);
    toast({ title: "⏪ Rewind used!", description: "Vote again on the same pair." });
  };

  const globalRankMap = useMemo(() => {
    const sorted = [...profiles].sort((a, b) => b.elo - a.elo);
    const map = new Map<string, number>();
    sorted.forEach((p, idx) => map.set(p.id, idx + 1));
    return map;
  }, [profiles]);

  const localRankMap = useMemo(() => {
    const entries = profiles.map(p => ({
      id: p.id,
      elo: localElos.get(p.id) ?? 1200,
    }));
    entries.sort((a, b) => b.elo - a.elo);
    const map = new Map<string, number>();
    entries.forEach((e, idx) => map.set(e.id, idx + 1));
    return map;
  }, [profiles, localElos]);
  if (loading) {
    return <div className="min-h-screen" />;
  }

  if (!pair || profiles.length < 2) {
    return (
      <div className="min-h-screen px-4 py-8 flex items-center justify-center">
        <p className="text-muted-foreground">Not enough profiles to compare yet. Invite friends to join!</p>
      </div>
    );
  }

  return (
    <>
      {showAd && (
        <SwipeAd
          isPro={isPro}
          adsenseSlot={adSource !== "custom" ? adsenseSlot : undefined}
          adsenseClientId={adSource !== "custom" ? adsenseClientId : undefined}
          onClose={() => {
            setShowAd(false);
            if (gauntletMode && gauntletChampion) {
              const others = profiles.filter(p => p.id !== gauntletChampion.id);
              const challenger = others[Math.floor(Math.random() * others.length)];
              setPair([gauntletChampion, challenger]);
            } else {
              setPair(getRandomPair(profiles, pair ? [pair[0].id, pair[1].id] : undefined));
            }
          }}
        />
      )}
      <div className={`${isMobile ? 'h-[calc(100dvh-7.5rem)] overflow-hidden' : 'min-h-[calc(100dvh-4rem)]'} ${isMobile ? 'px-3 py-0' : 'px-3 py-3'} flex flex-col relative`}>
        <AnimatePresence>{readyDelay && <SwipeReadyOverlay />}</AnimatePresence>

        {/* Floating back button on mobile */}
        {isMobile && (
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} className="absolute top-1 left-2 z-30 h-7 w-7 text-muted-foreground hover:text-foreground bg-card/80 backdrop-blur-sm">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        )}

        <div className="container mx-auto max-w-4xl lg:max-w-6xl xl:max-w-7xl flex flex-col flex-1">
          {/* Controls bar — desktop only */}
          {!isMobile && (
            <div className="flex items-center gap-2 mb-2">
              <Button variant="outline" size="icon" onClick={() => navigate(-1)} className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                variant={gauntletMode ? "default" : "outline"}
                size="icon"
                onClick={() => {
                  setGauntletMode(!gauntletMode);
                  setGauntletChampion(null);
                  setGauntletStreak(0);
                }}
                className={`h-8 w-8 shrink-0 ${gauntletMode ? "text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}
                title={gauntletMode ? "Gauntlet Mode ON" : "Gauntlet Mode OFF"}
              >
                <Sword className="h-4 w-4" fill="currentColor" />
              </Button>
              <div className="flex-1 flex items-center justify-center">
                <h1 className="text-sm font-bold text-foreground">Who Mogs?</h1>
              </div>
              {showMatchCount && (
                <p className="text-muted-foreground text-xs flex items-center gap-1 shrink-0">
                  <Swords className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-primary font-bold">{matchCount}</span>
                  {gauntletMode && gauntletStreak > 0 && (
                    <span className="ml-2">🔥 {gauntletStreak} streak</span>
                  )}
                </p>
              )}
              {user && (
                <SwipeInventoryButton rewinds={myRewinds} shields={myShields} reveals={myReveals} />
              )}
              {timerEnabled && <SwipeTimer timeLeft={timeLeft} duration={duration} />}
              <div className="flex items-center gap-1 shrink-0">
                {user && (
                  <SwipeAnimationPicker
                    currentAnimation={swipeAnimation}
                    onSelect={(id) => setSwipeAnimation(id)}
                    isPro={isPro}
                  />
                )}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={capture}
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  title="Save snapshot"
                >
                  <Camera className="h-4 w-4" />
                </Button>
                {globalLeagueId && (
                  <Button variant="outline" size="icon" onClick={() => navigate(`/leaderboard/${globalLeagueId}`)} className="h-8 w-8 text-xs">
                    <Trophy className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Mobile: minimal top area with timer only */}
          {isMobile && timerEnabled && (
            <div className="flex items-center justify-end mb-1">
              <SwipeTimer timeLeft={timeLeft} duration={duration} />
            </div>
          )}

          {/* Capturable matchup area */}
          <MatchupCapture
            ref={captureRef}
            leagueName="Swipe On Who Mogs"
            isMobile={isMobile}
            centerSlot={lastMatch && myRewinds > 0 ? (
              <Button variant="outline" size="sm" onClick={handleRewind} className="gap-1 h-7 text-xs">
                <Undo2 className="h-3 w-3" /> {myRewinds}
              </Button>
            ) : undefined}
          >
            {(showInSwipeAd || showAdsenseInSwipe) ? (
              <motion.div
                key={`ad-${showInSwipeAd?.id ?? 'adsense'}-${matchCount}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className={`relative flex flex-col sm:flex-row ${isMobile ? 'gap-0.5' : 'gap-1'} sm:gap-3 items-stretch flex-1 min-h-0 [&_.profile-photo]:!aspect-[4/3] sm:[&_.profile-photo]:!aspect-[3/4]`}
              >
                {/* Real card */}
                <div className="flex flex-col flex-1 relative z-10 rounded-2xl border border-border bg-card overflow-hidden">
                  <ProfileCard profile={pair[0]} side="left" onChoose={() => {}} />
                </div>
                <div className="flex items-center justify-center py-0 sm:px-1 sm:py-0 shrink-0">
                  <span className="text-xs sm:text-lg font-black text-muted-foreground/60 select-none">VS</span>
                </div>
                {/* Ad card */}
                <SwipeAdCard
                  creative={showInSwipeAd}
                  adsenseSlot={showAdsenseInSwipe ? (adsenseSlot || "auto") : (adSource !== "custom" && !showInSwipeAd?.image_url ? adsenseSlot : undefined)}
                  adsenseClientId={showAdsenseInSwipe ? (adsenseClientId || "ca-pub-9823769047605421") : (adSource !== "custom" ? adsenseClientId : undefined)}
                  placement="swipe"
                  adSource={adSource}
                  profileId={myProfileId || undefined}
                  onSkip={() => {
                    setShowInSwipeAd(null);
                    setShowAdsenseInSwipe(false);
                    if (gauntletMode && gauntletChampion) {
                      const others = profiles.filter(p => p.id !== gauntletChampion.id);
                      const challenger = others[Math.floor(Math.random() * others.length)];
                      setPair([gauntletChampion, challenger]);
                    } else {
                      setPair(getRandomPair(profiles, [pair[0].id, pair[1].id]));
                    }
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key={`pair-${pair[0].id}-${pair[1].id}-${matchCount}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className={`relative flex flex-col sm:flex-row ${isMobile ? 'gap-0.5' : 'gap-1'} sm:gap-3 items-stretch flex-1 min-h-0 [&_.profile-photo]:!aspect-[4/3] sm:[&_.profile-photo]:!aspect-[3/4]`}
              >
                {/* Left / Top card */}
                <div className="flex flex-col flex-1 relative z-10 rounded-2xl border border-border bg-card overflow-hidden">
                  <ProfileCard profile={pair[0]} side="left" onChoose={() => handleChoose(0)} />
                  {isMobile ? (
                    <div className="px-1.5 py-0.5 relative z-20">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="text-xs font-extrabold text-foreground truncate">{pair[0].displayName}</h3>
                        <span className={`text-[10px] text-muted-foreground inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 ${sliceWinner === null ? "invisible" : ""}`}>
                          <span className="font-semibold text-primary">{localElos.get(pair[0].id) ?? 1200}</span>
                          <span className="text-muted-foreground/70">#{localRankMap.get(pair[0].id)}</span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="px-2 py-1.5 relative z-20">
                      <div className={`flex items-center justify-center gap-3 ${sliceWinner === null ? "invisible" : ""}`}>
                        <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                          <span className="font-semibold text-primary">{localElos.get(pair[0].id) ?? 1200}</span>
                          <span className="text-muted-foreground/70">#{localRankMap.get(pair[0].id)}</span>
                        </span>
                      </div>
                      <div className={`flex justify-center mt-0.5 ${sliceWinner === null ? "invisible" : ""}`}>
                        <EloChangeIndicator change={eloChanges.get(pair[0].id) ?? null} globalDirection={globalDirections.get(pair[0].id)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* VS / Who Mogs? badge */}
                <div className="flex items-center justify-center py-0 sm:px-1 sm:py-0 shrink-0">
                  {isMobile ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Who Mogs?</span>
                  ) : (
                    <span className="text-xs sm:text-lg font-black text-muted-foreground/60 select-none">VS</span>
                  )}
                </div>

                {/* Right / Bottom card */}
                <div className="flex flex-col flex-1 relative z-10 rounded-2xl border border-border bg-card overflow-hidden">
                  <ProfileCard profile={pair[1]} side="right" onChoose={() => handleChoose(1)} />
                  {isMobile ? (
                    <div className="px-1.5 py-0.5 relative z-20">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="text-xs font-extrabold text-foreground truncate">{pair[1].displayName}</h3>
                        <span className={`text-[10px] text-muted-foreground inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 ${sliceWinner === null ? "invisible" : ""}`}>
                          <span className="font-semibold text-primary">{localElos.get(pair[1].id) ?? 1200}</span>
                          <span className="text-muted-foreground/70">#{localRankMap.get(pair[1].id)}</span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="px-2 py-1.5 relative z-20">
                      <div className={`flex items-center justify-center gap-3 ${sliceWinner === null ? "invisible" : ""}`}>
                        <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                          <span className="font-semibold text-primary">{localElos.get(pair[1].id) ?? 1200}</span>
                          <span className="text-muted-foreground/70">#{localRankMap.get(pair[1].id)}</span>
                        </span>
                      </div>
                      <div className={`flex justify-center mt-0.5 ${sliceWinner === null ? "invisible" : ""}`}>
                        <EloChangeIndicator change={eloChanges.get(pair[1].id) ?? null} globalDirection={globalDirections.get(pair[1].id)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Card animation overlay */}
                <CardAnimationRouter
                  animationId={effectiveAnim}
                  winnerSide={sliceWinner}
                  items={pair ? pair.map(p => ({
                    imageUrl: p.avatarUrl,
                    name: p.displayName,
                    localElo: localElos.get(p.id) ?? 1200,
                    localRank: localRankMap.get(p.id),
                    globalElo: p.elo,
                    globalRank: globalRankMap.get(p.id),
                    eloVisible: true,
                    rankVisible: true,
                    eloChange: eloChanges.get(p.id) ?? null,
                    globalDirection: globalDirections.get(p.id),
                    showGlobalStats: false,
                  })) : []}
                  onComplete={handleSliceComplete}
                />
              </motion.div>
            )}
          </MatchupCapture>

          {/* Mobile action bar below cards */}
          {isMobile && (
            <div className="flex items-center justify-center gap-3 mt-1">
              <Button
                variant={gauntletMode ? "default" : "outline"}
                size="icon"
                onClick={() => {
                  setGauntletMode(!gauntletMode);
                  setGauntletChampion(null);
                  setGauntletStreak(0);
                }}
                className={`h-7 w-7 shrink-0 ${gauntletMode ? "text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}
                title={gauntletMode ? "Gauntlet Mode ON" : "Gauntlet Mode OFF"}
              >
                <Sword className="h-3.5 w-3.5" fill="currentColor" />
              </Button>
              {user && (
                <SwipeInventoryButton rewinds={myRewinds} shields={myShields} reveals={myReveals} />
              )}
              {user && (
                <SwipeAnimationPicker
                  currentAnimation={swipeAnimation}
                  onSelect={(id) => setSwipeAnimation(id)}
                  isPro={isPro}
                />
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={capture}
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                title="Save snapshot"
              >
                <Camera className="h-3.5 w-3.5" />
              </Button>
              {globalLeagueId && (
                <Button variant="outline" size="icon" onClick={() => navigate(`/leaderboard/${globalLeagueId}`)} className="h-7 w-7 text-xs">
                  <Trophy className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCommentsOpen(true)}
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                title="Comments"
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {!isMobile && (
            <p className="text-center text-[10px] text-muted-foreground mt-0.5">
              {gauntletMode
                ? "Tap to choose · Winner stays on screen"
                : "Tap the profile you prefer · Aura updates instantly"}
            </p>
          )}

          {!isMobile && <ScrollToCommentsHint />}

          {/* Comments: drawer on mobile, inline on desktop */}
          {isMobile && globalLeagueId && (
            <Drawer open={commentsOpen} onOpenChange={setCommentsOpen}>
              <DrawerContent className="max-h-[75dvh]">
                <DrawerHeader>
                  <DrawerTitle>Comments</DrawerTitle>
                </DrawerHeader>
                <div className="overflow-y-auto px-4 pb-4">
                  <SwipeComments leagueId={globalLeagueId} />
                </div>
              </DrawerContent>
            </Drawer>
          )}
          {!isMobile && globalLeagueId && <SwipeComments leagueId={globalLeagueId} />}
        </div>
      </div>
    </>
  );
}
