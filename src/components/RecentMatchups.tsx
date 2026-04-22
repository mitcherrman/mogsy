import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import UserAvatar from "@/components/UserAvatar";
import { useNavigate } from "react-router-dom";

interface MatchupInfo {
  id: string;
  league_name: string;
  opponent_id: string;
  opponent_name: string;
  opponent_avatar: string | null;
  won: boolean;
  created_at: string;
}

interface RecentMatchupsProps {
  profileId: string;
  themeStyles?: Record<string, string>;
}

export default function RecentMatchups({ profileId, themeStyles = {} }: RecentMatchupsProps) {
  const [matchups, setMatchups] = useState<MatchupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadMatchups();
  }, [profileId]);

  const loadMatchups = async () => {
    // Fetch recent matches where this profile was involved (user leagues)
    const [winnersRes, losersRes] = await Promise.all([
      supabase
        .from("matches")
        .select("id, league_id, loser_profile_id, created_at")
        .eq("winner_profile_id", profileId)
        .not("loser_profile_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("matches")
        .select("id, league_id, winner_profile_id, created_at")
        .eq("loser_profile_id", profileId)
        .not("winner_profile_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const combined: { id: string; league_id: string; opponent_id: string; won: boolean; created_at: string }[] = [];

    for (const m of winnersRes.data || []) {
      if (m.loser_profile_id) combined.push({ id: m.id, league_id: m.league_id, opponent_id: m.loser_profile_id, won: true, created_at: m.created_at });
    }
    for (const m of losersRes.data || []) {
      if (m.winner_profile_id) combined.push({ id: m.id, league_id: m.league_id, opponent_id: m.winner_profile_id, won: false, created_at: m.created_at });
    }

    // Sort by date, take 5 most recent
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const top5 = combined.slice(0, 5);

    if (top5.length === 0) { setLoading(false); return; }

    // Fetch opponent profiles and league names
    const opponentIds = [...new Set(top5.map(m => m.opponent_id))];
    const leagueIds = [...new Set(top5.map(m => m.league_id))];

    const [profilesRes, leaguesRes] = await Promise.all([
      supabase.from("public_profiles").select("id, display_name, avatar_url").in("id", opponentIds),
      supabase.from("leagues").select("id, name").in("id", leagueIds),
    ]);

    const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
    const leagueMap = new Map((leaguesRes.data || []).map(l => [l.id, l.name]));

    const results: MatchupInfo[] = top5.map(m => {
      const opp = profileMap.get(m.opponent_id);
      return {
        id: m.id,
        league_name: leagueMap.get(m.league_id) || "Unknown",
        opponent_id: m.opponent_id,
        opponent_name: opp?.display_name || "Unknown",
        opponent_avatar: opp?.avatar_url || null,
        won: m.won,
        created_at: m.created_at,
      };
    });

    setMatchups(results);
    setLoading(false);
  };

  if (loading || matchups.length === 0) return null;

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className={cn("rounded-xl border bg-card p-4", themeStyles.cardBg)}>
      <h2 className={cn("text-sm font-bold mb-3 flex items-center gap-1.5", themeStyles.headingColor || "text-foreground")}>
        <Swords className={cn("h-3.5 w-3.5", themeStyles.iconAccent || "text-primary")} />
        Recent Matchups
      </h2>
      <div className="space-y-2">
        {matchups.map(m => (
          <button
            key={m.id}
            onClick={() => navigate(`/profile/${m.opponent_id}`)}
            className={cn(
              "w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left",
              themeStyles.innerBg || "bg-background/50",
              themeStyles.innerBorder || "border-border",
              "hover:opacity-90"
            )}
          >
            <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden">
              {m.opponent_avatar && !m.opponent_avatar.includes("dicebear") ? (
                <img src={m.opponent_avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserAvatar name={m.opponent_name} size="sm" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                  m.won ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"
                )}>
                  {m.won ? "W" : "L"}
                </span>
                <span className={cn("text-sm font-semibold truncate", themeStyles.textColor || "text-foreground")}>
                  vs {m.opponent_name}
                </span>
              </div>
              <p className={cn("text-[10px]", themeStyles.mutedColor || "text-muted-foreground")}>
                {m.league_name} · {timeAgo(m.created_at)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}