import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown, ArrowLeft, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getTierFromElo, getTierColor } from "@/lib/mock-data";
import TierBadge from "@/components/TierBadge";
import UserAvatar from "@/components/UserAvatar";
import SEOHead from "@/components/SEOHead";

interface LeaderboardEntry {
  id: string;
  displayName: string;
  avatarUrl: string;
  location: string;
  elo: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  imageUrl?: string;
  isPresetItem?: boolean;
}

export default function Leaderboard() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [leagueName, setLeagueName] = useState("");
  const [leagueType, setLeagueType] = useState("");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [leagueId]);

  const loadLeaderboard = async () => {
    if (!leagueId) return;

    const { data: league } = await supabase.from("leagues").select("name, type").eq("id", leagueId).single();
    if (league) {
      setLeagueName(league.name);
      setLeagueType(league.type);
    }

    const type = league?.type || "user";

    if (type === "preset") {
      await loadPresetLeaderboard();
    } else {
      await loadUserLeaderboard();
    }

    setLoading(false);
  };

  const loadPresetLeaderboard = async () => {
    if (!leagueId) return;
    const { data: items } = await supabase
      .from("preset_items")
      .select("id, name, image_url, elo")
      .eq("league_id", leagueId)
      .order("elo", { ascending: false });

    if (items) {
      const mapped: LeaderboardEntry[] = items.map((item) => ({
        id: item.id,
        displayName: item.name,
        avatarUrl: "",
        imageUrl: item.image_url || "",
        location: "",
        elo: item.elo,
        tier: getTierFromElo(item.elo),
        isPresetItem: true,
      }));
      setEntries(mapped);
    }
  };

  const loadUserLeaderboard = async () => {
    if (!leagueId) return;

    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url, location")
      .neq("display_name", "");

    if (!profiles || profiles.length === 0) return;

    const { data: memberships } = await supabase
      .from("league_memberships")
      .select("profile_id, elo")
      .eq("league_id", leagueId);

    const eloMap = new Map<string, number>();
    if (memberships) {
      memberships.forEach((m: any) => eloMap.set(m.profile_id, m.elo));
    }

    const mapped: LeaderboardEntry[] = profiles.map((p: any) => ({
      id: p.id,
      displayName: p.display_name,
      avatarUrl: p.avatar_url || "",
      location: p.location || "",
      elo: eloMap.get(p.id) ?? 1200,
      tier: getTierFromElo(eloMap.get(p.id) ?? 1200),
    }));

    mapped.sort((a, b) => b.elo - a.elo);
    setEntries(mapped);
  };

  const getSwipeLink = () => {
    if (leagueType === "preset") return `/swipe/preset/${leagueId}`;
    return "/swipe";
  };

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <SEOHead title={`${leagueName || "Leaderboard"} — Mogsy`} description={`See the top-ranked ${leagueType === "preset" ? "items" : "players"} in ${leagueName || "this league"} on Mogsy. Climb the Elo leaderboard.`} />
      <div className="container mx-auto max-w-2xl">
        <div className="sticky top-16 z-40 bg-background/80 backdrop-blur-xl pb-4 mb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold text-foreground truncate">{leagueName || "Leaderboard"}</h1>
              <p className="text-sm text-muted-foreground">{entries.length} {leagueType === "preset" ? "items" : "players"}</p>
            </div>
            <Link to={getSwipeLink()}>
              <Button variant="default" size="sm" className="gap-1.5 flex-shrink-0">
                <Swords className="h-4 w-4" /> Swipe
              </Button>
            </Link>
          </div>
        </div>

        <div className="space-y-6">
          {entries.map((entry, i) => {
            const rank = i + 1;
            const isTop3 = rank <= 3;
            const size = isTop3 ? "w-24 h-24 sm:w-32 sm:h-32" : "w-16 h-16 sm:w-20 sm:h-20";

            return (
              <motion.div key={entry.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-4">
                <div className="w-8 text-right">
                  {rank === 1 ? (
                    <Crown className="h-6 w-6 text-tier-gold inline" />
                  ) : (
                    <span className={`text-lg font-black ${rank <= 3 ? "text-tier-gold" : "text-muted-foreground"}`}>{rank}</span>
                  )}
                </div>
                {entry.isPresetItem ? (
                  <div className={`${size} rounded-full overflow-hidden flex-shrink-0 ${isTop3 ? "avatar-ring" : "ring-1 ring-border"} transition-all`}>
                    {entry.imageUrl ? (
                      <img src={entry.imageUrl} alt={entry.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground">
                        {entry.displayName.charAt(0)}
                      </div>
                    )}
                  </div>
                ) : (
                  <UserAvatar src={entry.avatarUrl} name={entry.displayName} size={isTop3 ? "xl" : "lg"} className={isTop3 ? "avatar-ring" : "ring-1 ring-border"} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground truncate">{entry.displayName}</span>
                    <TierBadge tier={entry.tier} />
                  </div>
                  {entry.location && <div className="text-sm text-muted-foreground">{entry.location}</div>}
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
