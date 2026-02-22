import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Swords, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TierBadge from "@/components/TierBadge";
import UserAvatar from "@/components/UserAvatar";
import { getTierFromElo } from "@/lib/mock-data";

interface LeagueInfo {
  id: string;
  name: string;
  type: string;
  elo: number;
  matchesPlayed: number;
  lastSwipedAt: string | null;
}

interface RecentSwipe {
  id: string;
  leagueName: string;
  leagueType: string;
  winnerName: string;
  loserName: string;
  winnerImage: string;
  loserImage: string;
  createdAt: string;
}

export default function Home() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [recentSwipes, setRecentSwipes] = useState<RecentSwipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      setLoading(false);
      return;
    }

    // Load ALL leagues and user's memberships in parallel
    const [
      { data: allLeagues },
      { data: memberships },
      { data: userMatches },
      { data: presetMatches },
    ] = await Promise.all([
      supabase.from("leagues").select("id, name, type"),
      supabase.from("league_memberships").select("league_id, elo, matches_played, last_active_at").eq("profile_id", profile.id),
      supabase.from("matches")
        .select("id, created_at, league_id, winner_profile_id, loser_profile_id, winner_item_id, loser_item_id")
        .or(`winner_profile_id.eq.${profile.id},loser_profile_id.eq.${profile.id}`)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("matches")
        .select("id, created_at, league_id, winner_profile_id, loser_profile_id, winner_item_id, loser_item_id")
        .not("winner_item_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const leagueMap = new Map(allLeagues?.map((l) => [l.id, l]) || []);
    const membershipMap = new Map(memberships?.map((m) => [m.league_id, m]) || []);

    // Build "Your Leagues" — all leagues user has memberships in + leagues from matches
    const leagueSet = new Set<string>();
    memberships?.forEach((m) => leagueSet.add(m.league_id));

    // Also add leagues from recent matches
    const matchMap = new Map<string, typeof userMatches extends (infer T)[] | null ? T : never>();
    [...(userMatches || []), ...(presetMatches || [])].forEach((m) => {
      if (!matchMap.has(m.id)) matchMap.set(m.id, m);
      leagueSet.add(m.league_id);
    });
    const allMatches = Array.from(matchMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Count matches per league for preset leagues
    const leagueMatchCount = new Map<string, { count: number; lastDate: string }>();
    allMatches.forEach((m) => {
      const existing = leagueMatchCount.get(m.league_id);
      if (!existing) {
        leagueMatchCount.set(m.league_id, { count: 1, lastDate: m.created_at });
      } else {
        existing.count++;
      }
    });

    const leagueList: LeagueInfo[] = [];
    leagueSet.forEach((leagueId) => {
      const league = leagueMap.get(leagueId);
      if (!league) return;
      const membership = membershipMap.get(leagueId);
      const matchInfo = leagueMatchCount.get(leagueId);
      leagueList.push({
        id: leagueId,
        name: league.name,
        type: league.type,
        elo: membership?.elo || 1200,
        matchesPlayed: membership?.matches_played || matchInfo?.count || 0,
        lastSwipedAt: membership?.last_active_at || matchInfo?.lastDate || null,
      });
    });

    leagueList.sort((a, b) => {
      const dateA = a.lastSwipedAt ? new Date(a.lastSwipedAt).getTime() : 0;
      const dateB = b.lastSwipedAt ? new Date(b.lastSwipedAt).getTime() : 0;
      return dateB - dateA;
    });
    setLeagues(leagueList.slice(0, 6));

    // Build "Recent Swipes" - 5 most recent
    const recentMatchesSlice = allMatches.slice(0, 5);

    const profileIds = new Set<string>();
    const itemIds = new Set<string>();
    recentMatchesSlice.forEach((m) => {
      if (m.winner_profile_id) profileIds.add(m.winner_profile_id);
      if (m.loser_profile_id) profileIds.add(m.loser_profile_id);
      if (m.winner_item_id) itemIds.add(m.winner_item_id);
      if (m.loser_item_id) itemIds.add(m.loser_item_id);
    });

    const profileNameMap = new Map<string, { name: string; avatar: string }>();
    const itemNameMap = new Map<string, { name: string; image: string }>();

    if (profileIds.size > 0) {
      const { data } = await supabase.from("public_profiles").select("id, display_name, avatar_url").in("id", Array.from(profileIds));
      data?.forEach((p) => {
        profileNameMap.set(p.id, {
          name: p.display_name,
          avatar: p.avatar_url || "",
        });
      });
    }
    if (itemIds.size > 0) {
      const { data } = await supabase.from("preset_items").select("id, name, image_url").in("id", Array.from(itemIds));
      data?.forEach((it) => {
        itemNameMap.set(it.id, { name: it.name, image: it.image_url || "" });
      });
    }

    const swipes: RecentSwipe[] = recentMatchesSlice.map((m) => {
      const league = leagueMap.get(m.league_id);
      const isPreset = league?.type === "preset";

      let winnerName = "Unknown";
      let loserName = "Unknown";
      let winnerImage = "";
      let loserImage = "";

      if (isPreset) {
        const w = itemNameMap.get(m.winner_item_id || "");
        const l = itemNameMap.get(m.loser_item_id || "");
        winnerName = w?.name || "Unknown";
        loserName = l?.name || "Unknown";
        winnerImage = w?.image || "";
        loserImage = l?.image || "";
      } else {
        const w = profileNameMap.get(m.winner_profile_id || "");
        const l = profileNameMap.get(m.loser_profile_id || "");
        winnerName = w?.name || "Unknown";
        loserName = l?.name || "Unknown";
        winnerImage = w?.avatar || "";
        loserImage = l?.avatar || "";
      }

      return {
        id: m.id,
        leagueName: league?.name || "Unknown",
        leagueType: league?.type || "user",
        winnerName,
        loserName,
        winnerImage,
        loserImage,
        createdAt: m.created_at,
      };
    });

    setRecentSwipes(swipes);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-3xl">
        <h1 className="text-3xl font-extrabold text-foreground mb-8">Home</h1>

        {/* Your Leagues */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" /> Your Leagues
            </h2>
            <Link to="/leagues" className="text-xs text-primary hover:underline">View all</Link>
          </div>

          {leagues.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-muted-foreground text-sm">No leagues yet. Start swiping to join!</p>
              <Link to="/play" className="text-primary text-sm mt-2 inline-block hover:underline">Start Swiping →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {leagues.map((league, i) => (
                <motion.div
                  key={league.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    to={`/leaderboard/${league.id}`}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-[0_0_15px_hsl(210_80%_60%/0.1)]"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{league.name}</p>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {league.type === "preset" ? "Preset" : "Users"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {league.type !== "preset" && (
                          <>
                            <TierBadge tier={getTierFromElo(league.elo)} />
                            <span>ELO {league.elo}</span>
                          </>
                        )}
                        <span>{league.matchesPlayed} swipes</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Swipes */}
        <section>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
            <Swords className="h-5 w-5 text-primary" /> Recent Swipes
          </h2>

          {recentSwipes.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-muted-foreground text-sm">No swipes yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentSwipes.map((swipe, i) => (
                <motion.div
                  key={swipe.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <UserAvatar src={swipe.winnerImage} name={swipe.winnerName} size="sm" />
                    <span className="font-medium text-foreground truncate">{swipe.winnerName}</span>
                    <Swords className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    <UserAvatar src={swipe.loserImage} name={swipe.loserName} size="sm" />
                    <span className="font-medium text-foreground truncate">{swipe.loserName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="truncate max-w-[80px]">{swipe.leagueName}</span>
                    <span>·</span>
                    <span>{new Date(swipe.createdAt).toLocaleDateString()}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
