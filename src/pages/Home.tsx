import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Swords, ChevronRight, MessageSquare, Crown, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TierBadge from "@/components/TierBadge";
import UserAvatar from "@/components/UserAvatar";
import { getTierFromElo } from "@/lib/mock-data";
import OnboardingFlow from "@/components/OnboardingFlow";
import mogsyLogo from "@/assets/mogsy-logo-text.png";

interface LeagueInfo {
  id: string;
  name: string;
  type: string;
  elo: number;
  matchesPlayed: number;
  lastSwipedAt: string | null;
  category: string | null;
}

interface RecentSwipe {
  id: string;
  leagueName: string;
  leagueType: string;
  winnerName: string;
  loserName: string;
  winnerImage: string;
  loserImage: string;
  createdAt: string;
}

interface TopComment {
  id: string;
  content: string;
  league_name: string;
  reaction_count: number;
  top_emojis: string[];
  profile_name: string;
  profile_avatar: string;
}

interface BannerItem {
  name: string;
  image: string;
  elo: number;
  leagueName: string;
  type: "user" | "preset";
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [suggestedLeagues, setSuggestedLeagues] = useState<LeagueInfo[]>([]);
  const [recentSwipes, setRecentSwipes] = useState<RecentSwipe[]>([]);
  const [topComments, setTopComments] = useState<TopComment[]>([]);
  const [bannerItems, setBannerItems] = useState<BannerItem[]>([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [bannerDelay, setBannerDelay] = useState(4000);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [hasLeagues, setHasLeagues] = useState(false);
  const bannerTimer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (user) checkOnboardingAndLoad();
  }, [user]);

  useEffect(() => {
    if (bannerItems.length <= 1) return;
    bannerTimer.current = setInterval(() => {
      setBannerIndex((i) => (i + 1) % bannerItems.length);
    }, bannerDelay);
    return () => clearInterval(bannerTimer.current);
  }, [bannerItems.length, bannerDelay]);

  const checkOnboardingAndLoad = async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, onboarding_completed, preferred_categories")
      .eq("user_id", user.id)
      .single();

    if (!profile) { setLoading(false); return; }

    if (!profile.onboarding_completed) {
      setShowOnboarding(true);
      setLoading(false);
      return;
    }

    const cats = (profile.preferred_categories as string[]) || [];
    setPreferredCategories(cats);
    await loadData(profile.id, cats);
  };

  const handleOnboardingComplete = async (categories: string[]) => {
    setShowOnboarding(false);
    setPreferredCategories(categories);
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (profile) await loadData(profile.id, categories);
  };

  const loadData = async (profileId: string, cats: string[]) => {
    setLoading(true);

    // Start banner loading immediately in parallel with everything else
    const bannerPromise = loadBannerItems();

    const [
      { data: allLeagues },
      { data: memberships },
      { data: userMatches },
      { data: presetMatches },
    ] = await Promise.all([
      supabase.from("leagues").select("id, name, type, category"),
      supabase.from("league_memberships").select("league_id, elo, matches_played, last_active_at").eq("profile_id", profileId),
      supabase.from("matches")
        .select("id, created_at, league_id, winner_profile_id, loser_profile_id, winner_item_id, loser_item_id")
        .or(`winner_profile_id.eq.${profileId},loser_profile_id.eq.${profileId}`)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("matches")
        .select("id, created_at, league_id, winner_profile_id, loser_profile_id, winner_item_id, loser_item_id")
        .not("winner_item_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const leagueMap = new Map(allLeagues?.map((l) => [l.id, l]) || []);
    const membershipMap = new Map(memberships?.map((m) => [m.league_id, m]) || []);

    const leagueSet = new Set<string>();
    memberships?.forEach((m) => leagueSet.add(m.league_id));

    const matchMap = new Map<string, typeof userMatches extends (infer T)[] | null ? T : never>();
    [...(userMatches || []), ...(presetMatches || [])].forEach((m) => {
      if (!matchMap.has(m.id)) matchMap.set(m.id, m);
      leagueSet.add(m.league_id);
    });
    const allMatches = Array.from(matchMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const leagueMatchCount = new Map<string, { count: number; lastDate: string }>();
    allMatches.forEach((m) => {
      const existing = leagueMatchCount.get(m.league_id);
      if (!existing) {
        leagueMatchCount.set(m.league_id, { count: 1, lastDate: m.created_at });
      } else {
        existing.count++;
      }
    });

    const leagueList: LeagueInfo[] = [];
    leagueSet.forEach((leagueId) => {
      const league = leagueMap.get(leagueId);
      if (!league) return;
      const membership = membershipMap.get(leagueId);
      const matchInfo = leagueMatchCount.get(leagueId);
      leagueList.push({
        id: leagueId,
        name: league.name,
        type: league.type,
        elo: membership?.elo || 1200,
        matchesPlayed: membership?.matches_played || matchInfo?.count || 0,
        lastSwipedAt: membership?.last_active_at || matchInfo?.lastDate || null,
        category: league.category,
      });
    });

    leagueList.sort((a, b) => {
      const dateA = a.lastSwipedAt ? new Date(a.lastSwipedAt).getTime() : 0;
      const dateB = b.lastSwipedAt ? new Date(b.lastSwipedAt).getTime() : 0;
      return dateB - dateA;
    });

    const userOwnLeagues = leagueList.filter((l) => membershipMap.has(l.id));
    setLeagues(userOwnLeagues.slice(0, 6));
    setHasLeagues(userOwnLeagues.length > 0);

    // Build suggested leagues from preferred categories
    if (cats.length > 0) {
      const suggested = (allLeagues || [])
        .filter((l) => l.type === "preset" && l.category && cats.includes(l.category))
        .map((l) => ({
          id: l.id,
          name: l.name,
          type: l.type,
          elo: 1200,
          matchesPlayed: 0,
          lastSwipedAt: null,
          category: l.category,
        }));
      setSuggestedLeagues(suggested.slice(0, 5));
    }

    // Build recent swipes
    const recentMatchesSlice = allMatches.slice(0, 5);
    const profileIds = new Set<string>();
    const itemIds = new Set<string>();
    recentMatchesSlice.forEach((m) => {
      if (m.winner_profile_id) profileIds.add(m.winner_profile_id);
      if (m.loser_profile_id) profileIds.add(m.loser_profile_id);
      if (m.winner_item_id) itemIds.add(m.winner_item_id);
      if (m.loser_item_id) itemIds.add(m.loser_item_id);
    });

    const profileNameMap = new Map<string, { name: string; avatar: string }>();
    const itemNameMap = new Map<string, { name: string; image: string }>();

    if (profileIds.size > 0) {
      const { data } = await supabase.from("public_profiles").select("id, display_name, avatar_url").in("id", Array.from(profileIds));
      data?.forEach((p) => {
        profileNameMap.set(p.id, { name: p.display_name || "Unknown", avatar: p.avatar_url || "" });
      });
    }
    if (itemIds.size > 0) {
      const { data } = await supabase.from("preset_items").select("id, name, image_url").in("id", Array.from(itemIds));
      data?.forEach((it) => {
        itemNameMap.set(it.id, { name: it.name, image: it.image_url || "" });
      });
    }

    const swipes: RecentSwipe[] = recentMatchesSlice.map((m) => {
      const league = leagueMap.get(m.league_id);
      const isPreset = league?.type === "preset";
      let winnerName = "Unknown", loserName = "Unknown", winnerImage = "", loserImage = "";

      if (isPreset) {
        const w = itemNameMap.get(m.winner_item_id || "");
        const l = itemNameMap.get(m.loser_item_id || "");
        winnerName = w?.name || "Unknown"; loserName = l?.name || "Unknown";
        winnerImage = w?.image || ""; loserImage = l?.image || "";
      } else {
        const w = profileNameMap.get(m.winner_profile_id || "");
        const l = profileNameMap.get(m.loser_profile_id || "");
        winnerName = w?.name || "Unknown"; loserName = l?.name || "Unknown";
        winnerImage = w?.avatar || ""; loserImage = l?.avatar || "";
      }

      return { id: m.id, leagueName: league?.name || "Unknown", leagueType: league?.type || "user", winnerName, loserName, winnerImage, loserImage, createdAt: m.created_at };
    });
    setRecentSwipes(swipes);

    loadTopComments();
    await bannerPromise;
    setLoading(false);
  };

  const loadTopComments = async () => {
    const { data: commentsData } = await supabase
      .from("comments")
      .select("id, content, league_id, profile_id, created_at")
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!commentsData || commentsData.length === 0) return;

    const commentIds = commentsData.map((c) => c.id);
    const leagueIds = [...new Set(commentsData.filter((c) => c.league_id).map((c) => c.league_id!))];
    const commentProfileIds = [...new Set(commentsData.map((c) => c.profile_id))];

    const [{ data: reactions }, { data: leaguesData }, { data: profiles }] = await Promise.all([
      supabase.from("comment_reactions").select("comment_id, emoji").in("comment_id", commentIds),
      leagueIds.length > 0 ? supabase.from("leagues").select("id, name").in("id", leagueIds) : Promise.resolve({ data: [] }),
      commentProfileIds.length > 0 ? supabase.from("public_profiles").select("id, display_name, avatar_url").in("id", commentProfileIds) : Promise.resolve({ data: [] }),
    ]);

    const leagueMap2 = new Map((leaguesData || []).map((l) => [l.id, l.name]));
    const profileMap2 = new Map((profiles || []).map((p) => [p.id, { name: p.display_name || "User", avatar: p.avatar_url || "" }]));

    const reactionData = new Map<string, { count: number; emojis: Map<string, number> }>();
    (reactions || []).forEach((r) => {
      if (!reactionData.has(r.comment_id)) reactionData.set(r.comment_id, { count: 0, emojis: new Map() });
      const d = reactionData.get(r.comment_id)!;
      d.count++;
      d.emojis.set(r.emoji, (d.emojis.get(r.emoji) || 0) + 1);
    });

    const withReactions = commentsData.map((c) => {
      const rd = reactionData.get(c.id);
      const topEmojis = rd ? [...rd.emojis.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e) : [];
      const prof = profileMap2.get(c.profile_id);
      return {
        id: c.id,
        content: c.content,
        league_name: c.league_id ? leagueMap2.get(c.league_id) || "" : "",
        reaction_count: rd?.count || 0,
        top_emojis: topEmojis,
        profile_name: prof?.name || "User",
        profile_avatar: prof?.avatar || "",
      };
    });

    withReactions.sort((a, b) => b.reaction_count - a.reaction_count);
    setTopComments(withReactions.slice(0, 5));
  };

  const loadBannerItems = async () => {
    // Load config from app_settings
    const { data: configData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "home_banner_config")
      .single();

    const cfg = configData?.value as unknown as { rotation_delay?: number; mode?: string; manual_items?: { name: string; image: string; elo: number; league_name: string }[] } | null;
    if (cfg?.rotation_delay) setBannerDelay(cfg.rotation_delay);

    if (cfg?.mode === "manual" && cfg.manual_items && cfg.manual_items.length > 0) {
      setBannerItems(cfg.manual_items.map((m) => ({ name: m.name, image: m.image, elo: m.elo, leagueName: m.league_name, type: "preset" as const })));
      return;
    }

    // Auto mode (existing logic)
    const { data: topPresets } = await supabase
      .from("preset_items")
      .select("name, image_url, elo, league_id, leagues!inner(name)")
      .not("image_url", "is", null)
      .not("image_url", "eq", "")
      .order("elo", { ascending: false })
      .limit(10);

    const { data: topMembers } = await supabase
      .from("league_memberships")
      .select("elo, profile_id, league_id, leagues!inner(name)")
      .order("elo", { ascending: false })
      .limit(15);

    const userItems: BannerItem[] = [];
    const presetItems: BannerItem[] = [];

    if (topMembers && topMembers.length > 0) {
      const pIds = [...new Set(topMembers.map((m) => m.profile_id))];
      const { data: profiles } = await supabase.from("public_profiles").select("id, display_name, avatar_url").in("id", pIds);
      const pMap = new Map((profiles || []).map((p) => [p.id, p]));

      topMembers.forEach((m: any) => {
        const p = pMap.get(m.profile_id);
        if (p && p.avatar_url) {
          userItems.push({ name: p.display_name || "User", image: p.avatar_url, elo: m.elo, leagueName: m.leagues?.name || "", type: "user" });
        }
      });
    }

    (topPresets || []).forEach((item: any) => {
      presetItems.push({ name: item.name, image: item.image_url, elo: item.elo, leagueName: item.leagues?.name || "", type: "preset" });
    });

    userItems.sort((a, b) => b.elo - a.elo);
    presetItems.sort((a, b) => b.elo - a.elo);

    const prioritized: BannerItem[] = [...userItems.slice(0, 3), ...presetItems.slice(0, 5)];
    if (userItems.length < 3) {
      const remaining = 8 - prioritized.length;
      prioritized.push(...presetItems.slice(5, 5 + remaining));
    }

    setBannerItems(prioritized.slice(0, 8));
  };

  if (showOnboarding) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background" />
    );
  }

  const currentBanner = bannerItems[bannerIndex];
  const showSuggested = !hasLeagues && suggestedLeagues.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-background px-4 py-8"
    >
      <div className="container mx-auto max-w-3xl">
        {/* Mogsy Logo */}
        <div className="flex justify-center mb-2">
          <img src={mogsyLogo} alt="Mogsy" className="h-28 sm:h-36 md:h-44 -mb-6 object-cover" style={{ clipPath: 'inset(15% 0 15% 0)' }} />
        </div>

        {/* Rotating ELO Banner */}
        {bannerItems.length > 0 && currentBanner && (
          <section className="mb-8">
            <div className="rounded-2xl border border-border bg-card overflow-hidden relative h-28 sm:h-32">
              <AnimatePresence mode="wait">
                <motion.div
                  key={bannerIndex}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.4 }}
                  className="absolute inset-0 flex items-center gap-3 sm:gap-4 px-3 sm:px-5"
                >
                  <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-full overflow-hidden border-2 border-primary/30 flex-shrink-0">
                    <img src={currentBanner.image} alt={currentBanner.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Crown className="h-4 w-4 text-primary" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Top Rated</span>
                    </div>
                    <p className="font-extrabold text-base sm:text-lg text-foreground truncate">{currentBanner.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm font-bold text-primary">{currentBanner.elo} ELO</span>
                      <span className="text-xs text-muted-foreground truncate">in {currentBanner.leagueName}</span>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* Suggested Leagues (from preferences, shown when no own leagues) */}
        {showSuggested && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Star className="h-5 w-5 text-primary" /> Suggested For You
              </h2>
              <Link to="/play" className="text-xs text-primary hover:underline">Browse all</Link>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              {suggestedLeagues.map((league, i) => (
                <motion.div
                  key={league.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link to={`/swipe/preset/${league.id}`}>
                    <motion.div
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-24 h-24 rounded-full border-2 border-border bg-card flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/30 transition-colors"
                    >
                      <Star className="h-4 w-4 text-primary" />
                      <span className="text-[10px] font-bold text-foreground text-center leading-tight px-1 line-clamp-2">{league.name}</span>
                      <span className="text-[8px] text-muted-foreground">{league.category}</span>
                    </motion.div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Your Leagues - Bubble Style */}
        {hasLeagues && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" /> Your Leagues
              </h2>
              <Link to="/leagues" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              {leagues.map((league, i) => (
                <motion.div
                  key={league.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link to={`/leaderboard/${league.id}`}>
                    <motion.div
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-24 h-24 rounded-full border-2 border-border bg-card flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/30 transition-colors"
                    >
                      {league.type !== "preset" ? (
                        <TierBadge tier={getTierFromElo(league.elo)} />
                      ) : (
                        <Star className="h-4 w-4 text-primary" />
                      )}
                      <span className="text-[10px] font-bold text-foreground text-center leading-tight px-1 line-clamp-2">{league.name}</span>
                      <span className="text-[8px] text-muted-foreground">{league.matchesPlayed} swipes</span>
                    </motion.div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* No leagues fallback if also no suggestions */}
        {!hasLeagues && suggestedLeagues.length === 0 && (
          <section className="mb-10">
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-muted-foreground text-sm">No leagues yet. Start swiping to join!</p>
              <Link to="/play" className="text-primary text-sm mt-2 inline-block hover:underline">Start Swiping →</Link>
            </div>
          </section>
        )}

        {/* Recent Swipes */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
            <Swords className="h-5 w-5 text-primary" /> Recent Swipes
          </h2>

          {recentSwipes.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-muted-foreground text-sm">No swipes yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentSwipes.map((swipe, i) => (
                <motion.div
                  key={swipe.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <UserAvatar src={swipe.winnerImage} name={swipe.winnerName} size="sm" />
                    <span className="font-medium text-foreground truncate">{swipe.winnerName}</span>
                    <Swords className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    <UserAvatar src={swipe.loserImage} name={swipe.loserName} size="sm" />
                    <span className="font-medium text-foreground truncate">{swipe.loserName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="truncate max-w-[80px]">{swipe.leagueName}</span>
                    <span>·</span>
                    <span>{new Date(swipe.createdAt).toLocaleDateString()}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Top Comments */}
        {topComments.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
              <MessageSquare className="h-5 w-5 text-primary" /> Top Comments
            </h2>
            <div className="space-y-2">
              {topComments.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <UserAvatar src={c.profile_avatar} name={c.profile_name} size="sm" />
                    <span className="text-xs font-semibold text-foreground">{c.profile_name}</span>
                    {c.league_name && (
                      <span className="text-[10px] text-muted-foreground ml-auto truncate">in {c.league_name}</span>
                    )}
                  </div>
                  <p className="text-xs text-foreground break-words">{c.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {c.top_emojis.length > 0 && (
                      <span className="text-[10px]">{c.top_emojis.join(" ")}</span>
                    )}
                    {c.reaction_count > 0 && (
                      <span className="text-[10px] text-primary font-medium">{c.reaction_count} reactions</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </motion.div>
  );
}
