import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getTierFromElo, getTierColor } from "@/lib/mock-data";
import TierBadge from "@/components/TierBadge";

interface LeaderboardEntry {
  profileId: string;
  displayName: string;
  avatarUrl: string;
  location: string;
  elo: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
}

export default function Leaderboard() {
  const { leagueId } = useParams();
  const [leagueName, setLeagueName] = useState("");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [leagueId]);

  const loadLeaderboard = async () => {
    if (!leagueId) return;

    const { data: league } = await supabase.from("leagues").select("name").eq("id", leagueId).single();
    if (league) setLeagueName(league.name);

    const { data: memberships } = await supabase
      .from("league_memberships")
      .select("profile_id, elo")
      .eq("league_id", leagueId)
      .order("elo", { ascending: false });

    if (memberships && memberships.length > 0) {
      const profileIds = memberships.map((m: any) => m.profile_id);
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url, location").in("id", profileIds);

      if (profiles) {
        const mapped: LeaderboardEntry[] = memberships.map((m: any) => {
          const p = profiles.find((pr: any) => pr.id === m.profile_id);
          return {
            profileId: m.profile_id,
            displayName: p?.display_name || "Unknown",
            avatarUrl: p?.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${m.profile_id}`,
            location: p?.location || "",
            elo: m.elo,
            tier: getTierFromElo(m.elo),
          };
        });
        setEntries(mapped);
      }
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
      <div className="container mx-auto max-w-2xl">
        <div className="sticky top-16 z-40 bg-background/80 backdrop-blur-xl pb-4 mb-4 border-b border-border">
          <h1 className="text-2xl font-extrabold text-foreground">{leagueName || "Leaderboard"}</h1>
          <p className="text-sm text-muted-foreground">{entries.length} players</p>
        </div>

        <div className="space-y-6">
          {entries.map((entry, i) => {
            const rank = i + 1;
            const isTop3 = rank <= 3;
            const size = isTop3 ? "w-24 h-24 sm:w-32 sm:h-32" : "w-16 h-16 sm:w-20 sm:h-20";

            return (
              <motion.div key={entry.profileId} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-4">
                <div className="w-8 text-right">
                  {rank === 1 ? (
                    <Crown className="h-6 w-6 text-tier-gold inline" />
                  ) : (
                    <span className={`text-lg font-black ${rank <= 3 ? "text-tier-gold" : "text-muted-foreground"}`}>{rank}</span>
                  )}
                </div>
                <div className={`${size} rounded-full overflow-hidden flex-shrink-0 ${isTop3 ? "avatar-ring" : "ring-1 ring-border"} transition-all`}>
                  <img src={entry.avatarUrl} alt={entry.displayName} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground truncate">{entry.displayName}</span>
                    <TierBadge tier={entry.tier} />
                  </div>
                  <div className="text-sm text-muted-foreground">{entry.location}</div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-black ${getTierColor(entry.tier)}`}>{entry.elo}</div>
                  <div className="text-xs text-muted-foreground">ELO</div>
                </div>
              </motion.div>
            );
          })}
          {entries.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No rankings yet. Start swiping to populate the leaderboard!</p>
          )}
        </div>
      </div>
    </div>
  );
}
