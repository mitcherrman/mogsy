import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ProfileCard from "@/components/ProfileCard";
import { calculateElo } from "@/lib/elo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getTierFromElo } from "@/lib/mock-data";

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
}

export default function Swipe() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<SwipeProfile[]>([]);
  const [pair, setPair] = useState<[SwipeProfile, SwipeProfile] | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    const { data } = await supabase.from("profiles").select("*").neq("display_name", "");
    if (data && data.length >= 2) {
      const mapped: SwipeProfile[] = data.map((p: any) => ({
        id: p.id,
        displayName: p.display_name,
        age: p.age || 0,
        location: p.location || "",
        statusMessage: p.status_message || "",
        avatarUrl: p.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${p.display_name}`,
        socials: (p.socials as any) || {},
        elo: 1200, // default; will be from league membership later
        tier: "bronze" as const,
      }));
      setProfiles(mapped);
      setPair(getRandomPair(mapped));
    }
    setLoading(false);
  };

  function getRandomPair(list: SwipeProfile[], lastPair?: [string, string]): [SwipeProfile, SwipeProfile] {
    let a: number, b: number;
    do {
      a = Math.floor(Math.random() * list.length);
      b = Math.floor(Math.random() * list.length);
    } while (a === b || (lastPair && lastPair.includes(list[a].id) && lastPair.includes(list[b].id)));
    return [list[a], list[b]];
  }

  const handleChoose = useCallback(
    async (winnerIndex: 0 | 1) => {
      if (!pair) return;
      const winner = pair[winnerIndex];
      const loser = pair[winnerIndex === 0 ? 1 : 0];

      // Get global league
      const { data: globalLeague } = await supabase
        .from("leagues")
        .select("id")
        .eq("name", "Global Rankings")
        .single();

      if (globalLeague) {
        // Record match
        await supabase.from("matches").insert({
          league_id: globalLeague.id,
          winner_profile_id: winner.id,
          loser_profile_id: loser.id,
        });

        // Update elo in league_memberships (upsert both)
        const { newWinnerElo, newLoserElo } = calculateElo(winner.elo, loser.elo);

        await supabase.from("league_memberships").upsert(
          { league_id: globalLeague.id, profile_id: winner.id, elo: newWinnerElo, matches_played: 1 },
          { onConflict: "league_id,profile_id" }
        );
        await supabase.from("league_memberships").upsert(
          { league_id: globalLeague.id, profile_id: loser.id, elo: newLoserElo, matches_played: 1 },
          { onConflict: "league_id,profile_id" }
        );
      }

      setMatchCount((c) => c + 1);
      setPair(getRandomPair(profiles, [pair[0].id, pair[1].id]));
    },
    [pair, profiles]
  );

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
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-foreground mb-1">Who's Better?</h1>
          <p className="text-muted-foreground text-sm">
            Matches played: <span className="text-primary font-bold">{matchCount}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-stretch">
          <AnimatePresence mode="wait">
            <ProfileCard
              key={`left-${pair[0].id}`}
              profile={pair[0]}
              side="left"
              onChoose={() => handleChoose(0)}
            />
          </AnimatePresence>

          <div className="flex items-center justify-center">
            <span className="text-3xl font-black text-gradient animate-versus-pulse">VS</span>
          </div>

          <AnimatePresence mode="wait">
            <ProfileCard
              key={`right-${pair[1].id}`}
              profile={pair[1]}
              side="right"
              onChoose={() => handleChoose(1)}
            />
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Click on the profile you prefer. Elo updates instantly.
        </p>
      </div>
    </div>
  );
}
