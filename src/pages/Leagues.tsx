import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Users, ChevronRight, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TierBadge from "@/components/TierBadge";
import { getTierFromElo } from "@/lib/mock-data";

interface LeagueInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  elo: number;
  matchesPlayed: number;
  memberCount: number;
  isSystem: boolean;
}

export default function Leagues() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeagues();
  }, [user]);

  const loadLeagues = async () => {
    // Fetch all leagues
    const { data: allLeagues } = await supabase
      .from("leagues")
      .select("id, name, type, description, is_system")
      .order("created_at", { ascending: true });

    if (!allLeagues) {
      setLoading(false);
      return;
    }

    // Get user's profile for ELO data
    let profileId: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      profileId = profile?.id || null;
    }

    // Get user memberships for ELO
    let membershipMap = new Map<string, { elo: number; matches_played: number }>();
    if (profileId) {
      const { data: memberships } = await supabase
        .from("league_memberships")
        .select("league_id, elo, matches_played")
        .eq("profile_id", profileId);
      memberships?.forEach((m) => {
        membershipMap.set(m.league_id, { elo: m.elo, matches_played: m.matches_played });
      });
    }

    // Get member counts for user leagues
    const userLeagueIds = allLeagues.filter((l) => l.type === "user").map((l) => l.id);
    const presetLeagueIds = allLeagues.filter((l) => l.type === "preset").map((l) => l.id);

    // Count profiles with display names for user leagues (all profiles participate)
    const { data: profileCount } = await supabase
      .from("profiles")
      .select("id")
      .neq("display_name", "");

    const totalProfiles = profileCount?.length || 0;

    // Get item counts per preset league
    const itemCountMap = new Map<string, number>();
    if (presetLeagueIds.length > 0) {
      const { data: items } = await supabase
        .from("preset_items")
        .select("league_id")
        .in("league_id", presetLeagueIds);
      items?.forEach((item) => {
        itemCountMap.set(item.league_id, (itemCountMap.get(item.league_id) || 0) + 1);
      });
    }

    const mapped: LeagueInfo[] = allLeagues.map((l) => {
      const membership = membershipMap.get(l.id);
      const isPreset = l.type === "preset";
      return {
        id: l.id,
        name: l.name,
        type: l.type,
        description: l.description || "",
        elo: membership?.elo || 1200,
        matchesPlayed: membership?.matches_played || 0,
        memberCount: isPreset ? (itemCountMap.get(l.id) || 0) : totalProfiles,
        isSystem: l.is_system || false,
      };
    });

    setLeagues(mapped);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const userLeagues = leagues.filter((l) => l.type === "user");
  const presetLeagues = leagues.filter((l) => l.type === "preset");

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-foreground flex items-center gap-2">
            <Trophy className="h-8 w-8 text-primary" /> Browse Leagues
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {leagues.length} leagues available
          </p>
        </div>

        {/* User Leagues */}
        {userLeagues.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" /> Player Rankings
            </h2>
            <div className="space-y-3">
              {userLeagues.map((league, i) => (
                <motion.div
                  key={league.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    to={`/leaderboard/${league.id}`}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-5 card-hover"
                  >
                    <div>
                      <h3 className="text-base font-bold text-foreground">{league.name}</h3>
                      {league.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{league.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <TierBadge tier={getTierFromElo(league.elo)} />
                        <span>ELO {league.elo}</span>
                        <span>·</span>
                        <span>{league.memberCount} players</span>
                        {league.matchesPlayed > 0 && (
                          <>
                            <span>·</span>
                            <span>{league.matchesPlayed} swipes</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Preset Leagues */}
        {presetLeagues.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4" /> Preset Leagues
            </h2>
            <div className="space-y-3">
              {presetLeagues.map((league, i) => (
                <motion.div
                  key={league.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    to={`/leaderboard/${league.id}`}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-5 card-hover"
                  >
                    <div>
                      <h3 className="text-base font-bold text-foreground">{league.name}</h3>
                      {league.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{league.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{league.memberCount} items</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {leagues.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No leagues available yet.</p>
        )}
      </div>
    </div>
  );
}
