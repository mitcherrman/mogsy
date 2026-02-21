import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Swords, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TierBadge from "@/components/TierBadge";
import { getTierFromElo } from "@/lib/mock-data";

interface LeagueInfo {
  id: string;
  name: string;
  type: string;
  elo: number;
  matchesPlayed: number;
  lastSwipedAt: string;
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

    // Load user's recent matches (user leagues)
    const { data: userMatches } = await supabase
      .from("matches")
      .select("id, created_at, league_id, winner_profile_id, loser_profile_id, winner_item_id, loser_item_id")
      .or(`winner_profile_id.eq.${profile.id},loser_profile_id.eq.${profile.id}`)
      .order("created_at", { ascending: false })
      .limit(50);

    // Load recent preset league matches (globally, since voter isn't tracked)
    const { data: presetMatches } = await supabase
      .from("matches")
      .select("id, created_at, league_id, winner_profile_id, loser_profile_id, winner_item_id, loser_item_id")
      .not("winner_item_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    // Combine and deduplicate
    const matchMap = new Map<string, typeof userMatches extends (infer T)[] | null ? T : never>();
    [...(userMatches || []), ...(presetMatches || [])].forEach((m) => {
      if (!matchMap.has(m.id)) matchMap.set(m.id, m);
    });
    const allMatches = Array.from(matchMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    if (allMatches.length === 0) {
      setLoading(false);
      return;
    }

    // Gather unique league IDs from matches
    const leagueIds = [...new Set(allMatches.map((m) => m.league_id))];

    // Fetch league details
    const { data: leaguesData } = await supabase
      .from("leagues")
      .select("id, name, type")
      .in("id", leagueIds);

    const leagueMap = new Map(leaguesData?.map((l) => [l.id, l]) || []);

    // Build "Your Leagues" - 5 most recently swiped leagues
    const leagueLastSwipe = new Map<string, { date: string; count: number }>();
    allMatches.forEach((m) => {
      const existing = leagueLastSwipe.get(m.league_id);
      if (!existing) {
        leagueLastSwipe.set(m.league_id, { date: m.created_at, count: 1 });
      } else {
        existing.count++;
      }
    });

    // Get user's ELO for user-type leagues
    const { data: memberships } = await supabase
      .from("league_memberships")
      .select("league_id, elo, matches_played")
      .eq("profile_id", profile.id);

    const membershipMap = new Map(memberships?.map((m) => [m.league_id, m]) || []);

    const leagueList: LeagueInfo[] = [];
    leagueLastSwipe.forEach((info, leagueId) => {
      const league = leagueMap.get(leagueId);
      if (!league) return;
      const membership = membershipMap.get(leagueId);
      leagueList.push({
        id: leagueId,
        name: league.name,
        type: league.type,
        elo: membership?.elo || 1200,
        matchesPlayed: membership?.matches_played || info.count,
        lastSwipedAt: info.date,
      });
    });

    leagueList.sort((a, b) => new Date(b.lastSwipedAt).getTime() - new Date(a.lastSwipedAt).getTime());
    setLeagues(leagueList.slice(0, 5));

    // Build "Recent Swipes" - 5 most recent
    const recentMatchesSlice = allMatches.slice(0, 5);

    // Gather profile and item IDs to resolve names
    const profileIds = new Set<string>();
    const itemIds = new Set<string>();
    recentMatchesSlice.forEach((m) => {
      if (m.winner_profile_id) profileIds.add(m.winner_profile_id);
      if (m.loser_profile_id) profileIds.add(m.loser_profile_id);
      if (m.winner_item_id) itemIds.add(m.winner_item_id);
      if (m.loser_item_id) itemIds.add(m.loser_item_id);
    });

    const profileMap = new Map<string, { name: string; avatar: string }>();
    const itemMap = new Map<string, { name: string; image: string }>();

    if (profileIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", Array.from(profileIds));
      profiles?.forEach((p) => {
        profileMap.set(p.id, {
          name: p.display_name,
          avatar: p.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${p.display_name}`,
        });
      });
    }

    if (itemIds.size > 0) {
      const { data: items } = await supabase
        .from("preset_items")
        .select("id, name, image_url")
        .in("id", Array.from(itemIds));
      items?.forEach((it) => {
        itemMap.set(it.id, { name: it.name, image: it.image_url || "" });
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
        const w = itemMap.get(m.winner_item_id || "");
        const l = itemMap.get(m.loser_item_id || "");
        winnerName = w?.name || "Unknown";
        loserName = l?.name || "Unknown";
        winnerImage = w?.image || "";
        loserImage = l?.image || "";
      } else {
        const w = profileMap.get(m.winner_profile_id || "");
        const l = profileMap.get(m.loser_profile_id || "");
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
                    {swipe.winnerImage && (
                      <img src={swipe.winnerImage} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    )}
                    <span className="font-medium text-foreground truncate">{swipe.winnerName}</span>
                    <span className="text-muted-foreground mx-1">beat</span>
                    {swipe.loserImage && (
                      <img src={swipe.loserImage} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    )}
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
