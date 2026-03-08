import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Trophy, Undo2, Shield, ArrowLeft, Camera, Swords } from "lucide-react";
import ProfileCard from "@/components/ProfileCard";
import SwipeAd from "@/components/SwipeAd";
import EloChangeIndicator from "@/components/EloChangeIndicator";
import MatchupCapture from "@/components/MatchupCapture";
import SwipeComments from "@/components/SwipeComments";
import CardAnimationRouter from "@/components/animations/CardAnimationRouter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSwipeSound } from "@/hooks/useSwipeSound";
import { useAnimationSound } from "@/hooks/useAnimationSound";
import { useCardAnimation } from "@/hooks/useCardAnimation";
import { useScreenshot } from "@/hooks/useScreenshot";
import { getTierFromElo } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface SwipeProfile {
  id: string;
  displayName: string;
  age: number;
  location: string;
  statusMessage: string;
  avatarUrl: string;
  socials: Record<string, string>;
  elo: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  isPro: boolean;
  profileFrame: string;
  isBoosted: boolean;
}

const AD_INTERVAL = 10;

export default function Swipe() {
  const { user } = useAuth();
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
  const { swipeAnimation, logUsage } = useCardAnimation();
  const [sliceWinner, setSliceWinner] = useState<0 | 1 | null>(null);
  const pendingChoose = useRef<(() => void) | null>(null);

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
        setIsPro(myProfile.is_pro || false);
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

    const { data } = await supabase.from("public_profiles").select("id, display_name, avatar_url, age, location, status_message, socials, is_pro, profile_frame, active_boost_until").neq("display_name", "");

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
        if (!isPro && newCount % AD_INTERVAL === 0) {
          setShowAd(true);
        } else {
          const others = profiles.filter(p => p.id !== winner.id);
          const challenger = others[Math.floor(Math.random() * others.length)];
          const winnerWasLeft = pair[0].id === winner.id;
          setPair(winnerWasLeft ? [winner, challenger] : [challenger, winner]);
        }
      } else if (!isPro && newCount % AD_INTERVAL === 0) {
        setShowAd(true);
        setEloChanges(new Map());
        setGlobalDirections(new Map());
      } else {
        setEloChanges(new Map());
        setGlobalDirections(new Map());
        setPair(getRandomPair(profiles, [pair[0].id, pair[1].id]));
      }

      // Clear slice overlay AFTER new pair state is committed
      setSliceWinner(null);
    },
    [pair, profiles, globalLeagueId, matchCount, isPro, myProfileId, myShields, gauntletMode, gauntletChampion]
  );

  const handleChoose = useCallback(
    (winnerIndex: 0 | 1) => {
      if (!pair || sliceWinner !== null) return;
      playSwipeSound();
      playAnimationSound(swipeAnimation);
      logUsage(swipeAnimation, "swipe");
      setSliceWinner(winnerIndex);
      pendingChoose.current = () => executeChoice(winnerIndex);
    },
    [pair, sliceWinner, playSwipeSound, executeChoice]
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
      <div className="min-h-[calc(100dvh-4rem)] px-3 py-3 flex flex-col">
        <div className="container mx-auto max-w-4xl flex flex-col flex-1">
          {/* Controls bar */}
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <p className="text-muted-foreground text-xs">
              Matches: <span className="text-primary font-bold">{matchCount}</span>
              {gauntletMode && gauntletStreak > 0 && (
                <span className="ml-2">🔥 {gauntletStreak} streak</span>
              )}
            </p>
            <div className="flex-1" />
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
                onClick={() => {
                  setGauntletMode(!gauntletMode);
                  setGauntletChampion(null);
                  setGauntletStreak(0);
                }}
                className={`h-8 w-8 ${gauntletMode ? "text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}
                title={gauntletMode ? "Gauntlet Mode ON" : "Gauntlet Mode OFF"}
              >
                <Swords className="h-4 w-4" />
              </Button>
              {lastMatch && myRewinds > 0 && (
                <Button variant="outline" size="sm" onClick={handleRewind} className="gap-1 h-8 text-xs">
                  <Undo2 className="h-3.5 w-3.5" /> {myRewinds}
                </Button>
              )}
              {myShields > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Shield className="h-3 w-3" /> {myShields}
                </span>
              )}
              {globalLeagueId && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/leaderboard/${globalLeagueId}`)} className="gap-1 h-8 text-xs">
                  <Trophy className="h-3.5 w-3.5" /> Board
                </Button>
              )}
            </div>
          </div>

          {/* Capturable matchup area */}
          <MatchupCapture ref={captureRef} leagueName="Who's Better?">
              <motion.div
                key={`pair-${pair[0].id}-${pair[1].id}-${matchCount}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="relative flex flex-col sm:flex-row gap-1 sm:gap-3 items-stretch"
              >
                {/* Left / Top card */}
                <div className="flex flex-col flex-1 relative z-10">
                  <ProfileCard profile={pair[0]} side="left" onChoose={() => handleChoose(0)} />
                  <div className="flex items-center justify-center gap-3 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      <span className="font-semibold text-primary">{localElos.get(pair[0].id) ?? 1200}</span>
                      <span className="ml-0.5 text-muted-foreground/70">#{localRankMap.get(pair[0].id)}</span>
                      <span className="mx-1 text-muted-foreground/30">|</span>
                      <span className="font-semibold text-blue-400">{pair[0].elo}</span>
                      <span className="ml-0.5 text-blue-400/70">#{globalRankMap.get(pair[0].id)}</span>
                    </span>
                  </div>
                  <div className="flex justify-center mt-0.5">
                    <EloChangeIndicator change={eloChanges.get(pair[0].id) ?? null} globalDirection={globalDirections.get(pair[0].id)} />
                  </div>
                </div>

                {/* VS badge - positioned between cards */}
                <div className="flex items-center justify-center py-0 sm:px-1 sm:py-0 shrink-0">
                  <span className="text-xs sm:text-lg font-black text-muted-foreground/60 select-none">VS</span>
                </div>

                {/* Right / Bottom card */}
                <div className="flex flex-col flex-1 relative z-10">
                  <ProfileCard profile={pair[1]} side="right" onChoose={() => handleChoose(1)} />
                  <div className="flex items-center justify-center gap-3 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      <span className="font-semibold text-primary">{localElos.get(pair[1].id) ?? 1200}</span>
                      <span className="ml-0.5 text-muted-foreground/70">#{localRankMap.get(pair[1].id)}</span>
                      <span className="mx-1 text-muted-foreground/30">|</span>
                      <span className="font-semibold text-blue-400">{pair[1].elo}</span>
                      <span className="ml-0.5 text-blue-400/70">#{globalRankMap.get(pair[1].id)}</span>
                    </span>
                  </div>
                  <div className="flex justify-center mt-0.5">
                    <EloChangeIndicator change={eloChanges.get(pair[1].id) ?? null} globalDirection={globalDirections.get(pair[1].id)} />
                  </div>
                </div>

                {/* Card animation overlay */}
                <CardAnimationRouter
                  animationId={swipeAnimation}
                  winnerSide={sliceWinner}
                  items={pair ? pair.map(p => ({ imageUrl: p.avatarUrl, name: p.displayName })) : []}
                  onComplete={handleSliceComplete}
                />
              </motion.div>
            
          </MatchupCapture>

          <p className="text-center text-[10px] text-muted-foreground mt-2">
            {gauntletMode
              ? "Tap to choose · Winner stays on screen"
              : "Tap the profile you prefer · ELO updates instantly"}
          </p>

          {/* Comments section */}
          {globalLeagueId && <SwipeComments leagueId={globalLeagueId} />}
        </div>
      </div>
    </>
  );
}
