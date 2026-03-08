import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown, ArrowLeft, Swords, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getTierFromElo, getTierColor } from "@/lib/mock-data";
import TierBadge from "@/components/TierBadge";
import UserAvatar from "@/components/UserAvatar";
import SEOHead from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";

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
  const { user } = useAuth();
  const [leagueName, setLeagueName] = useState("");
  const [leagueType, setLeagueType] = useState("");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [localEntries, setLocalEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshotAge, setSnapshotAge] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("global");

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
      await Promise.all([loadPresetLeaderboard(), loadLocalRankings(type)]);
    } else {
      await Promise.all([loadUserLeaderboard(), loadLocalRankings(type)]);
    }

    // Load snapshot age
    await loadSnapshotAge();

    setLoading(false);
  };

  const loadSnapshotAge = async () => {
    if (!leagueId) return;
    const { data } = await supabase
      .from("global_elo_snapshots")
      .select("snapshot_at")
      .eq("league_id", leagueId)
      .order("snapshot_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const mins = Math.floor((Date.now() - new Date(data[0].snapshot_at).getTime()) / 60000);
      setSnapshotAge(mins < 1 ? "just now" : `${mins}m ago`);
    }
  };

  const loadPresetLeaderboard = async () => {
    if (!leagueId) return;

    // Try snapshots first, fall back to live data
    const { data: snapshots } = await supabase
      .from("global_elo_snapshots")
      .select("item_id, elo, snapshot_at")
      .eq("league_id", leagueId)
      .not("item_id", "is", null)
      .order("snapshot_at", { ascending: false });

    // Get latest snapshot per item
    const latestByItem = new Map<string, number>();
    if (snapshots) {
      for (const s of snapshots) {
        if (s.item_id && !latestByItem.has(s.item_id)) {
          latestByItem.set(s.item_id, s.elo);
        }
      }
    }

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
        elo: latestByItem.get(item.id) ?? item.elo,
        tier: getTierFromElo(latestByItem.get(item.id) ?? item.elo),
        isPresetItem: true,
      }));
      mapped.sort((a, b) => b.elo - a.elo);
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

    // Try snapshots first
    const { data: snapshots } = await supabase
      .from("global_elo_snapshots")
      .select("profile_id, elo, snapshot_at")
      .eq("league_id", leagueId)
      .not("profile_id", "is", null)
      .order("snapshot_at", { ascending: false });

    const latestByProfile = new Map<string, number>();
    if (snapshots) {
      for (const s of snapshots) {
        if (s.profile_id && !latestByProfile.has(s.profile_id)) {
          latestByProfile.set(s.profile_id, s.elo);
        }
      }
    }

    const { data: memberships } = await supabase
      .from("league_memberships")
      .select("profile_id, elo")
      .eq("league_id", leagueId);

    const eloMap = new Map<string, number>();
    if (memberships) {
      memberships.forEach((m: any) => eloMap.set(m.profile_id, m.elo));
    }

    const mapped: LeaderboardEntry[] = profiles.map((p: any) => {
      const elo = latestByProfile.get(p.id) ?? eloMap.get(p.id) ?? 1200;
      return {
        id: p.id,
        displayName: p.display_name,
        avatarUrl: p.avatar_url || "",
        location: p.location || "",
        elo,
        tier: getTierFromElo(elo),
      };
    });

    mapped.sort((a, b) => b.elo - a.elo);
    setEntries(mapped);
  };

  const loadLocalRankings = async (type: string) => {
    if (!leagueId || !user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) return;

    const { data: localRanks } = await supabase
      .from("local_rankings")
      .select("item_id, target_profile_id, local_elo")
      .eq("profile_id", profile.id)
      .eq("league_id", leagueId)
      .order("local_elo", { ascending: false });

    if (!localRanks || localRanks.length === 0) return;

    if (type === "preset") {
      const itemIds = localRanks.filter(r => r.item_id).map(r => r.item_id!);
      if (itemIds.length === 0) return;

      const { data: items } = await supabase
        .from("preset_items")
        .select("id, name, image_url")
        .in("id", itemIds);

      if (items) {
        const itemMap = new Map(items.map(i => [i.id, i]));
        const mapped: LeaderboardEntry[] = localRanks
          .filter(r => r.item_id && itemMap.has(r.item_id))
          .map(r => {
            const item = itemMap.get(r.item_id!)!;
            return {
              id: item.id,
              displayName: item.name,
              avatarUrl: "",
              imageUrl: item.image_url || "",
              location: "",
              elo: r.local_elo,
              tier: getTierFromElo(r.local_elo),
              isPresetItem: true,
            };
          });
        setLocalEntries(mapped);
      }
    } else {
      const profileIds = localRanks.filter(r => r.target_profile_id).map(r => r.target_profile_id!);
      if (profileIds.length === 0) return;

      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url, location")
        .in("id", profileIds);

      if (profiles) {
        const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
        const mapped: LeaderboardEntry[] = localRanks
          .filter(r => r.target_profile_id && profileMap.has(r.target_profile_id))
          .map(r => {
            const p = profileMap.get(r.target_profile_id!)!;
            return {
              id: p.id,
              displayName: p.display_name,
              avatarUrl: p.avatar_url || "",
              location: p.location || "",
              elo: r.local_elo,
              tier: getTierFromElo(r.local_elo),
            };
          });
        setLocalEntries(mapped);
      }
    }
  };

  const getSwipeLink = () => {
    if (leagueType === "preset") return `/swipe/preset/${leagueId}`;
    return "/swipe";
  };

  const renderEntries = (list: LeaderboardEntry[]) => (
    <div className="space-y-6">
      {list.map((entry, i) => {
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
              <button onClick={() => navigate(`/user/${entry.id}`)} className="flex-shrink-0">
                <UserAvatar src={entry.avatarUrl} name={entry.displayName} size={isTop3 ? "xl" : "lg"} className={`${isTop3 ? "avatar-ring" : "ring-1 ring-border"} hover:ring-primary/50 transition-all`} />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {entry.isPresetItem ? (
                  <span className="font-bold text-foreground truncate">{entry.displayName}</span>
                ) : (
                  <button onClick={() => navigate(`/user/${entry.id}`)} className="font-bold text-foreground truncate hover:text-primary transition-colors text-left">
                    {entry.displayName}
                  </button>
                )}
                <TierBadge tier={entry.tier} />
              </div>
              {entry.location && <div className="text-sm text-muted-foreground">{entry.location}</div>}
            </div>
            <div className="text-right">
              <div className={`text-lg font-black ${getTierColor(entry.tier)}`}>{entry.elo}</div>
              <div className="text-xs text-muted-foreground">AURA</div>
            </div>
          </motion.div>
        );
      })}
      {list.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No entries yet. Start swiping to populate the leaderboard!</p>
      )}
    </div>
  );

  if (loading) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <SEOHead title={`${leagueName || "Leaderboard"} — Mogsy`} description={`See the top-ranked ${leagueType === "preset" ? "items" : "players"} in ${leagueName || "this league"} on Mogsy. Climb the Elo leaderboard.`} />
      <div className="container mx-auto max-w-2xl">
        <div className="sticky top-16 z-40 bg-background/80 backdrop-blur-xl pb-4 mb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold text-foreground truncate">{leagueName || "Leaderboard"}</h1>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">{entries.length} {leagueType === "preset" ? "items" : "players"}</p>
                {snapshotAge && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                    <Clock className="h-2.5 w-2.5" /> Updated {snapshotAge}
                  </span>
                )}
              </div>
            </div>
            <Link to={getSwipeLink()}>
              <Button variant="default" size="sm" className="gap-1.5 flex-shrink-0">
                <Swords className="h-4 w-4" /> Swipe
              </Button>
            </Link>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="global" className="flex-1">Global</TabsTrigger>
            <TabsTrigger value="yours" className="flex-1">Your Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="global">
            {renderEntries(entries)}
          </TabsContent>

          <TabsContent value="yours">
            {localEntries.length > 0 ? (
              renderEntries(localEntries)
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {user ? "Start swiping to build your personal rankings!" : "Sign in to track your personal rankings."}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
