import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Trophy, Undo2, Shield, ArrowLeft } from "lucide-react";
import ProfileCard from "@/components/ProfileCard";
import SwipeAd from "@/components/SwipeAd";
import EloChangeIndicator from "@/components/EloChangeIndicator";
import { calculateElo } from "@/lib/elo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSwipeSound } from "@/hooks/useSwipeSound";
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
  const [eloChanges, setEloChanges] = useState<Map<string, number>>(new Map());
  const { playSwipeSound } = useSwipeSound();

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    const { data: league } = await supabase
      .from("leagues").select("id").eq("name", "Global Rankings").single();
    if (league) setGlobalLeagueId(league.id);

    // Get current user's profile
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
      }
    }

    const { data } = await supabase.from("profiles").select("*").neq("display_name", "");

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

      // Boosted profiles get duplicated for higher frequency
      const boosted = mapped.filter((p) => p.isBoosted);
      const withBoosts = [...mapped, ...boosted, ...boosted]; // 3x chance
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

  const handleChoose = useCallback(
    async (winnerIndex: 0 | 1) => {
      if (!pair) return;
      playSwipeSound();
      const winner = pair[winnerIndex];
      const loser = pair[winnerIndex === 0 ? 1 : 0];

      if (globalLeagueId) {
        await supabase.from("matches").insert({
          league_id: globalLeagueId,
          winner_profile_id: winner.id,
          loser_profile_id: loser.id,
        });

        const { newWinnerElo, newLoserElo } = calculateElo(winner.elo, loser.elo);

        // Check if loser has ELO shield
        const finalLoserElo = (loser.id === myProfileId && myShields > 0) ? loser.elo : newLoserElo;
        if (loser.id === myProfileId && myShields > 0) {
          setMyShields((s) => s - 1);
          await supabase.from("profiles").update({ elo_shields: myShields - 1 }).eq("id", myProfileId);
          toast({ title: "🛡️ ELO Shield activated!", description: "Your rating was protected." });
        }

        await supabase.from("league_memberships").upsert(
          { league_id: globalLeagueId, profile_id: winner.id, elo: newWinnerElo, matches_played: 1 },
          { onConflict: "league_id,profile_id" }
        );
        await supabase.from("league_memberships").upsert(
          { league_id: globalLeagueId, profile_id: loser.id, elo: finalLoserElo, matches_played: 1 },
          { onConflict: "league_id,profile_id" }
        );

        setLastMatch({ winner, loser, prevWinnerElo: winner.elo, prevLoserElo: loser.elo });

        setEloChanges(new Map([
          [winner.id, newWinnerElo - winner.elo],
          [loser.id, finalLoserElo - loser.elo],
        ]));

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

      // Show ad every AD_INTERVAL swipes for non-pro
      if (!isPro && newCount % AD_INTERVAL === 0) {
        setShowAd(true);
        setEloChanges(new Map());
      } else {
        setEloChanges(new Map());
        setPair(getRandomPair(profiles, [pair[0].id, pair[1].id]));
      }
    },
    [pair, profiles, globalLeagueId, matchCount, isPro, myProfileId, myShields]
  );

  const handleRewind = async () => {
    if (!lastMatch || myRewinds <= 0 || !globalLeagueId) return;
    // Revert ELOs
    await supabase.from("league_memberships").upsert(
      { league_id: globalLeagueId, profile_id: lastMatch.winner.id, elo: lastMatch.prevWinnerElo, matches_played: 1 },
      { onConflict: "league_id,profile_id" }
    );
    await supabase.from("league_memberships").upsert(
      { league_id: globalLeagueId, profile_id: lastMatch.loser.id, elo: lastMatch.prevLoserElo, matches_played: 1 },
      { onConflict: "league_id,profile_id" }
    );
    setMyRewinds((r) => r - 1);
    await supabase.from("profiles").update({ rewinds: myRewinds - 1 }).eq("id", myProfileId!);
    setPair([lastMatch.winner, lastMatch.loser]);
    setLastMatch(null);
    toast({ title: "⏪ Rewind used!", description: "Vote again on the same pair." });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!pair || profiles.length < 2) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 flex items-center justify-center">
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
            setPair(getRandomPair(profiles, pair ? [pair[0].id, pair[1].id] : undefined));
          }}
        />
      )}
      <div className="min-h-[calc(100dvh-4rem)] bg-background px-4 py-4 flex flex-col">
        <div className="container mx-auto max-w-4xl flex flex-col flex-1">
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl font-extrabold text-foreground">Who's Better?</h1>
            </div>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <p className="text-muted-foreground text-sm">
                Matches: <span className="text-primary font-bold">{matchCount}</span>
              </p>
              {globalLeagueId && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/leaderboard/${globalLeagueId}`)} className="gap-1.5">
                  <Trophy className="h-4 w-4" /> Leaderboard
                </Button>
              )}
              {lastMatch && myRewinds > 0 && (
                <Button variant="outline" size="sm" onClick={handleRewind} className="gap-1.5">
                  <Undo2 className="h-4 w-4" /> Rewind ({myRewinds})
                </Button>
              )}
              {myShields > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" /> {myShields} shields
                </span>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`pair-${pair[0].id}-${pair[1].id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-row gap-3 items-stretch flex-1"
            >
              <div className="flex flex-col flex-1">
                <ProfileCard profile={pair[0]} side="left" onChoose={() => handleChoose(0)} />
                <div className="flex justify-center mt-1">
                  <EloChangeIndicator change={eloChanges.get(pair[0].id) ?? null} />
                </div>
              </div>
              <div className="flex items-center justify-center px-1">
                <span className="text-2xl font-black text-gradient">VS</span>
              </div>
              <div className="flex flex-col flex-1">
                <ProfileCard profile={pair[1]} side="right" onChoose={() => handleChoose(1)} />
                <div className="flex justify-center mt-1">
                  <EloChangeIndicator change={eloChanges.get(pair[1].id) ?? null} />
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <p className="text-center text-xs text-muted-foreground mt-3">
            Click on the profile you prefer. Elo updates instantly.
          </p>
        </div>
      </div>
    </>
  );
}
