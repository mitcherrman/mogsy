import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFriendStatus } from "@/hooks/useFriends";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";
import TierBadge from "@/components/TierBadge";
import SEOHead from "@/components/SEOHead";
import { getTierFromElo, getTierFromPercentile, getTierColor, getTierBgColor, getTierIcon, DEFAULT_TIER_CONFIG, type TierConfig } from "@/lib/mock-data";
import {
  ArrowLeft, MapPin, Crown, Zap, Trophy, Swords, Calendar,
  Instagram, Youtube, Twitch, Globe, Twitter, ExternalLink, MessageSquare, Shield, Heart,
  UserPlus, UserCheck, Clock, Bookmark, BookmarkCheck, Ban,
} from "lucide-react";
import FriendActionMenu from "@/components/FriendActionMenu";
import { cn } from "@/lib/utils";
import ProfilePhotoCircles from "@/components/ProfilePhotoCircles";
import ProfileFavoriteCards from "@/components/ProfileFavoriteCards";
import { getThemeById } from "@/lib/profile-themes";
import ThemeOverlay from "@/components/ThemeOverlay";
import RecentMatchups from "@/components/RecentMatchups";

interface ProfileData {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  age: number | null;
  location: string | null;
  status_message: string | null;
  socials: Record<string, string> | null;
  is_pro: boolean | null;
  is_bot: boolean | null;
  profile_frame: string | null;
  active_boost_until: string | null;
  created_at: string | null;
  custom_theme: string | null;
}

interface LeagueStat {
  league_id: string;
  league_name: string;
  category: string;
  elo: number;
  matches_played: number;
  rank: number;
  total_members: number;
  tier: string;
}

interface Photo {
  url: string;
  sort_order: number | null;
}

interface FavoriteItem {
  id: string;
  type: "preset_item" | "user_profile";
  name: string;
  image_url: string | null;
  subtitle?: string;
}

const socialConfig: Record<string, { icon: React.ElementType; label: string }> = {
  instagram: { icon: Instagram, label: "Instagram" },
  tiktok: { icon: ExternalLink, label: "TikTok" },
  youtube: { icon: Youtube, label: "YouTube" },
  x: { icon: Twitter, label: "X" },
  twitch: { icon: Twitch, label: "Twitch" },
  website: { icon: Globe, label: "Website" },
};

const frameClasses: Record<string, string> = {
  default: "",
  gold: "ring-4 ring-yellow-400/60",
  neon: "ring-4 ring-primary/60 shadow-[0_0_20px_hsl(210_80%_60%/0.4)]",
  fire: "ring-4 ring-orange-500/60 shadow-[0_0_20px_hsl(25_100%_50%/0.4)]",
  diamond: "ring-4 ring-cyan-300/60 shadow-[0_0_20px_hsl(180_80%_70%/0.4)]",
};

function SaveButton({ profileId, userId }: { profileId: string; userId: string }) {
  const [saved, setSaved] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("saved_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("saved_profile_id", profileId)
      .maybeSingle()
      .then(({ data }) => {
        setSaved(!!data);
        setLoading(false);
      });
  }, [userId, profileId]);

  const toggle = async () => {
    if (saved) {
      await supabase.from("saved_profiles").delete().eq("user_id", userId).eq("saved_profile_id", profileId);
      setSaved(false);
    } else {
      await supabase.from("saved_profiles").insert({ user_id: userId, saved_profile_id: profileId });
      setSaved(true);
    }
  };

  if (loading) return null;

  return (
    <Button variant={saved ? "outline" : "secondary"} size="sm" onClick={toggle}>
      {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      <span className="ml-1">{saved ? "Saved" : "Save"}</span>
    </Button>
  );
}

function FriendButton({ profileId, friendStatus, friendshipId, refreshFriend, userId }: {
  profileId: string;
  friendStatus: string;
  friendshipId: string | null;
  refreshFriend: () => void;
  userId: string;
}) {
  const [acting, setActing] = useState(false);

  const handleAction = async () => {
    setActing(true);
    if (friendStatus === "none") {
      const { data: myProfile } = await supabase.from("profiles").select("id, display_name").eq("user_id", userId).single();
      if (myProfile) {
        await supabase.from("friendships").insert({ requester_id: myProfile.id, addressee_id: profileId });
      }
    } else if (friendStatus === "pending_received" && friendshipId) {
      await supabase.from("friendships").update({ status: "accepted" }).eq("id", friendshipId);
    } else if (friendshipId) {
      await supabase.from("friendships").delete().eq("id", friendshipId);
    }
    refreshFriend();
    setActing(false);
  };

  const config: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "outline" | "ghost" }> = {
    none: { label: "Add Friend", icon: <UserPlus className="h-4 w-4" />, variant: "default" },
    pending_sent: { label: "Pending", icon: <Clock className="h-4 w-4" />, variant: "outline" },
    pending_received: { label: "Accept", icon: <UserCheck className="h-4 w-4" />, variant: "default" },
    friends: { label: "Friends ✓", icon: <UserCheck className="h-4 w-4" />, variant: "outline" },
  };

  const c = config[friendStatus] || config.none;

  return (
    <Button
      variant={c.variant}
      size="sm"
      onClick={handleAction}
      disabled={acting || friendStatus === "pending_sent"}
    >
      {c.icon}
      <span className="ml-1">{c.label}</span>
    </Button>
  );
}

function ProfileActions({ profileId, friendStatus, friendshipId, refreshFriend, userId }: {
  profileId: string;
  friendStatus: string;
  friendshipId: string | null;
  refreshFriend: () => void;
  userId: string;
}) {
  const [isOwnProfile, setIsOwnProfile] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("id").eq("user_id", userId).single().then(({ data }) => {
      setIsOwnProfile(data?.id === profileId);
    });
  }, [userId, profileId]);

  if (isOwnProfile === null || isOwnProfile) return null;

  if (friendStatus === "blocked") {
    return (
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Ban className="h-3.5 w-3.5" /> Blocked
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      <FriendButton
        profileId={profileId}
        friendStatus={friendStatus}
        friendshipId={friendshipId}
        refreshFriend={refreshFriend}
        userId={userId}
      />
      <SaveButton profileId={profileId} userId={userId} />
      <FriendActionMenu
        targetProfileId={profileId}
        targetName="this user"
        friendshipId={friendshipId || undefined}
        onBlocked={refreshFriend}
      />
    </div>
  );
}

export default function UserProfile() {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [leagueStats, setLeagueStats] = useState<LeagueStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [topComment, setTopComment] = useState<{ content: string; league_name: string } | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [bestCompeteTier, setBestCompeteTier] = useState<string>("unranked");
  const [tierConfig, setTierConfig] = useState<TierConfig[]>(DEFAULT_TIER_CONFIG);
  const [rankEnabled, setRankEnabled] = useState(true);
  const { status: friendStatus, friendshipId, refresh: refreshFriend } = useFriendStatus(profileId);

  useEffect(() => {
    if (!profileId) return;
    loadProfile();
  }, [profileId]);

  const loadProfile = async () => {
    setLoading(true);

    // Load rank config
    const { data: rankData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "rank_tiers")
      .maybeSingle();
    let localTierConfig = DEFAULT_TIER_CONFIG;
    let localRankEnabled = true;
    if (rankData?.value) {
      const val = rankData.value as any;
      localRankEnabled = val.enabled ?? true;
      if (Array.isArray(val.tiers) && val.tiers.length > 0) {
        localTierConfig = val.tiers;
      }
    }
    setTierConfig(localTierConfig);
    setRankEnabled(localRankEnabled);

    // Fetch profile
    const { data: profileData } = await supabase
      .from("public_profiles")
      .select("*")
      .eq("id", profileId)
      .single();

    if (!profileData) {
      setLoading(false);
      return;
    }
    setProfile(profileData as unknown as ProfileData);

    // Fetch photos, league memberships, and top comment in parallel
    const [photosRes, membershipsRes, commentsRes] = await Promise.all([
      supabase
        .from("profile_photos")
        .select("url, sort_order")
        .eq("profile_id", profileId!)
        .order("sort_order"),
      supabase
        .from("league_memberships")
        .select("league_id, elo, matches_played")
        .eq("profile_id", profileId!),
      supabase
        .from("comments")
        .select("content, league_id")
        .eq("profile_id", profileId!)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    if (photosRes.data) {
      setPhotos(photosRes.data);
    }

    // Process league stats with ranks
    if (membershipsRes.data && membershipsRes.data.length > 0) {
      const leagueIds = membershipsRes.data.map((m) => m.league_id);
      const { data: leagues } = await supabase
        .from("leagues")
        .select("id, name, type, category")
        .in("id", leagueIds);

      const leagueMap = new Map((leagues || []).map((l) => [l.id, { name: l.name, type: l.type, category: (l as any).category || "Other" }]));

      // Get ranks for each league
      const statsPromises = membershipsRes.data.map(async (m) => {
        const { count: higherCount } = await supabase
          .from("league_memberships")
          .select("*", { count: "exact", head: true })
          .eq("league_id", m.league_id)
          .gt("elo", m.elo);

        const { count: totalCount } = await supabase
          .from("league_memberships")
          .select("*", { count: "exact", head: true })
          .eq("league_id", m.league_id);

        const leagueInfo = leagueMap.get(m.league_id);
        const rank = (higherCount || 0) + 1;
        const total = totalCount || 0;
        const isCompete = leagueInfo?.type === "user";

        // Use percentile tier for compete leagues, elo-based for collections
        const tier = (isCompete && localRankEnabled)
          ? getTierFromPercentile(rank - 1, total, localTierConfig)
          : getTierFromElo(m.elo);

        return {
          league_id: m.league_id,
          league_name: leagueInfo?.name || "Unknown",
          category: leagueInfo?.category || "Other",
          elo: m.elo,
          matches_played: m.matches_played,
          rank,
          total_members: total,
          tier,
        };
      });

      const stats = await Promise.all(statsPromises);
      setLeagueStats(stats.sort((a, b) => b.elo - a.elo));

      // Determine best compete league tier
      const competeTiers = stats
        .filter(s => leagueMap.get(s.league_id)?.type === "user")
        .map(s => s.tier);
      const tierRank: Record<string, number> = { diamond: 5, gold: 4, silver: 3, bronze: 2, unranked: 1 };
      const best = competeTiers.reduce((best, t) => (tierRank[t] || 0) > (tierRank[best] || 0) ? t : best, "unranked");
      setBestCompeteTier(best);
    }

    // Top comment
    if (commentsRes.data && commentsRes.data.length > 0) {
      const comment = commentsRes.data[0];
      let leagueName = "";
      if (comment.league_id) {
        const { data: league } = await supabase
          .from("leagues")
          .select("name")
          .eq("id", comment.league_id)
          .single();
        leagueName = league?.name || "";
      }
      setTopComment({ content: comment.content, league_name: leagueName });
    }

    // Load favorites
    await loadFavorites(profileId!);

    setLoading(false);
  };

  const loadFavorites = async (pid: string) => {
    // Check admin setting for mode
    const { data: settingData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "favorites_mode")
      .maybeSingle();
    
    const mode = (settingData?.value as any)?.mode || "manual";

    if (mode === "manual") {
      // Load manually pinned favorites
      const { data: favData } = await supabase
        .from("profile_favorites")
        .select("*")
        .eq("profile_id", pid)
        .order("sort_order")
        .limit(5);

      if (favData && favData.length > 0) {
        const items: FavoriteItem[] = [];
        for (const fav of favData) {
          if (fav.item_type === "preset_item") {
            const { data: item } = await supabase
              .from("preset_items")
              .select("id, name, image_url")
              .eq("id", fav.item_id)
              .maybeSingle();
            if (item) items.push({ id: item.id, type: "preset_item", name: item.name, image_url: item.image_url });
          } else {
            const { data: prof } = await supabase
              .from("public_profiles")
              .select("id, display_name, avatar_url")
              .eq("id", fav.item_id)
              .maybeSingle();
            if (prof && prof.id) items.push({ id: prof.id, type: "user_profile", name: prof.display_name || "User", image_url: prof.avatar_url });
          }
        }
        setFavorites(items);
      }
    } else {
      // Auto mode: get top items user voted for in preset matches
      // Since matches don't track the voter for presets, we look at user match wins
      const { data: matchData } = await supabase
        .from("matches")
        .select("winner_item_id")
        .not("winner_item_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (matchData && matchData.length > 0) {
        const counts = new Map<string, number>();
        for (const m of matchData) {
          if (m.winner_item_id) {
            counts.set(m.winner_item_id, (counts.get(m.winner_item_id) || 0) + 1);
          }
        }
        const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
        
        if (topIds.length > 0) {
          const { data: items } = await supabase
            .from("preset_items")
            .select("id, name, image_url")
            .in("id", topIds);
          if (items) {
            setFavorites(items.map((item) => ({
              id: item.id,
              type: "preset_item" as const,
              name: item.name,
              image_url: item.image_url,
            })));
          }
        }
      }
    }
  };

  // Determine best ELO for overall tier
  const bestElo = leagueStats.length > 0 ? Math.max(...leagueStats.map((s) => s.elo)) : 1200;
  const overallTier = getTierFromElo(bestElo);
  const totalMatches = leagueStats.reduce((sum, s) => sum + s.matches_played, 0);
  const isBoosted = profile?.active_boost_until ? new Date(profile.active_boost_until) > new Date() : false;
  const frame = profile?.profile_frame && frameClasses[profile.profile_frame] ? frameClasses[profile.profile_frame] : "";
  const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";
  const socials = (profile?.socials || {}) as Record<string, string>;
  const activeSocials = Object.entries(socials).filter(([, v]) => v && v.trim());
  const theme = getThemeById(profile?.custom_theme || "default");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Profile not found</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative" style={theme.styles.pageBg ? { background: theme.styles.pageBg } : undefined}>
      <ThemeOverlay themeId={theme.id} />
      <SEOHead
        title={`${profile.display_name || "User"} — Mogsy`}
        description={`View ${profile.display_name}'s profile on Mogsy. ${profile.status_message || ""}`}
        image={profile.avatar_url || undefined}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          mainEntity: {
            "@type": "Person",
            name: profile.display_name || "User",
            image: profile.avatar_url || undefined,
            description: profile.status_message || undefined,
            address: profile.location || undefined,
          },
        }}
      />

      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div className={cn("absolute inset-0", theme.styles.heroBg)} />
        <div className="relative container mx-auto max-w-2xl lg:max-w-3xl px-4 pt-6 pb-8 z-20">
            <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className={cn("mb-4", theme.styles.mutedColor || "text-muted-foreground", "hover:opacity-80")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center"
          >
            {/* Avatar / Photo circles */}
            <div className="relative mb-4">
              {photos.length > 0 ? (
                <ProfilePhotoCircles photos={photos} />
              ) : (
                <div
                  className={cn(
                    "w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden",
                    frame || cn("ring-4", theme.styles.accentRing)
                  )}
                >
                  {profile.avatar_url && !profile.avatar_url.includes("dicebear") ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name || ""}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserAvatar name={profile.display_name || ""} size="xl" />
                  )}
                </div>
              )}
              {isBoosted && (
                <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-yellow-500 flex items-center justify-center animate-pulse shadow-lg">
                  <Zap className="h-4 w-4 text-yellow-950" />
                </div>
              )}
            </div>

            {/* Name with crown */}
            <div className="flex items-center gap-2 justify-center">
              {profile.is_pro && (
                <Crown className={cn("h-5 w-5", theme.styles.iconAccent || "text-primary")} />
              )}
              <h1 className={cn("text-2xl sm:text-3xl font-extrabold", theme.styles.nameColor || "text-foreground")}>
                {profile.display_name || "Anonymous"}
              </h1>
            </div>

            <div className="flex items-center gap-2 mt-1 flex-wrap justify-center">
              {profile.age && (
                <span className={cn("text-sm", theme.styles.mutedColor || "text-muted-foreground")}>{profile.age} years old</span>
              )}
              {profile.age && profile.location && (
                <span className={cn("opacity-40", theme.styles.mutedColor || "text-muted-foreground")}>·</span>
              )}
              {profile.location && (
                <span className={cn("text-sm flex items-center gap-1", theme.styles.mutedColor || "text-muted-foreground")}>
                  <MapPin className="h-3 w-3" />
                  {profile.location}
                </span>
              )}
            </div>

            {/* Prominent rank badge */}
            <div className="flex items-center gap-2 mt-3">
              {rankEnabled && bestCompeteTier !== "unranked" && (
                <div className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-extrabold uppercase tracking-wider border-2",
                  getTierBgColor(bestCompeteTier),
                  getTierColor(bestCompeteTier)
                )}>
                  <span className="text-lg">{getTierIcon(bestCompeteTier)}</span>
                  <span>{bestCompeteTier}</span>
                  <Trophy className="h-4 w-4" />
                </div>
              )}
              {rankEnabled && bestCompeteTier === "unranked" && leagueStats.length > 0 && (
                <TierBadge tier="unranked" />
              )}
              {profile.is_pro && (
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", theme.styles.textAccent || "text-primary", "bg-primary/10 border border-primary/30")}>
                  <Crown className="h-3 w-3" /> PRO
                </span>
              )}
            </div>

            {/* Status */}
            {profile.status_message && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className={cn("mt-3 text-sm italic max-w-md", theme.styles.textColor || "text-foreground/70")}
              >
                "{profile.status_message}"
              </motion.p>
            )}

            {/* Friend & Save Buttons */}
            {user && profileId && (
              <ProfileActions
                profileId={profileId}
                friendStatus={friendStatus}
                friendshipId={friendshipId}
                refreshFriend={refreshFriend}
                userId={user.id}
              />
            )}
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto max-w-2xl px-4 pb-12 space-y-5 relative z-20">

        {/* Favorites */}
        {favorites.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className={cn("rounded-xl border bg-card p-4", theme.styles.cardBg)}
          >
            <h2 className={cn("text-sm font-bold mb-2 flex items-center gap-1.5", theme.styles.headingColor || "text-foreground")}>
              <Heart className={cn("h-3.5 w-3.5", theme.styles.iconAccent || "text-primary")} />
              Favorites
            </h2>
            <ProfileFavoriteCards items={favorites} />
          </motion.div>
        )}

        {/* Recent Matchups */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <RecentMatchups profileId={profileId!} themeStyles={theme.styles} />
        </motion.div>

        {/* Quick stats row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          <div className={cn("rounded-xl border p-3 text-center", theme.styles.statBg || "border-border bg-card")}>
            <Trophy className={cn("h-4 w-4 mx-auto mb-1", theme.styles.iconAccent || "text-primary")} />
            <p className={cn("text-lg font-extrabold", theme.styles.nameColor || "text-foreground")}>{bestElo}</p>
            <p className={cn("text-[10px] uppercase tracking-wider", theme.styles.mutedColor || "text-muted-foreground")}>Best AURA</p>
          </div>
          <div className={cn("rounded-xl border p-3 text-center", theme.styles.statBg || "border-border bg-card")}>
            <Swords className={cn("h-4 w-4 mx-auto mb-1", theme.styles.iconAccent || "text-primary")} />
            <p className={cn("text-lg font-extrabold", theme.styles.nameColor || "text-foreground")}>{totalMatches}</p>
            <p className={cn("text-[10px] uppercase tracking-wider", theme.styles.mutedColor || "text-muted-foreground")}>Matches</p>
          </div>
          <div className={cn("rounded-xl border p-3 text-center", theme.styles.statBg || "border-border bg-card")}>
            <Shield className={cn("h-4 w-4 mx-auto mb-1", theme.styles.iconAccent || "text-primary")} />
            <p className={cn("text-lg font-extrabold", theme.styles.nameColor || "text-foreground")}>{leagueStats.length}</p>
            <p className={cn("text-[10px] uppercase tracking-wider", theme.styles.mutedColor || "text-muted-foreground")}>Leagues</p>
          </div>
        </motion.div>


        {/* League Leaderboard */}
        {leagueStats.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={cn("rounded-xl border bg-card p-4", theme.styles.cardBg)}
          >
            <h2 className={cn("text-sm font-bold mb-3", theme.styles.headingColor || "text-foreground")}>League Leaderboard</h2>
            <div className="space-y-2">
              {leagueStats.map((stat) => (
                <button
                  key={stat.league_id}
                  onClick={() => navigate(`/leaderboard/${stat.league_id}`)}
                  className={cn("w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left", theme.styles.innerBg || "bg-background/50", theme.styles.innerBorder || "border-border", "hover:opacity-90")}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs shrink-0", theme.styles.textAccent || "text-primary", theme.styles.innerBg || "bg-primary/10")}>
                      #{stat.rank}
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-sm font-semibold truncate", theme.styles.textColor || "text-foreground")}>{stat.league_name}</p>
                      <p className={cn("text-[10px]", theme.styles.mutedColor || "text-muted-foreground")}>
                        {stat.matches_played} matches · {stat.total_members} members
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TierBadge tier={stat.tier} className="text-[9px] px-1.5 py-0" />
                    <span className={cn("text-sm font-bold", theme.styles.textColor || "text-foreground")}>{stat.elo}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Socials */}
        {activeSocials.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className={cn("rounded-xl border bg-card p-4", theme.styles.cardBg)}
          >
            <h2 className={cn("text-sm font-bold mb-3", theme.styles.headingColor || "text-foreground")}>Socials</h2>
            <div className="flex flex-wrap gap-2">
              {activeSocials.map(([key, value]) => {
                const config = socialConfig[key];
                if (!config) return null;
                const Icon = config.icon;
                return (
                  <a
                    key={key}
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors border", theme.styles.innerBg || "bg-background/50", theme.styles.innerBorder || "border-border", theme.styles.mutedColor || "text-muted-foreground", "hover:opacity-80")}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {config.label}
                  </a>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Latest comment */}
        {topComment && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={cn("rounded-xl border bg-card p-4", theme.styles.cardBg)}
          >
            <h2 className={cn("text-sm font-bold mb-2 flex items-center gap-1.5", theme.styles.headingColor || "text-foreground")}>
              <MessageSquare className={cn("h-3.5 w-3.5", theme.styles.iconAccent || "text-primary")} />
              Latest Comment
            </h2>
            <p className={cn("text-sm italic", theme.styles.textColor || "text-foreground/80")}>"{topComment.content}"</p>
            {topComment.league_name && (
              <p className={cn("text-[10px] mt-1", theme.styles.mutedColor || "text-muted-foreground")}>in {topComment.league_name}</p>
            )}
          </motion.div>
        )}

        {/* Member since */}
        {memberSince && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className={cn("flex items-center justify-center gap-1.5 text-xs pt-2", theme.styles.mutedColor || "text-muted-foreground")}
          >
            <Calendar className="h-3 w-3" />
            Member since {memberSince}
          </motion.div>
        )}
      </div>

      {/* Photo lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <motion.img
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            src={selectedPhoto}
            alt=""
            className="max-w-full max-h-[80vh] rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
