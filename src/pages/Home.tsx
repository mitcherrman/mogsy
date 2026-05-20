import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Swords,
  ChevronRight,
  MessageSquare,
  Crown,
  Star,
  Sparkles,
  TrendingUp,
  Gift,
  MessageSquarePlus,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TierBadge from "@/components/TierBadge";
import UserAvatar from "@/components/UserAvatar";
import { getTierFromElo } from "@/lib/mock-data";
import OnboardingFlow from "@/components/OnboardingFlow";
import CategoryBubble from "@/components/CategoryBubble";
import mogsyLogo from "@/assets/mogsy-text-logo.png";
import HomeFriendsSection from "@/components/HomeFriendsSection";
import HomeBlogStrip from "@/components/blog/HomeBlogStrip";
import { getCuratedConfig, clearCuratedConfig } from "@/pages/CustomLink";
import SEOHead from "@/components/SEOHead";

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
  profile_id: string;
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

interface PreviewImage {
  league_id: string;
  category: string;
  image_url: string;
}

interface CategorySection {
  title: string;
  icon: React.ReactNode;
  categories: { name: string; image: string | null; subcategories: { name: string; image: string | null }[] }[];
}

interface MostPlayedLeague {
  id: string;
  name: string;
  type: string;
  matchesPlayed: number;
  image: string | null;
  category: string | null;
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [recentSwipes, setRecentSwipes] = useState<RecentSwipe[]>([]);
  const [topComments, setTopComments] = useState<TopComment[]>([]);
  const [bannerItems, setBannerItems] = useState<BannerItem[]>([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [bannerDelay, setBannerDelay] = useState(4000);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [hasLeagues, setHasLeagues] = useState(false);
  const [categorySections, setCategorySections] = useState<CategorySection[]>([]);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [playCollections, setPlayCollections] = useState<MostPlayedLeague[]>([]);
  const [playCompetes, setPlayCompetes] = useState<MostPlayedLeague[]>([]);
  const [curatedLeagues, setCuratedLeagues] = useState<{ id: string; name: string; image: string | null }[]>([]);
  const bannerTimer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (user) {
      // Reset state when user identity changes
      setLoading(true);
      setLeagues([]);
      setRecentSwipes([]);
      setTopComments([]);
      setBannerItems([]);
      setHasLeagues(false);
      setCategorySections([]);
      setPlayCollections([]);
      setPlayCompetes([]);
      setCuratedLeagues([]);
      checkOnboardingAndLoad();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (bannerItems.length <= 1) return;
    bannerTimer.current = setInterval(() => {
      setBannerIndex((i) => (i + 1) % bannerItems.length);
    }, bannerDelay);
    return () => clearInterval(bannerTimer.current);
  }, [bannerItems.length, bannerDelay]);

  const getCategoryImage = useCallback(
    (category: string) => {
      const catImages = previewImages.filter((img) => img.category === category);
      return catImages[0]?.image_url || null;
    },
    [previewImages],
  );

  const checkOnboardingAndLoad = async () => {
    if (!user) return;

    // The profile trigger may not have fired yet for brand-new users — retry a few times
    let profile: { id: string; onboarding_completed: boolean | null; preferred_categories: string[] | null } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabase
        .from("profiles")
        .select("id, onboarding_completed, preferred_categories")
        .eq("user_id", user.id)
        .single();
      if (data) {
        profile = data;
        break;
      }
      // Wait before retrying
      await new Promise((r) => setTimeout(r, 600));
    }

    if (!profile) {
      // Still no profile after retries — show onboarding so the user isn't stuck on a blank screen
      setShowOnboarding(true);
      setLoading(false);
      return;
    }

    if (!profile.onboarding_completed) {
      setShowOnboarding(true);
      setLoading(false);
      return;
    }

    const cats = (profile.preferred_categories as string[]) || [];
    setPreferredCategories(cats);
    await loadData(profile.id, cats);

    // Load curated leagues from custom link if present
    const curated = getCuratedConfig();
    if (curated && curated.recommended_league_ids.length > 0) {
      const { data: curatedData } = await supabase
        .from("leagues")
        .select("id, name")
        .in("id", curated.recommended_league_ids);
      if (curatedData && curatedData.length > 0) {
        // Get preview images for these leagues
        const leagueIds = curatedData.map((l) => l.id);
        const { data: items } = await supabase
          .from("preset_items")
          .select("league_id, image_url")
          .in("league_id", leagueIds)
          .not("image_url", "is", null)
          .not("image_url", "eq", "")
          .limit(20);
        const imgMap = new Map<string, string>();
        items?.forEach((i) => {
          if (!imgMap.has(i.league_id)) imgMap.set(i.league_id, i.image_url!);
        });
        setCuratedLeagues(curatedData.map((l) => ({ id: l.id, name: l.name, image: imgMap.get(l.id) || null })));
      }
      clearCuratedConfig();
    }
  };

  const handleOnboardingComplete = async (categories: string[]) => {
    // Enter loading state in the same render that hides onboarding so we
    // don't paint a frame of empty Home sections (template/outline flash).
    setLoading(true);
    setShowOnboarding(false);
    setPreferredCategories(categories);
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
    if (profile) await loadData(profile.id, categories);
    else setLoading(false);
  };

  const loadData = async (profileId: string, cats: string[]) => {
    setLoading(true);

    const bannerPromise = loadBannerItems();
    const imagesPromise = loadPreviewImages();

    const [{ data: allLeagues }, { data: memberships }, { data: userMatches }, { data: presetMatches }] =
      await Promise.all([
        supabase.from("leagues").select("id, name, type, category, subcategory"),
        supabase
          .from("league_memberships")
          .select("league_id, elo, matches_played, last_active_at")
          .eq("profile_id", profileId),
        supabase
          .from("matches")
          .select("id, created_at, league_id, winner_profile_id, loser_profile_id, winner_item_id, loser_item_id")
          .or(`winner_profile_id.eq.${profileId},loser_profile_id.eq.${profileId}`)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("matches")
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
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
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

    // Build most-played section
    const userPresetLeagues = userOwnLeagues
      .filter((l) => l.type === "preset")
      .sort((a, b) => b.matchesPlayed - a.matchesPlayed);
    const userCompeteLeagues = userOwnLeagues
      .filter((l) => l.type === "user")
      .sort((a, b) => b.matchesPlayed - a.matchesPlayed);

    // Get global most-played as fallback
    const globalLeagueMatchCount = new Map<string, number>();
    allMatches.forEach((m) => {
      globalLeagueMatchCount.set(m.league_id, (globalLeagueMatchCount.get(m.league_id) || 0) + 1);
    });

    const globalPresetLeagues = (allLeagues || [])
      .filter((l) => l.type === "preset")
      .map((l) => ({ ...l, globalPlays: globalLeagueMatchCount.get(l.id) || 0 }))
      .sort((a, b) => b.globalPlays - a.globalPlays);

    const globalCompeteLeagues = (allLeagues || [])
      .filter((l) => l.type === "user")
      .map((l) => ({ ...l, globalPlays: globalLeagueMatchCount.get(l.id) || 0 }))
      .sort((a, b) => b.globalPlays - a.globalPlays);

    // Fetch preview image for the top collection league
    // Pick top 2 collection and top 2 compete leagues
    const toPlayLeague = (l: any, type: string): MostPlayedLeague => ({
      id: l.id,
      name: l.name,
      type,
      matchesPlayed: l.matchesPlayed ?? l.globalPlays ?? 0,
      image: null,
      category: l.category || null,
    });

    const topCollections: MostPlayedLeague[] = [];
    const usedCollectionIds = new Set<string>();
    userPresetLeagues.forEach((l) => {
      if (topCollections.length < 2) {
        topCollections.push(toPlayLeague(l, "preset"));
        usedCollectionIds.add(l.id);
      }
    });
    globalPresetLeagues.forEach((l) => {
      if (topCollections.length < 2 && !usedCollectionIds.has(l.id)) {
        topCollections.push(toPlayLeague(l, "preset"));
        usedCollectionIds.add(l.id);
      }
    });

    const topCompetes: MostPlayedLeague[] = [];
    const usedCompeteIds = new Set<string>();
    userCompeteLeagues.forEach((l) => {
      if (topCompetes.length < 2) {
        topCompetes.push(toPlayLeague(l, "user"));
        usedCompeteIds.add(l.id);
      }
    });
    globalCompeteLeagues.forEach((l) => {
      if (topCompetes.length < 2 && !usedCompeteIds.has(l.id)) {
        topCompetes.push(toPlayLeague(l, "user"));
        usedCompeteIds.add(l.id);
      }
    });

    // Get images for these leagues
    const playLeagueIds = [...topCollections, ...topCompetes].map((l) => l.id);
    let playLeagueImages = new Map<string, string>();
    if (playLeagueIds.length > 0) {
      const { data: playItems } = await supabase
        .from("preset_items")
        .select("league_id, image_url")
        .in("league_id", playLeagueIds)
        .not("image_url", "is", null)
        .not("image_url", "eq", "")
        .limit(20);
      playItems?.forEach((pi) => {
        if (!playLeagueImages.has(pi.league_id)) playLeagueImages.set(pi.league_id, pi.image_url!);
      });
    }

    topCollections.forEach((l) => {
      l.image = playLeagueImages.get(l.id) || null;
    });
    setPlayCollections(topCollections);
    setPlayCompetes(topCompetes);

    // Wait for images before building category sections
    await imagesPromise;

    // Build category sections
    const presetLeagues = (allLeagues || []).filter((l) => l.type === "preset");
    const categoryMap = new Map<string, { subcategories: Set<string> }>();
    presetLeagues.forEach((l) => {
      const cat = l.category || "Other";
      if (!categoryMap.has(cat)) categoryMap.set(cat, { subcategories: new Set() });
      if (l.subcategory) categoryMap.get(cat)!.subcategories.add(l.subcategory);
    });

    const allCategoryNames = Array.from(categoryMap.keys()).filter((c) => c !== "Other");

    // User's most-played categories
    const userCategoryPlayCount = new Map<string, number>();
    userOwnLeagues.forEach((l) => {
      if (l.category && l.type === "preset") {
        userCategoryPlayCount.set(l.category, (userCategoryPlayCount.get(l.category) || 0) + l.matchesPlayed);
      }
    });
    // Also count from matches in preset leagues
    allMatches.forEach((m) => {
      const league = leagueMap.get(m.league_id);
      if (league?.type === "preset" && league.category) {
        userCategoryPlayCount.set(league.category, (userCategoryPlayCount.get(league.category) || 0) + 1);
      }
    });

    const buildSection = (catNames: string[]): CategorySection["categories"] => {
      const cats = catNames.slice(0, 2).map((catName) => {
        const catData = categoryMap.get(catName);
        const subs = catData ? Array.from(catData.subcategories) : [];
        return {
          name: catName,
          image: getCategoryImage(catName),
          subcategories: subs.map((s) => ({ name: s, image: null })),
        };
      });

      // Ensure exactly 2 subcategories total across the section
      const allSubs = cats.flatMap((c) => c.subcategories.map((s) => ({ catName: c.name, sub: s })));
      if (allSubs.length < 2) {
        // Fill missing slots with extra categories as subcategory-sized bubbles
        const usedNames = new Set([...cats.map((c) => c.name), ...allSubs.map((s) => s.sub.name)]);
        const extraCats = allCategoryNames.filter((c) => !usedNames.has(c));
        let idx = 0;
        while (allSubs.length < 2 && idx < extraCats.length) {
          const extraName = extraCats[idx++];
          // Add as a subcategory-like entry on the first category
          cats[0].subcategories.push({ name: extraName, image: getCategoryImage(extraName) });
          allSubs.push({ catName: cats[0].name, sub: { name: extraName, image: getCategoryImage(extraName) } });
        }
      }
      // Trim to max 2 subcategories total (1 per category preferred)
      let subCount = 0;
      cats.forEach((c) => {
        const allowed = Math.min(c.subcategories.length, 2 - subCount);
        c.subcategories = c.subcategories.slice(0, Math.max(allowed, 0));
        subCount += c.subcategories.length;
      });

      // If we still need exactly 2 categories, fill from available
      while (cats.length < 2) {
        const usedNames = new Set(cats.map((c) => c.name));
        const extra = allCategoryNames.find((c) => !usedNames.has(c));
        if (!extra) break;
        cats.push({ name: extra, image: getCategoryImage(extra), subcategories: [] });
      }

      return cats;
    };

    const sections: CategorySection[] = [];

    // 1. Suggested For You — from preferred categories
    const suggestedCats =
      cats.length > 0 ? allCategoryNames.filter((c) => cats.includes(c)) : allCategoryNames.slice(0, 3);
    if (suggestedCats.length > 0) {
      // Fill to 3 if needed
      const filled = [...suggestedCats];
      allCategoryNames.forEach((c) => {
        if (filled.length < 3 && !filled.includes(c)) filled.push(c);
      });
      sections.push({
        title: "For You",
        icon: <Star className="h-5 w-5 text-primary" />,
        categories: buildSection(filled),
      });
    }

    // 2. Your Top Categories — most played
    const topPlayedCats = Array.from(userCategoryPlayCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat)
      .filter((c) => c !== "Other");
    if (topPlayedCats.length > 0) {
      const filled = [...topPlayedCats];
      allCategoryNames.forEach((c) => {
        if (filled.length < 3 && !filled.includes(c)) filled.push(c);
      });
      sections.push({
        title: "Top Picks",
        icon: <TrendingUp className="h-5 w-5 text-primary" />,
        categories: buildSection(filled),
      });
    } else if (allCategoryNames.length >= 4) {
      // Fill with categories not used in "For You"
      const usedInSuggested = new Set(suggestedCats.slice(0, 2));
      const remaining = allCategoryNames.filter((c) => !usedInSuggested.has(c));
      sections.push({
        title: "Top Picks",
        icon: <TrendingUp className="h-5 w-5 text-primary" />,
        categories: buildSection(remaining),
      });
    }
    // 3. Recommended — categories user hasn't engaged with much
    const usedCats = new Set([...suggestedCats, ...topPlayedCats]);
    const recommendedCats = allCategoryNames.filter((c) => !usedCats.has(c));
    if (recommendedCats.length < 3) {
      allCategoryNames.forEach((c) => {
        if (recommendedCats.length < 3 && !recommendedCats.includes(c)) recommendedCats.push(c);
      });
    }
    if (recommendedCats.length > 0) {
      sections.push({
        title: "Recommended",
        icon: <Sparkles className="h-5 w-5 text-primary" />,
        categories: buildSection(recommendedCats),
      });
    }

    setCategorySections(sections);

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
      const { data } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .in("id", Array.from(profileIds));
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
      let winnerName = "Unknown",
        loserName = "Unknown",
        winnerImage = "",
        loserImage = "";

      if (isPreset) {
        const w = itemNameMap.get(m.winner_item_id || "");
        const l = itemNameMap.get(m.loser_item_id || "");
        winnerName = w?.name || "Unknown";
        loserName = l?.name || "Unknown";
        winnerImage = w?.image || "";
        loserImage = l?.image || "";
      } else {
        const w = profileNameMap.get(m.winner_profile_id || "");
        const l = profileNameMap.get(m.loser_profile_id || "");
        winnerName = w?.name || "Unknown";
        loserName = l?.name || "Unknown";
        winnerImage = w?.avatar || "";
        loserImage = l?.avatar || "";
      }

      return {
        id: m.id,
        leagueName: league?.name || "Unknown",
        leagueType: league?.type || "user",
        winnerName,
        loserName,
        winnerImage,
        loserImage,
        createdAt: m.created_at,
      };
    });
    setRecentSwipes(swipes);

    loadTopComments();
    await bannerPromise;
    setLoading(false);
  };

  const loadPreviewImages = async () => {
    const { data: items } = await supabase
      .from("preset_items")
      .select("id, league_id, image_url, leagues!inner(category)")
      .not("image_url", "is", null)
      .not("image_url", "eq", "");

    if (!items) return;

    const images: PreviewImage[] = items
      .filter((item: any) => item.image_url && item.leagues?.category)
      .map((item: any) => ({
        league_id: item.league_id,
        category: item.leagues.category,
        image_url: item.image_url,
      }));

    // Shuffle for randomness
    for (let i = images.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [images[i], images[j]] = [images[j], images[i]];
    }

    setPreviewImages(images);
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
      leagueIds.length > 0
        ? supabase.from("leagues").select("id, name").in("id", leagueIds)
        : Promise.resolve({ data: [] }),
      commentProfileIds.length > 0
        ? supabase.from("public_profiles").select("id, display_name, avatar_url").in("id", commentProfileIds)
        : Promise.resolve({ data: [] }),
    ]);

    const leagueMap2 = new Map((leaguesData || []).map((l) => [l.id, l.name]));
    const profileMap2 = new Map(
      (profiles || []).map((p) => [p.id, { name: p.display_name || "User", avatar: p.avatar_url || "" }]),
    );

    const reactionData = new Map<string, { count: number; emojis: Map<string, number> }>();
    (reactions || []).forEach((r) => {
      if (!reactionData.has(r.comment_id)) reactionData.set(r.comment_id, { count: 0, emojis: new Map() });
      const d = reactionData.get(r.comment_id)!;
      d.count++;
      d.emojis.set(r.emoji, (d.emojis.get(r.emoji) || 0) + 1);
    });

    const withReactions = commentsData.map((c) => {
      const rd = reactionData.get(c.id);
      const topEmojis = rd
        ? [...rd.emojis.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([e]) => e)
        : [];
      const prof = profileMap2.get(c.profile_id);
      return {
        id: c.id,
        content: c.content,
        league_name: c.league_id ? leagueMap2.get(c.league_id) || "" : "",
        reaction_count: rd?.count || 0,
        top_emojis: topEmojis,
        profile_id: c.profile_id,
        profile_name: prof?.name || "User",
        profile_avatar: prof?.avatar || "",
      };
    });

    withReactions.sort((a, b) => b.reaction_count - a.reaction_count);
    setTopComments(withReactions.slice(0, 5));
  };

  const loadBannerItems = async () => {
    const { data: configData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "home_banner_config")
      .single();

    const cfg = configData?.value as unknown as {
      rotation_delay?: number;
      mode?: string;
      manual_items?: { name: string; image: string; elo: number; league_name: string }[];
    } | null;
    if (cfg?.rotation_delay) setBannerDelay(cfg.rotation_delay);

    if (cfg?.mode === "manual" && cfg.manual_items && cfg.manual_items.length > 0) {
      setBannerItems(
        cfg.manual_items.map((m) => ({
          name: m.name,
          image: m.image,
          elo: m.elo,
          leagueName: m.league_name,
          type: "preset" as const,
        })),
      );
      return;
    }

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
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .in("id", pIds);
      const pMap = new Map((profiles || []).map((p) => [p.id, p]));

      topMembers.forEach((m: any) => {
        const p = pMap.get(m.profile_id);
        if (p && p.avatar_url) {
          userItems.push({
            name: p.display_name || "User",
            image: p.avatar_url,
            elo: m.elo,
            leagueName: m.leagues?.name || "",
            type: "user",
          });
        }
      });
    }

    (topPresets || []).forEach((item: any) => {
      presetItems.push({
        name: item.name,
        image: item.image_url,
        elo: item.elo,
        leagueName: item.leagues?.name || "",
        type: "preset",
      });
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

  const handleCategoryClick = (categoryName: string) => {
    navigate("/play", { state: { restoreCategory: categoryName } });
  };

  const handleSubcategoryClick = (categoryName: string, subcategoryName: string) => {
    navigate("/play", { state: { restoreCategory: categoryName, restoreSubcategory: subcategoryName } });
  };

  if (showOnboarding) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  if (loading) {
    return <div className="min-h-dvh bg-background" />;
  }

  const currentBanner = bannerItems[bannerIndex];

  return (
    <div className="min-h-dvh px-4 py-2">
      <SEOHead
        title="Mogsy — Rank anything, climb the Aura leaderboard"
        description="Swipe head-to-head matchups across hundreds of Collections, climb personal and global Aura leaderboards, and Compete with friends on Mogsy."
        path="/home"
      />
      <div className="container mx-auto max-w-3xl lg:max-w-4xl">
        {/* Mogsy Logo */}
        <nav className="w-full flex flex-col items-center pt-2 pb-2">
          <motion.img
            src={mogsyLogo}
            alt="Mogsy"
            className="h-[51px] sm:h-[77px] md:h-[102px] object-contain drop-shadow-[0_0_25px_hsl(var(--primary)/0.3)]"
            initial={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </nav>

        {/* Rotating Aura Banner */}
        {bannerItems.length > 0 && currentBanner && (
          <section className="mb-6">
            <div
              className="border border-border bg-card overflow-hidden relative h-28 sm:h-32 cursor-pointer rounded-xl"
              onClick={() => navigate("/leagues/collections")}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={bannerIndex}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.4 }}
                  className="absolute inset-0 flex items-center justify-start gap-3 sm:gap-4 px-3 sm:px-5"
                >
                  <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-full overflow-hidden border-2 border-primary/30 flex-shrink-0">
                    <img src={currentBanner.image} alt={currentBanner.name} className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Crown className="h-4 w-4 text-primary" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                        Top Rated
                      </span>
                    </div>

                    <p className="font-extrabold text-base sm:text-lg text-foreground truncate">{currentBanner.name}</p>

                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm font-bold text-primary">
                        {currentBanner.elo} <span className="uppercase tracking-wider">Aura</span>
                      </span>

                      <span className="text-xs text-muted-foreground truncate">in {currentBanner.leagueName}</span>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* Curated "Recommended for you" from custom link */}
        {curatedLeagues.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Gift className="h-5 w-5 text-primary" />
              <h2 className="text-xl sm:text-2xl font-extrabold text-foreground">Recommended for You</h2>
            </div>
            <div className="flex items-center justify-center gap-4 sm:gap-6 flex-wrap">
              {curatedLeagues.map((league) => (
                <div key={league.id} className="flex flex-col items-center gap-1.5">
                  <CategoryBubble
                    size={isMobile ? 100 : 120}
                    onClick={() => navigate(`/swipe/preset/${league.id}`)}
                    imageUrl={league.image}
                    label={league.name}
                    sublabel="Curated"
                    variant="accent"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Play Section */}
        {(playCollections.length > 0 || playCompetes.length > 0) && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl sm:text-2xl font-extrabold text-foreground">Play Now</h2>
            </div>
            <div className="flex items-center justify-center gap-4 sm:gap-6 flex-wrap">
              {playCollections.map((col) => (
                <div key={col.id} className="flex flex-col items-center gap-1.5">
                  <CategoryBubble
                    size={isMobile ? 100 : 120}
                    onClick={() => navigate(`/swipe/preset/${col.id}`)}
                    imageUrl={col.image}
                    label={col.name}
                    sublabel="Collection"
                    variant="accent"
                  />

                  <span className="text-[10px] text-muted-foreground">{col.matchesPlayed} swipes</span>
                </div>
              ))}
              {playCompetes.map((comp) => (
                <div key={comp.id} className="flex flex-col items-center gap-1.5">
                  <CategoryBubble
                    size={isMobile ? 100 : 120}
                    onClick={() => navigate(`/swipe-leagues`, { state: { leagueId: comp.id } })}
                    imageUrl={comp.image}
                    label={comp.name}
                    sublabel="Compete"
                    variant="accent"
                  />

                  <span className="text-[10px] text-muted-foreground">{comp.matchesPlayed} swipes</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Friends Section */}
        <HomeFriendsSection />

        {/* Blog strip */}
        <HomeBlogStrip />

        {/* Category Bubble Sections - Side by Side */}
        {categorySections.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Explore</h2>
              <Link to="/play" className="text-xs text-primary hover:underline">
                Browse all
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-2">
              {categorySections.map((section, sectionIdx) => {
                // On mobile: show only 1 category + 1 subcategory per column
                const displayCats = isMobile ? section.categories.slice(0, 1) : section.categories;
                const allSubs = section.categories.flatMap((cat) =>
                  cat.subcategories.map((sub) => ({ catName: cat.name, sub })),
                );
                const displaySubs = isMobile ? allSubs.slice(0, 1) : allSubs;

                return (
                  <div key={section.title} className="flex flex-col items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                      {section.icon}
                      <span className="text-[10px] sm:text-xs font-bold text-foreground whitespace-nowrap">
                        {section.title}
                      </span>
                    </div>
                    <div
                      className={`flex flex-col items-center gap-2 ${!isMobile ? "grid grid-cols-2 place-items-center" : ""}`}
                    >
                      {displayCats.map((cat, i) => (
                        <motion.div
                          key={cat.name}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: sectionIdx * 0.08 + i * 0.04 }}
                        >
                          <CategoryBubble
                            size={isMobile ? 68 : 72}
                            onClick={() => handleCategoryClick(cat.name)}
                            imageUrl={cat.image}
                            label={cat.name}
                          />
                        </motion.div>
                      ))}
                      {!isMobile &&
                        displayCats.length < 2 &&
                        section.categories.slice(1, 2).map((cat, i) => (
                          <motion.div
                            key={cat.name}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: sectionIdx * 0.08 + (i + 1) * 0.04 }}
                          >
                            <CategoryBubble
                              size={72}
                              onClick={() => handleCategoryClick(cat.name)}
                              imageUrl={cat.image}
                              label={cat.name}
                            />
                          </motion.div>
                        ))}
                      {displaySubs.map(({ catName, sub }, j) => (
                        <motion.div
                          key={`${catName}-${sub.name}`}
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: sectionIdx * 0.08 + 0.12 + j * 0.03 }}
                        >
                          <CategoryBubble
                            size={isMobile ? 52 : 56}
                            onClick={() => handleSubcategoryClick(catName, sub.name)}
                            imageUrl={sub.image}
                            label={sub.name}
                            variant="accent"
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })}
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
              <Link to="/leagues" className="text-xs text-primary hover:underline">
                View all
              </Link>
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
                      <span className="text-[10px] font-bold text-foreground text-center leading-tight px-1 line-clamp-2">
                        {league.name}
                      </span>
                      <span className="text-[8px] text-muted-foreground">{league.matchesPlayed} swipes</span>
                    </motion.div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* No leagues fallback if also no suggestions */}
        {!hasLeagues && categorySections.length === 0 && (
          <section className="mb-10">
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-muted-foreground text-sm">No leagues yet. Start swiping to join!</p>
              <Link to="/play" className="text-primary text-sm mt-2 inline-block hover:underline">
                Start Swiping →
              </Link>
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
                  <div className="text-xs text-muted-foreground flex-shrink-0 ml-2 hidden sm:flex items-center gap-2">
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
                    <button onClick={() => navigate(`/user/${c.profile_id}`)} className="flex-shrink-0">
                      <UserAvatar src={c.profile_avatar} name={c.profile_name} size="sm" />
                    </button>
                    <button
                      onClick={() => navigate(`/user/${c.profile_id}`)}
                      className="text-xs font-semibold text-foreground hover:text-primary transition-colors truncate"
                    >
                      {c.profile_name}
                    </button>
                    {c.league_name && (
                      <span className="text-[10px] text-muted-foreground ml-auto truncate">in {c.league_name}</span>
                    )}
                  </div>
                  <p className="text-xs text-foreground break-words">{c.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {c.top_emojis.length > 0 && <span className="text-[10px]">{c.top_emojis.join(" ")}</span>}
                    {c.reaction_count > 0 && (
                      <span className="text-[10px] text-primary font-medium">{c.reaction_count} reactions</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Feedback CTA */}
        <section className="mb-10">
          <button
            onClick={() => navigate("/feedback")}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <MessageSquarePlus className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-bold text-foreground">Share Your Feedback</p>
              <p className="text-xs text-muted-foreground">Report bugs, suggest features, or tell us what you think</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </button>
        </section>
      </div>
    </div>
  );
}
