import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Users, ChevronRight, Layers, Megaphone } from "lucide-react";
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
  isPromoted: boolean;
  promotedBrandName: string | null;
  promotedBrandLogo: string | null;
}

export default function Leagues() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeagues();
  }, [user]);

  const loadLeagues = async () => {
    const { data: allLeagues } = await supabase
      .from("leagues")
      .select("id, name, type, description, is_system, is_promoted, promoted_brand_name, promoted_brand_logo")
      .order("created_at", { ascending: true });

    if (!allLeagues) { setLoading(false); return; }

    let profileId: string | null = null;
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      profileId = profile?.id || null;
    }

    let membershipMap = new Map<string, { elo: number; matches_played: number }>();
    if (profileId) {
      const { data: memberships } = await supabase.from("league_memberships").select("league_id, elo, matches_played").eq("profile_id", profileId);
      memberships?.forEach((m) => membershipMap.set(m.league_id, { elo: m.elo, matches_played: m.matches_played }));
    }

    const presetLeagueIds = allLeagues.filter((l) => l.type === "preset").map((l) => l.id);
    const { data: profileCount } = await supabase.from("profiles").select("id").neq("display_name", "");
    const totalProfiles = profileCount?.length || 0;

    const itemCountMap = new Map<string, number>();
    if (presetLeagueIds.length > 0) {
      const { data: items } = await supabase.from("preset_items").select("league_id").in("league_id", presetLeagueIds);
      items?.forEach((item) => itemCountMap.set(item.league_id, (itemCountMap.get(item.league_id) || 0) + 1));
    }

    const mapped: LeagueInfo[] = allLeagues.map((l) => {
      const membership = membershipMap.get(l.id);
      const isPreset = l.type === "preset";
      return {
        id: l.id, name: l.name, type: l.type,
        description: l.description || "",
        elo: membership?.elo || 1200,
        matchesPlayed: membership?.matches_played || 0,
        memberCount: isPreset ? (itemCountMap.get(l.id) || 0) : totalProfiles,
        isSystem: l.is_system || false,
        isPromoted: l.is_promoted || false,
        promotedBrandName: l.promoted_brand_name,
        promotedBrandLogo: l.promoted_brand_logo,
      };
    });

    // Sort promoted first
    mapped.sort((a, b) => (b.isPromoted ? 1 : 0) - (a.isPromoted ? 1 : 0));
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

  const LeagueCard = ({ league, i }: { league: LeagueInfo; i: number }) => (
    <motion.div
      key={league.id}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05 }}
    >
      <Link
        to={`/leaderboard/${league.id}`}
        className={`flex items-center justify-between rounded-xl border bg-card p-5 card-hover ${
          league.isPromoted ? "border-primary/40 shadow-[0_0_15px_hsl(210_80%_60%/0.1)]" : "border-border"
        }`}
      >
        <div className="flex items-start gap-3">
          {league.promotedBrandLogo && (
            <img src={league.promotedBrandLogo} alt="" className="h-10 w-10 rounded-lg object-contain bg-secondary p-1 flex-shrink-0" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">{league.name}</h3>
              {league.isPromoted && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                  <Megaphone className="h-3 w-3" /> Promoted
                </span>
              )}
            </div>
            {league.description && <p className="text-xs text-muted-foreground mt-0.5">{league.description}</p>}
            {league.promotedBrandName && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Sponsored by {league.promotedBrandName}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {league.type === "user" && (
                <>
                  <TierBadge tier={getTierFromElo(league.elo)} />
                  <span>ELO {league.elo}</span>
                  <span>·</span>
                </>
              )}
              <span>{league.memberCount} {league.type === "preset" ? "items" : "players"}</span>
              {league.matchesPlayed > 0 && <><span>·</span><span>{league.matchesPlayed} swipes</span></>}
            </div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </Link>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-foreground flex items-center gap-2">
            <Trophy className="h-8 w-8 text-primary" /> Browse Leagues
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{leagues.length} leagues available</p>
        </div>

        {userLeagues.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" /> Player Rankings
            </h2>
            <div className="space-y-3">
              {userLeagues.map((league, i) => <LeagueCard key={league.id} league={league} i={i} />)}
            </div>
          </section>
        )}

        {presetLeagues.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4" /> Preset Leagues
            </h2>
            <div className="space-y-3">
              {presetLeagues.map((league, i) => <LeagueCard key={league.id} league={league} i={i} />)}
            </div>
          </section>
        )}

        {leagues.length === 0 && <p className="text-center text-muted-foreground py-8">No leagues available yet.</p>}
      </div>
    </div>
  );
}
