import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TierBadge from "@/components/TierBadge";
import { getTierFromElo } from "@/lib/mock-data";

interface LeagueInfo {
  id: string;
  name: string;
  elo: number;
  matchesPlayed: number;
  memberCount: number;
}

export default function Leagues() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeagues();
  }, [user]);

  const loadLeagues = async () => {
    // Get user's profile
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
    if (!profile) { setLoading(false); return; }

    // Get memberships
    const { data: memberships } = await supabase
      .from("league_memberships")
      .select("league_id, elo, matches_played")
      .eq("profile_id", profile.id);

    if (!memberships || memberships.length === 0) {
      // Show all user leagues even if not a member
      const { data: allLeagues } = await supabase.from("leagues").select("*").eq("type", "user");
      if (allLeagues) {
        setLeagues(allLeagues.map((l: any) => ({ id: l.id, name: l.name, elo: 1200, matchesPlayed: 0, memberCount: 0 })));
      }
      setLoading(false);
      return;
    }

    const leagueIds = memberships.map((m: any) => m.league_id);
    const { data: leagueData } = await supabase.from("leagues").select("*").in("id", leagueIds);

    if (leagueData) {
      setLeagues(leagueData.map((l: any) => {
        const mem = memberships.find((m: any) => m.league_id === l.id);
        return { id: l.id, name: l.name, elo: mem?.elo || 1200, matchesPlayed: mem?.matches_played || 0, memberCount: 0 };
      }));
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
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-foreground flex items-center gap-2">
            <Trophy className="h-8 w-8 text-primary" /> Your Leagues
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Track your rank across leagues</p>
        </div>

        <div className="space-y-4">
          {leagues.map((league, i) => (
            <motion.div key={league.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Link to={`/leaderboard/${league.id}`} className="block rounded-2xl border border-border bg-card p-6 card-hover">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{league.name}</h3>
                    <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                      <TierBadge tier={getTierFromElo(league.elo)} />
                      <span>ELO {league.elo}</span>
                      <span>{league.matchesPlayed} matches</span>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
          {leagues.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No leagues yet. Start swiping to join the Global Rankings!</p>
          )}
        </div>
      </div>
    </div>
  );
}
