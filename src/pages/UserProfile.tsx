import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";
import TierBadge from "@/components/TierBadge";
import SEOHead from "@/components/SEOHead";
import { getTierFromElo } from "@/lib/mock-data";
import {
  ArrowLeft, MapPin, Crown, Zap, Trophy, Swords, Calendar,
  Instagram, Youtube, Twitch, Globe, Twitter, ExternalLink, MessageSquare, Shield, Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ProfilePhotoCircles from "@/components/ProfilePhotoCircles";
import ProfileFavoriteCards from "@/components/ProfileFavoriteCards";
import { getThemeById } from "@/lib/profile-themes";

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

  useEffect(() => {
    if (!profileId) return;
    loadProfile();
  }, [profileId]);

  const loadProfile = async () => {
    setLoading(true);

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
        .select("id, name")
        .in("id", leagueIds);

      const leagueMap = new Map((leagues || []).map((l) => [l.id, l.name]));

      // Get ranks for each league
      const statsPromises = membershipsRes.data.map(async (m) => {
        // Count how many members have higher elo
        const { count: higherCount } = await supabase
          .from("league_memberships")
          .select("*", { count: "exact", head: true })
          .eq("league_id", m.league_id)
          .gt("elo", m.elo);

        const { count: totalCount } = await supabase
          .from("league_memberships")
          .select("*", { count: "exact", head: true })
          .eq("league_id", m.league_id);

        return {
          league_id: m.league_id,
          league_name: leagueMap.get(m.league_id) || "Unknown",
          elo: m.elo,
          matches_played: m.matches_played,
          rank: (higherCount || 0) + 1,
          total_members: totalCount || 0,
          tier: getTierFromElo(m.elo),
        };
      });

      const stats = await Promise.all(statsPromises);
      setLeagueStats(stats.sort((a, b) => b.elo - a.elo));
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Profile not found</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={`${profile.display_name || "User"} — Mogsy`}
        description={`View ${profile.display_name}'s profile on Mogsy. ${profile.status_message || ""}`}
      />

      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div className={cn("absolute inset-0", theme.styles.heroBg)} />
        <div className="relative container mx-auto max-w-2xl px-4 pt-6 pb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground mb-4"
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
                <Crown className="h-5 w-5 text-primary" />
              )}
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                {profile.display_name || "Anonymous"}
              </h1>
            </div>

            <div className="flex items-center gap-2 mt-1 flex-wrap justify-center">
              {profile.age && (
                <span className="text-sm text-muted-foreground">{profile.age} years old</span>
              )}
              {profile.age && profile.location && (
                <span className="text-muted-foreground/40">·</span>
              )}
              {profile.location && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {profile.location}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <TierBadge tier={overallTier} />
              {profile.is_pro && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2.5 py-0.5 text-xs font-bold text-primary">
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
                className="mt-3 text-sm text-foreground/70 italic max-w-md"
              >
                "{profile.status_message}"
              </motion.p>
            )}
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto max-w-2xl px-4 pb-12 space-y-5">

        {/* Favorites */}
        {favorites.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-xl border border-border bg-card p-4"
          >
            <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5 text-primary" />
              Favorites
            </h2>
            <ProfileFavoriteCards items={favorites} />
          </motion.div>
        )}

        {/* Quick stats row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <Trophy className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-lg font-extrabold text-foreground">{bestElo}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Best ELO</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <Swords className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-lg font-extrabold text-foreground">{totalMatches}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Matches</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <Shield className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-lg font-extrabold text-foreground">{leagueStats.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Leagues</p>
          </div>
        </motion.div>


        {/* League Rankings */}
        {leagueStats.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl border border-border bg-card p-4"
          >
            <h2 className="text-sm font-bold text-foreground mb-3">League Rankings</h2>
            <div className="space-y-2">
              {leagueStats.map((stat) => (
                <button
                  key={stat.league_id}
                  onClick={() => navigate(`/leaderboard/${stat.league_id}`)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border hover:border-primary/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">
                      #{stat.rank}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{stat.league_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {stat.matches_played} matches · {stat.total_members} members
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TierBadge tier={stat.tier} className="text-[9px] px-1.5 py-0" />
                    <span className="text-sm font-bold text-foreground">{stat.elo}</span>
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
            className="rounded-xl border border-border bg-card p-4"
          >
            <h2 className="text-sm font-bold text-foreground mb-3">Socials</h2>
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
                    className="inline-flex items-center gap-1.5 rounded-lg bg-background/50 border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
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
            className="rounded-xl border border-border bg-card p-4"
          >
            <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              Latest Comment
            </h2>
            <p className="text-sm text-foreground/80 italic">"{topComment.content}"</p>
            {topComment.league_name && (
              <p className="text-[10px] text-muted-foreground mt-1">in {topComment.league_name}</p>
            )}
          </motion.div>
        )}

        {/* Member since */}
        {memberSince && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-2"
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
