import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Users, Layers, ArrowLeft, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import UserAvatar from "@/components/UserAvatar";
import TierBadge from "@/components/TierBadge";
import { getTierFromElo, getTierColor } from "@/lib/mock-data";

interface LeagueWithTop5 {
  id: string;
  name: string;
  type: string;
  top5: {
    id: string;
    name: string;
    imageUrl: string;
    elo: number;
    tier: "bronze" | "silver" | "gold" | "platinum";
  }[];
}

export default function Leagues() {
  const navigate = useNavigate();
  const { type: leagueType } = useParams<{ type: string }>();
  const [leagues, setLeagues] = useState<LeagueWithTop5[]>([]);
  const [loading, setLoading] = useState(true);
  const isCompete = leagueType === "compete";

  useEffect(() => {
    loadLeagues();
  }, []);

  const loadLeagues = async () => {
    const filterType = isCompete ? "user" : "preset";
    const { data: allLeagues } = await supabase
      .from("leagues")
      .select("id, name, type")
      .eq("type", filterType)
      .order("created_at", { ascending: true });

    if (!allLeagues) { setLoading(false); return; }

    const results: LeagueWithTop5[] = [];

    // Fetch top 5 for each league in parallel
    const promises = allLeagues.map(async (league) => {
      let top5: LeagueWithTop5["top5"] = [];

      if (league.type === "preset") {
        // Try snapshots first for preset items
        const { data: snapshots } = await supabase
          .from("global_elo_snapshots")
          .select("item_id, elo")
          .eq("league_id", league.id)
          .not("item_id", "is", null)
          .order("elo", { ascending: false })
          .limit(50);

        let eloMap = new Map<string, number>();
        if (snapshots) {
          for (const s of snapshots) {
            if (s.item_id && !eloMap.has(s.item_id)) {
              eloMap.set(s.item_id, s.elo);
            }
          }
        }

        const { data: items } = await supabase
          .from("preset_items")
          .select("id, name, image_url, elo")
          .eq("league_id", league.id)
          .order("elo", { ascending: false })
          .limit(5);

        if (items) {
          top5 = items.map((item) => {
            const elo = eloMap.get(item.id) ?? item.elo;
            return {
              id: item.id,
              name: item.name,
              imageUrl: item.image_url || "",
              elo,
              tier: getTierFromElo(elo),
            };
          });
          top5.sort((a, b) => b.elo - a.elo);
          top5 = top5.slice(0, 5);
        }
      } else {
        // User league: get top 5 from snapshots or memberships
        const { data: snapshots } = await supabase
          .from("global_elo_snapshots")
          .select("profile_id, elo")
          .eq("league_id", league.id)
          .not("profile_id", "is", null)
          .order("elo", { ascending: false })
          .limit(50);

        const eloMap = new Map<string, number>();
        if (snapshots) {
          for (const s of snapshots) {
            if (s.profile_id && !eloMap.has(s.profile_id)) {
              eloMap.set(s.profile_id, s.elo);
            }
          }
        }

        // Also get memberships as fallback
        const { data: memberships } = await supabase
          .from("league_memberships")
          .select("profile_id, elo")
          .eq("league_id", league.id)
          .order("elo", { ascending: false })
          .limit(20);

        if (memberships) {
          for (const m of memberships) {
            if (!eloMap.has(m.profile_id)) {
              eloMap.set(m.profile_id, m.elo);
            }
          }
        }

        // Get top 5 profile IDs by elo
        const sorted = [...eloMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        const profileIds = sorted.map(([id]) => id);

        if (profileIds.length > 0) {
          const { data: profiles } = await supabase
            .from("public_profiles")
            .select("id, display_name, avatar_url")
            .in("id", profileIds);

          if (profiles) {
            const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
            top5 = sorted
              .filter(([id]) => profileMap.has(id))
              .map(([id, elo]) => {
                const p = profileMap.get(id)!;
                return {
                  id: p.id,
                  name: p.display_name || "Unknown",
                  imageUrl: p.avatar_url || "",
                  elo,
                  tier: getTierFromElo(elo),
                };
              });
          }
        }
      }

      return { id: league.id, name: league.name, type: league.type, top5 };
    });

    const resolved = await Promise.all(promises);
    results.push(...resolved);
    setLeagues(results);
    setLoading(false);
  };

  if (loading) {
    return <div className="min-h-screen" />;
  }

  const userLeagues = leagues.filter((l) => l.type === "user");
  const presetLeagues = leagues.filter((l) => l.type === "preset");

  return (
    <div className="min-h-screen px-4 py-8 pb-24">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold text-foreground flex items-center gap-2">
              <Trophy className="h-8 w-8 text-primary" /> Leaderboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{leagues.length} leagues</p>
          </div>
        </div>

        {userLeagues.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Users className="h-4 w-4" /> Compete
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {userLeagues.map((league, i) => (
                <LeagueCard key={league.id} league={league} index={i} onClick={() => navigate(`/leaderboard/${league.id}`)} />
              ))}
            </div>
          </section>
        )}

        {presetLeagues.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Layers className="h-4 w-4" /> Collections
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {presetLeagues.map((league, i) => (
                <LeagueCard key={league.id} league={league} index={i} onClick={() => navigate(`/leaderboard/${league.id}`)} />
              ))}
            </div>
          </section>
        )}

        {leagues.length === 0 && <p className="text-center text-muted-foreground py-8">No leagues available yet.</p>}
      </div>
    </div>
  );
}

function LeagueCard({ league, index, onClick }: { league: LeagueWithTop5; index: number; onClick: () => void }) {
  const isUserLeague = league.type === "user";

  return (
    <motion.button
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onClick}
      className="rounded-xl border border-border bg-card p-4 text-left card-hover w-full hover:border-primary/30 transition-colors"
    >
      <h3 className="text-sm font-bold text-foreground truncate mb-4">{league.name}</h3>

      {league.top5.length > 0 ? (
        <div className="space-y-3">
          {league.top5.map((entry, i) => {
            const rank = i + 1;
            const isTop3 = rank <= 3;
            const circleSize = isTop3 ? "w-16 h-16" : "w-12 h-12";

            return (
              <div key={entry.id} className="flex items-center gap-3">
                <div className="w-5 text-right flex-shrink-0">
                  {rank === 1 ? (
                    <Crown className="h-4 w-4 text-tier-gold inline" />
                  ) : (
                    <span className={`text-xs font-black ${isTop3 ? "text-tier-gold" : "text-muted-foreground"}`}>
                      {rank}
                    </span>
                  )}
                </div>
                {isUserLeague ? (
                  <UserAvatar
                    src={entry.imageUrl}
                    name={entry.name}
                    size={isTop3 ? "lg" : "md"}
                    className={isTop3 ? "avatar-ring" : "ring-1 ring-border"}
                  />
                ) : (
                  <div className={`${circleSize} rounded-full overflow-hidden flex-shrink-0 ${isTop3 ? "avatar-ring" : "ring-1 ring-border"}`}>
                    {entry.imageUrl ? (
                      <img src={entry.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {entry.name.charAt(0)}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground truncate">{entry.name}</span>
                    <TierBadge tier={entry.tier} className="text-[8px] px-1.5 py-0" />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-xs font-black ${getTierColor(entry.tier)}`}>{entry.elo}</div>
                  <div className="text-[8px] text-muted-foreground">AURA</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-4 text-center">No rankings yet</p>
      )}
    </motion.button>
  );
}
