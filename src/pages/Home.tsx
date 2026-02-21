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
  elo: number;
  matchesPlayed: number;
}

interface RecentMatch {
  id: string;
  leagueName: string;
  winnerName: string;
  loserName: string;
  createdAt: string;
}

export default function Home() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      setLoading(false);
      return;
    }

    // Load leagues
    const { data: memberships } = await supabase
      .from("league_memberships")
      .select("league_id, elo, matches_played")
      .eq("profile_id", profile.id);

    if (memberships && memberships.length > 0) {
      const leagueIds = memberships.map((m) => m.league_id);
      const { data: leagueData } = await supabase
        .from("leagues")
        .select("id, name")
        .in("id", leagueIds);

      if (leagueData) {
        setLeagues(
          leagueData.map((l) => {
            const mem = memberships.find((m) => m.league_id === l.id);
            return {
              id: l.id,
              name: l.name,
              elo: mem?.elo || 1200,
              matchesPlayed: mem?.matches_played || 0,
            };
          })
        );
      }
    }

    // Load recent matches (last 10)
    const { data: matches } = await supabase
      .from("matches")
      .select("id, created_at, league_id, winner_profile_id, loser_profile_id")
      .or(`winner_profile_id.eq.${profile.id},loser_profile_id.eq.${profile.id}`)
      .order("created_at", { ascending: false })
      .limit(10);

    if (matches && matches.length > 0) {
      const profileIds = new Set<string>();
      const leagueIds = new Set<string>();
      matches.forEach((m) => {
        if (m.winner_profile_id) profileIds.add(m.winner_profile_id);
        if (m.loser_profile_id) profileIds.add(m.loser_profile_id);
        leagueIds.add(m.league_id);
      });

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", Array.from(profileIds));

      const { data: leaguesData } = await supabase
        .from("leagues")
        .select("id, name")
        .in("id", Array.from(leagueIds));

      const profileMap = new Map(profiles?.map((p) => [p.id, p.display_name]) || []);
      const leagueMap = new Map(leaguesData?.map((l) => [l.id, l.name]) || []);

      setRecentMatches(
        matches.map((m) => ({
          id: m.id,
          leagueName: leagueMap.get(m.league_id) || "Unknown",
          winnerName: profileMap.get(m.winner_profile_id || "") || "Unknown",
          loserName: profileMap.get(m.loser_profile_id || "") || "Unknown",
          createdAt: m.created_at,
        }))
      );
    }

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

        {/* Leagues */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" /> Your Leagues
            </h2>
            <Link to="/play" className="text-xs text-primary hover:underline">View all</Link>
          </div>

          {leagues.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-muted-foreground text-sm">No leagues yet. Start playing to join!</p>
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
                      <p className="font-semibold text-foreground">{league.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <TierBadge tier={getTierFromElo(league.elo)} />
                        <span>ELO {league.elo}</span>
                        <span>{league.matchesPlayed} matches</span>
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

          {recentMatches.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-muted-foreground text-sm">No matches yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentMatches.map((match, i) => (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm"
                >
                  <div>
                    <span className="font-medium text-foreground">{match.winnerName}</span>
                    <span className="text-muted-foreground mx-1.5">beat</span>
                    <span className="font-medium text-foreground">{match.loserName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{match.leagueName}</span>
                    <span>·</span>
                    <span>{new Date(match.createdAt).toLocaleDateString()}</span>
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
