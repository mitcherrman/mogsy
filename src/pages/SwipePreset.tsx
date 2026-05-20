import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { ArrowLeft, Trophy, Crown, RotateCcw, Flag, Eye, EyeOff, Camera, Sword, Swords, Globe, MessageCircle } from "lucide-react";
import { type CardStatsConfig, DEFAULT_CARD_STATS_CONFIG } from "@/hooks/useAppSettings";
import CardStatsFooter from "@/components/CardStatsFooter";
import { Button } from "@/components/ui/button";
import SwipeDirectionOverlay from "@/components/SwipeDirectionOverlay";
import SwipeComments from "@/components/SwipeComments";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Progress } from "@/components/ui/progress";
import SwipeAd from "@/components/SwipeAd";
import SwipeAdCard from "@/components/SwipeAdCard";
import type { AdCreative } from "@/components/SwipeAdCard";
import TierBadge from "@/components/TierBadge";
import EloChangeIndicator from "@/components/EloChangeIndicator";
import MatchupCapture from "@/components/MatchupCapture";
import CardAnimationRouter from "@/components/animations/CardAnimationRouter";
import SwipeAnimationPicker from "@/components/SwipeAnimationPicker";
import { getTierFromElo } from "@/lib/mock-data";
import { calculateElo } from "@/lib/elo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSwipeSound } from "@/hooks/useSwipeSound";
import { useAnimationSound } from "@/hooks/useAnimationSound";
import { useCardAnimation } from "@/hooks/useCardAnimation";
import { useScreenshot } from "@/hooks/useScreenshot";
import { useSwipeTimer } from "@/hooks/useSwipeTimer";
import SwipeTimer from "@/components/SwipeTimer";
import SwipeReadyOverlay from "@/components/SwipeReadyOverlay";
import ScrollToCommentsHint from "@/components/ScrollToCommentsHint";
import AutoVideo from "@/components/AutoVideo";
import SwipeInventoryButton from "@/components/SwipeInventoryButton";
import { useLeagueAnimationRules, getAnimationOverride } from "@/hooks/useLeagueAnimationRules";
import { toast } from "sonner";
import { useAdSystem } from "@/hooks/useAdSystem";

interface PresetItem {
  id: string;
  name: string;
  subtitle: string;
  image_url: string | null;
  elo: number;
  league_id: string;
  title_image_url?: string | null;
  title_image_scale?: number;
  title_image_offset_y?: number;
  title_image_offset_x?: number;
  title_image_max_height?: number;
  mobile_title_image_scale?: number | null;
  mobile_title_image_offset_y?: number | null;
  mobile_title_image_offset_x?: number | null;
  mobile_title_image_max_height?: number | null;
}

function getTitleImageStyle(item: PresetItem, isMobile: boolean): React.CSSProperties {
  const scale = isMobile
    ? (item.mobile_title_image_scale ?? item.title_image_scale ?? 1)
    : (item.title_image_scale ?? 1);
  const offsetY = isMobile
    ? (item.mobile_title_image_offset_y ?? item.title_image_offset_y ?? 0)
    : (item.title_image_offset_y ?? 0);
  const offsetX = isMobile
    ? (item.mobile_title_image_offset_x ?? item.title_image_offset_x ?? 0)
    : (item.title_image_offset_x ?? 0);
  const maxHeightVal = isMobile
    ? (item.mobile_title_image_max_height ?? item.title_image_max_height ?? 0)
    : (item.title_image_max_height ?? 0);
  const maxHeight = maxHeightVal > 0 ? `${maxHeightVal}px` : undefined;
  return {
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    marginTop: `${offsetY}px`,
    marginLeft: `${offsetX + 50}px`,
    maxHeight,
    maxWidth: '75%',
    position: 'relative' as const,
    zIndex: 30,
  };
}

interface ItemImage {
  id: string;
  preset_item_id: string;
  image_url: string;
  is_hidden: boolean;
  sort_order: number;
  focal_x: number;
  focal_y: number;
  zoom: number;
  pad_top: number;
  pad_left: number;
  mobile_focal_x?: number | null;
  mobile_focal_y?: number | null;
  mobile_zoom?: number | null;
  mobile_pad_top?: number | null;
  mobile_pad_left?: number | null;
}

const AD_INTERVAL_FALLBACK = 10;

function generateMatchups(items: PresetItem[]): [PresetItem, PresetItem][] {
  const pairs: [PresetItem, PresetItem][] = [];
  const rounds = 2;
  for (let r = 0; r < rounds; r++) {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      pairs.push([shuffled[i], shuffled[i + 1]]);
    }
  }
  return pairs;
}

export default function SwipePreset() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const captureRef = useRef<HTMLDivElement>(null);
  const { capture } = useScreenshot(captureRef);
  const [items, setItems] = useState<PresetItem[]>([]);
  const [localElos, setLocalElos] = useState<Map<string, number>>(new Map());
  const [matchups, setMatchups] = useState<[PresetItem, PresetItem][]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [leagueName, setLeagueName] = useState("");
  const [leagueCategory, setLeagueCategory] = useState<string | null>(null);
  const [leagueSubcategory, setLeagueSubcategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<0 | 1 | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [showInSwipeAd, setShowInSwipeAd] = useState<AdCreative | null>(null);
  const [showAdsenseInSwipe, setShowAdsenseInSwipe] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showElo, setShowElo] = useState(true);
  const [showRank, setShowRank] = useState(true);
  const [showGlobalStats, setShowGlobalStats] = useState(false);
  const [userShowElo, setUserShowElo] = useState(false);
  const [userShowRank, setUserShowRank] = useState(false);
  const [eloChanges, setEloChanges] = useState<Map<string, number>>(new Map());
  const [globalDirections, setGlobalDirections] = useState<Map<string, "up" | "down" | "none">>(new Map());
  const [countsTowardGlobal, setCountsTowardGlobal] = useState<boolean | null>(null);
  const [rankChanges, setRankChanges] = useState<Map<string, { old: number; new: number }>>(new Map());
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [myRewinds, setMyRewinds] = useState(0);
  const [myShields, setMyShields] = useState(0);
  const [myReveals, setMyReveals] = useState(0);
  const { playSwipeSound } = useSwipeSound();
  const { playAnimationSound, preloadSounds } = useAnimationSound();
  const { swipeAnimation, setSwipeAnimation, logUsage } = useCardAnimation();
  const [sliceWinner, setSliceWinner] = useState<0 | 1 | null>(null);
  const { rules: animRules } = useLeagueAnimationRules(leagueId);
  const [effectiveAnim, setEffectiveAnim] = useState(swipeAnimation);
  const { shouldShowAd, getRandomCreative, adSource, adsenseClientId, adsenseSlot } = useAdSystem("swipe");
  const [readyDelay, setReadyDelay] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [showMatchCount, setShowMatchCount] = useState(true);
  const [showSwipeProgress, setShowSwipeProgress] = useState(true);
  const [cardBgOpacity, setCardBgOpacity] = useState(20);
  const [cardStatsConfig, setCardStatsConfig] = useState<CardStatsConfig>(DEFAULT_CARD_STATS_CONFIG);

  // Lock scroll on mobile to prevent any scrolling past game area
  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isMobile]);

  useEffect(() => {
    const t = setTimeout(() => setReadyDelay(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Fetch swipe UI settings
  useEffect(() => {
    supabase.from("app_settings").select("key, value").in("key", ["show_match_count", "show_swipe_progress", "card_bg_opacity", "card_stats_config"]).then(({ data }) => {
      if (data) {
        for (const row of data) {
          const val = row.value as any;
          if (row.key === "show_match_count") setShowMatchCount(val?.enabled ?? true);
          if (row.key === "show_swipe_progress") setShowSwipeProgress(val?.enabled ?? true);
          if (row.key === "card_bg_opacity") setCardBgOpacity(val?.opacity ?? 20);
          if (row.key === "card_stats_config") setCardStatsConfig({ ...DEFAULT_CARD_STATS_CONFIG, ...val });
        }
      }
    });
  }, []);

  useEffect(() => { preloadSounds(); }, [preloadSounds]);
  const pendingAction = useRef<(() => void) | null>(null);

  // Gauntlet mode
  const [gauntletMode, setGauntletMode] = useState(false);
  const [gauntletChampion, setGauntletChampion] = useState<PresetItem | null>(null);
  const [gauntletStreak, setGauntletStreak] = useState(0);
  const [gauntletPair, setGauntletPair] = useState<[PresetItem, PresetItem] | null>(null);

  // Multi-image state
  const [itemImages, setItemImages] = useState<Map<string, ItemImage[]>>(new Map());
  const [currentImageIndex, setCurrentImageIndex] = useState<Map<string, number>>(new Map());

  const pair = gauntletMode
    ? gauntletPair
    : (currentIndex < matchups.length ? matchups[currentIndex] : null);

  const handleTimerTimeout = useCallback(() => {
    if (!items.length || sliceWinner !== null) return;
    if (gauntletMode && gauntletChampion) {
      const challenger = items.filter(i => i.id !== gauntletChampion.id)[Math.floor(Math.random() * (items.length - 1))];
      setGauntletPair([gauntletChampion, challenger]);
    } else {
      const nextIndex = currentIndex + 1;
      if (nextIndex >= matchups.length) {
        setFinished(true);
      } else {
        setCurrentIndex(nextIndex);
      }
    }
    setMatchCount(c => c + 1);
  }, [items, sliceWinner, gauntletMode, gauntletChampion, currentIndex, matchups.length]);

  const { timerEnabled, timeLeft, duration, resetTimer } = useSwipeTimer(handleTimerTimeout, showAd || finished || !pair || sliceWinner !== null || readyDelay);


  // Apply theme immediately from navigation state (before data loads) to prevent flash
  useEffect(() => {
    const state = location.state as { subcategory?: string } | null;
    if (state?.subcategory === "League of Legends") {
      document.documentElement.classList.add("theme-lol");
    }
  }, []);

  useEffect(() => {
    if (leagueId) loadItems();
    return () => { document.documentElement.classList.remove("theme-lol"); };
  }, [leagueId]);

  const loadItems = async () => {
    const [{ data: league }, { data }] = await Promise.all([
      supabase.from("leagues").select("name, category, show_elo, show_rank, subcategory, show_global_stats").eq("id", leagueId!).single(),
      supabase.from("preset_items").select("*").eq("league_id", leagueId!),
    ]);
    if (league) {
      setLeagueName(league.name);
      setLeagueCategory((league as any).category);
      setLeagueSubcategory((league as any).subcategory ?? null);
      setShowElo((league as any).show_elo ?? true);
      setShowRank((league as any).show_rank ?? true);
      setShowGlobalStats((league as any).show_global_stats ?? false);
      // Check if this is a League of Legends subcategory league
      if ((league as any).subcategory === "League of Legends") {
        document.documentElement.classList.add("theme-lol");
      }
    }
    if (data && data.length >= 2) {
      setItems(data);
      setMatchups(generateMatchups(data));

      const itemIds = data.map(i => i.id);
      const { data: images } = await supabase
        .from("preset_item_images")
        .select("*")
        .in("preset_item_id", itemIds)
        .eq("is_hidden", false)
        .order("sort_order");

      if (images) {
        const map = new Map<string, ItemImage[]>();
        const idxMap = new Map<string, number>();
        const allImageUrls: string[] = [];
        images.forEach(img => {
          const list = map.get(img.preset_item_id) || [];
          list.push(img as ItemImage);
          map.set(img.preset_item_id, list);
          allImageUrls.push(img.image_url);
          if (!idxMap.has(img.preset_item_id)) {
            idxMap.set(img.preset_item_id, Math.floor(Math.random() * (list.length)));
          }
        });
        map.forEach((imgs, itemId) => {
          idxMap.set(itemId, Math.floor(Math.random() * imgs.length));
        });
        setItemImages(map);
        setCurrentImageIndex(idxMap);

      }
    }

    if (user) {
      const { data: profile } = await supabase
        .from("profiles").select("id, is_pro, rewinds, elo_shields, reveals").eq("user_id", user.id).single();
      if (profile) {
        // Admins/moderators always see ads (for QA/verification)
        const { data: roles } = await supabase
          .from("user_roles").select("role").eq("user_id", user.id);
        const isStaff = !!roles?.some((r: any) => r.role === "admin" || r.role === "master_admin" || r.role === "moderator");
        if (profile.is_pro && !isStaff) setIsPro(true);
        setMyProfileId(profile.id);
        setMyRewinds(profile.rewinds ?? 0);
        setMyShields(profile.elo_shields ?? 0);
        setMyReveals(profile.reveals ?? 0);

        // Fetch local rankings for this league
        const { data: localRanks } = await supabase
          .from("local_rankings")
          .select("item_id, local_elo")
          .eq("profile_id", profile.id)
          .eq("league_id", leagueId!);

        if (localRanks) {
          const map = new Map<string, number>();
          localRanks.forEach((r: any) => {
            if (r.item_id) map.set(r.item_id, r.local_elo);
          });
          setLocalElos(map);
        }
      }
    }

    setLoading(false);
  };

  // ── Media prebuffering: preload next 3 matchup pairs ──
  useEffect(() => {
    if (!matchups.length || currentIndex >= matchups.length) return;
    const upcoming = matchups.slice(currentIndex + 1, currentIndex + 4);
    upcoming.flat().forEach(item => {
      const url = getDisplayImage(item) || item.image_url;
      if (url) {
        if (url.match(/\.(mp4|webm|mov)(\?|$)/i)) {
          const vid = document.createElement("video");
          vid.preload = "metadata";
          vid.src = url;
        } else {
          const img = new Image();
          img.src = url;
        }
      }
    });
  }, [currentIndex, matchups, itemImages, currentImageIndex]);

  const getDisplayImage = (item: PresetItem): string | null => {
    const images = itemImages.get(item.id);
    let url: string | null = null;
    if (images && images.length > 0) {
      const idx = currentImageIndex.get(item.id) || 0;
      url = images[idx % images.length].image_url;
    } else {
      url = item.image_url;
    }
    return url;
  };

  const getImageStyle = (item: PresetItem): React.CSSProperties => {
    const images = itemImages.get(item.id);
    if (images && images.length > 0) {
      const idx = currentImageIndex.get(item.id) || 0;
      const img = images[idx % images.length];
      const fx = isMobile ? (img.mobile_focal_x ?? img.focal_x) : img.focal_x;
      const fy = isMobile ? (img.mobile_focal_y ?? img.focal_y) : img.focal_y;
      const z = isMobile ? (img.mobile_zoom ?? img.zoom) : img.zoom;
      const pt = isMobile ? (img.mobile_pad_top ?? img.pad_top) : img.pad_top;
      const pl = isMobile ? (img.mobile_pad_left ?? img.pad_left) : img.pad_left;
      const hasCustom = fx !== 50 || fy !== 50 || z !== 1 || pt !== 0 || pl !== 0;
      if (hasCustom) {
        return {
          position: 'absolute' as const,
          top: `${pt}%`,
          left: `${pl}%`,
          width: `${100 - pl}%`,
          height: `${100 - pt}%`,
          objectPosition: `${fx}% ${fy}%`,
          transform: `scale(${z})`,
          transformOrigin: `${fx}% ${fy}%`,
        };
      }
    }
    return {};
  };

  const getCurrentImageId = (item: PresetItem): string | null => {
    const images = itemImages.get(item.id);
    if (images && images.length > 0) {
      const idx = currentImageIndex.get(item.id) || 0;
      return images[idx % images.length].id;
    }
    return null;
  };

  const handleReportImage = async (item: PresetItem) => {
    if (!user) { toast.error("Sign in to report images"); return; }
    const imageId = getCurrentImageId(item);
    if (!imageId) return;

    const { error } = await supabase.from("image_reports").insert({
      image_id: imageId,
      user_id: user.id,
    });

    if (error) {
      if (error.code === "23505") toast.info("Already reported this image");
      else toast.error("Failed to report");
      return;
    }

    // Auto-hide logic is handled atomically by the database trigger check_and_auto_hide_image()
    // Send a basic report notification (critical auto-hide notification is handled by the trigger)
    await supabase.from("admin_notifications").insert({
      type: "image_report",
      title: `Image reported: ${item.name}`,
      message: `A user reported an image for "${item.name}" as not representative.`,
      metadata: { image_id: imageId, item_id: item.id },
    });

    const images = itemImages.get(item.id);
    if (images && images.length > 1) {
      setCurrentImageIndex(prev => {
        const next = new Map(prev);
        next.set(item.id, ((prev.get(item.id) || 0) + 1) % images.length);
        return next;
      });
    }

    toast.success("Reported — showing a different image");
  };

  const getGauntletChallenger = useCallback((champion: PresetItem): PresetItem => {
    const others = items.filter(i => i.id !== champion.id);
    return others[Math.floor(Math.random() * others.length)];
  }, [items]);

  const progress = matchups.length > 0 ? (currentIndex / matchups.length) * 100 : 0;

  const rankMap = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.elo - a.elo);
    const map = new Map<string, number>();
    sorted.forEach((item, idx) => map.set(item.id, idx + 1));
    return map;
  }, [items]);

  const localRankMap = useMemo(() => {
    const entries = items.map(item => ({
      id: item.id,
      elo: localElos.get(item.id) ?? 1200,
    }));
    entries.sort((a, b) => b.elo - a.elo);
    const map = new Map<string, number>();
    entries.forEach((e, idx) => map.set(e.id, idx + 1));
    return map;
  }, [items, localElos]);

  const executeChoice = useCallback(
    async (winnerIndex: 0 | 1) => {
      if (!pair) return;
      const winner = pair[winnerIndex];
      const loser = pair[winnerIndex === 0 ? 1 : 0];

      if (myProfileId) {
        // Use dual Elo RPC
        const { data: rpcResult, error: rpcError } = await supabase.rpc("record_dual_preset_match", {
          _league_id: leagueId!,
          _winner_item_id: winner.id,
          _loser_item_id: loser.id,
          _caller_profile_id: myProfileId,
        });

        if (rpcError) {
          console.error("Dual preset match RPC error:", rpcError);
        } else {
          const result = rpcResult as any;
          setEloChanges(new Map([
            [winner.id, result.localWinnerChange],
            [loser.id, result.localLoserChange],
          ]));
          setGlobalDirections(new Map([
            [winner.id, result.globalDirectionWinner as "up" | "down" | "none"],
            [loser.id, result.globalDirectionLoser as "up" | "down" | "none"],
          ]));
          if (countsTowardGlobal === null) {
            setCountsTowardGlobal(result.countsTowardGlobal);
          }
          // Update local elos
          setLocalElos(prev => {
            const next = new Map(prev);
            next.set(winner.id, result.localWinnerElo);
            next.set(loser.id, result.localLoserElo);
            return next;
          });
        }
      } else {
        // Fallback: use old RPC for unauthenticated
        const currentWinner = items.find(i => i.id === winner.id)!;
        const currentLoser = items.find(i => i.id === loser.id)!;
        const { newWinnerElo, newLoserElo } = calculateElo(currentWinner.elo, currentLoser.elo);
        setEloChanges(new Map([
          [winner.id, newWinnerElo - currentWinner.elo],
          [loser.id, newLoserElo - currentLoser.elo],
        ]));

        await supabase.rpc("record_preset_match", {
          _league_id: leagueId!,
          _winner_item_id: winner.id,
          _loser_item_id: loser.id,
        });
      }

      // Update local items state with local elo for display
      const currentWinner = items.find(i => i.id === winner.id)!;
      const currentLoser = items.find(i => i.id === loser.id)!;
      const { newWinnerElo, newLoserElo } = calculateElo(currentWinner.elo, currentLoser.elo);

      const oldRanks = new Map<string, number>();
      [...items].sort((a, b) => b.elo - a.elo).forEach((item, idx) => oldRanks.set(item.id, idx + 1));

      const updatedItems = items.map(i => {
        if (i.id === winner.id) return { ...i, elo: newWinnerElo };
        if (i.id === loser.id) return { ...i, elo: newLoserElo };
        return i;
      });
      const newRanks = new Map<string, number>();
      [...updatedItems].sort((a, b) => b.elo - a.elo).forEach((item, idx) => newRanks.set(item.id, idx + 1));

      setRankChanges(new Map([
        [winner.id, { old: oldRanks.get(winner.id)!, new: newRanks.get(winner.id)! }],
        [loser.id, { old: oldRanks.get(loser.id)!, new: newRanks.get(loser.id)! }],
      ]));

      setItems(updatedItems);

      const newCount = matchCount + 1;

      setMatchCount(newCount);
      setChosen(null);
      setEloChanges(new Map());
      setGlobalDirections(new Map());
      setRankChanges(new Map());
      setCurrentImageIndex(prev => {
        const next = new Map(prev);
        pair.forEach(p => {
          const imgs = itemImages.get(p.id);
          if (imgs && imgs.length > 1) {
            next.set(p.id, ((prev.get(p.id) || 0) + 1) % imgs.length);
          }
        });
        return next;
      });

      if (gauntletMode) {
        const updatedWinner = updatedItems.find(i => i.id === winner.id)!;
        setGauntletChampion(updatedWinner);
        setGauntletStreak(prev => {
          if (gauntletChampion && winner.id === gauntletChampion.id) return prev + 1;
          return 1;
        });
        const challenger = getGauntletChallenger(updatedWinner);
        const winnerWasLeft = pair[0].id === winner.id;
        setGauntletPair(winnerWasLeft ? [updatedWinner, challenger] : [challenger, updatedWinner]);
        const adType = shouldShowAd(newCount, isPro);
        if (adType === "in_swipe") {
          if (adSource === "adsense" || adSource === "hybrid") {
            setShowAdsenseInSwipe(true);
          } else {
            const creative = getRandomCreative();
            if (creative) setShowInSwipeAd(creative); else setShowAd(true);
          }
        } else if (adType === "popup") {
          setShowAd(true);
        }
      } else {
        const nextIndex = currentIndex + 1;
        if (nextIndex >= matchups.length) {
          setFinished(true);
        } else {
          const adType = shouldShowAd(newCount, isPro);
          if (adType === "in_swipe") {
            if (adSource === "adsense" || adSource === "hybrid") {
              setShowAdsenseInSwipe(true);
            } else {
              const creative = getRandomCreative();
              if (creative) setShowInSwipeAd(creative); else setShowAd(true);
            }
          } else if (adType === "popup") {
            setShowAd(true);
          } else {
            setCurrentIndex(nextIndex);
          }
        }
      }

      // Clear slice overlay AFTER new pair state is committed
      setSliceWinner(null);
      resetTimer();
    },
    [pair, items, leagueId, matchCount, isPro, currentIndex, matchups.length, itemImages, gauntletMode, gauntletChampion]
  );

  const trackImageClicks = useCallback((currentPair: PresetItem[]) => {
    // Track that both images in this matchup were viewed/clicked
    currentPair.forEach(item => {
      const imageId = getCurrentImageId(item);
      if (imageId) {
        supabase.from("image_clicks").insert({
          image_id: imageId,
          preset_item_id: item.id,
          profile_id: myProfileId || undefined,
        }).then(() => {});
      }
    });
  }, [myProfileId, getCurrentImageId]);

  const handleChoose = useCallback(
    (winnerIndex: 0 | 1) => {
      if (!pair || chosen !== null || sliceWinner !== null || readyDelay) return;
      setChosen(winnerIndex);
      // Track image clicks for both items in the pair
      trackImageClicks(pair);
      // Check for animation override from league rules
      const override = getAnimationOverride(matchCount + 1, animRules);
      const animToUse = override || swipeAnimation;
      if (animToUse === "default") playSwipeSound();
      playAnimationSound(animToUse);
      logUsage(animToUse, "swipe");
      setEffectiveAnim(animToUse);
      setSliceWinner(winnerIndex);
      pendingAction.current = () => executeChoice(winnerIndex);
    },
    [pair, chosen, sliceWinner, readyDelay, swipeAnimation, playSwipeSound, playAnimationSound, logUsage, executeChoice, matchCount, animRules, trackImageClicks]
  );

  const handleSliceComplete = useCallback(() => {
    setChosen(null);
    pendingAction.current?.();
    pendingAction.current = null;
    // NOTE: sliceWinner is cleared at the end of executeChoice, not here,
    // so the overlay stays mounted until the new pair is committed.
  }, []);

  const handleToggleGauntlet = () => {
    const next = !gauntletMode;
    setGauntletMode(next);
    setGauntletChampion(null);
    setGauntletStreak(0);
    if (next && items.length >= 2) {
      // Start gauntlet with current matchup pair or random pair
      const currentPair = currentIndex < matchups.length ? matchups[currentIndex] : null;
      if (currentPair) {
        setGauntletPair(currentPair);
      } else {
        const shuffled = [...items].sort(() => Math.random() - 0.5);
        setGauntletPair([shuffled[0], shuffled[1]]);
      }
    } else {
      setGauntletPair(null);
    }
  };

  const handleRestart = () => {
    setMatchups(generateMatchups(items));
    setCurrentIndex(0);
    setMatchCount(0);
    setFinished(false);
    setGauntletChampion(null);
    setGauntletStreak(0);
  };

  const handleBack = () => {
    navigate("/play", { state: { restoreCategory: leagueCategory, restoreSubcategory: leagueSubcategory } });
  };

  const sortedResults = useMemo(
    () => [...items].sort((a, b) => b.elo - a.elo),
    [items]
  );

  if (loading) {
    return <div className="min-h-dvh" />;
  }

  if (!matchups.length || items.length < 2) {
    return (
      <div className="min-h-dvh px-4 py-8 flex items-center justify-center">
        <p className="text-muted-foreground">Not enough items to compare yet.</p>
      </div>
    );
  }

  const isAnimating = sliceWinner !== null;
  const eloVisible = showElo && (userShowElo || isAnimating);
  const rankVisible = showRank && (userShowRank || isAnimating);
  const statsHidden = !userShowElo && !userShowRank && !isAnimating;

  if (finished) {
    return (
      <div className="min-h-dvh px-4 py-8">
        <div className="container mx-auto max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={handleBack} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-extrabold text-foreground flex-1">{leagueName} Results</h1>
          </div>

          <p className="text-muted-foreground text-sm mb-4">
            You voted <span className="text-primary font-bold">{matchCount}</span> times. Here's how things stand:
          </p>

          <div className="space-y-2">
            {sortedResults.map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 rounded-xl border border-border bg-card p-3 ${idx === 0 ? "ring-2 ring-primary" : ""}`}
              >
                <span className="w-8 text-center font-bold text-muted-foreground">
                  {idx === 0 ? <Crown className="h-5 w-5 text-primary mx-auto" /> : `#${idx + 1}`}
                </span>
                <div className="h-10 w-10 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                      {item.name.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-foreground truncate block">{item.name}</span>
                  {item.subtitle && <span className="text-[10px] text-muted-foreground truncate block">{item.subtitle}</span>}
                </div>
                {eloVisible && <span className="text-sm text-primary font-bold">{item.elo}</span>}
                <TierBadge tier={getTierFromElo(item.elo)} />
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <Button onClick={handleRestart} variant="outline" className="flex-1 gap-2">
              <RotateCcw className="h-4 w-4" /> Play Again
            </Button>
            <Link to={`/leaderboard/${leagueId}`} className="flex-1">
              <Button className="w-full gap-2">
                <Trophy className="h-4 w-4" /> Full Leaderboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {showAd && (
        <SwipeAd
          isPro={isPro}
          adsenseSlot={adSource !== "custom" ? adsenseSlot : undefined}
          adsenseClientId={adSource !== "custom" ? adsenseClientId : undefined}
          onClose={() => {
            setShowAd(false);
            if (!gauntletMode) {
              setCurrentIndex(currentIndex + 1);
            }
          }}
        />
      )}
      <div className={`${isMobile ? 'h-[calc(100dvh-7.5rem)] overflow-hidden' : 'min-h-[calc(100dvh-4rem)]'} ${isMobile ? 'px-3 py-0' : 'px-3 py-2 md:px-6 md:py-4'} flex flex-col relative`}>
        <AnimatePresence>{readyDelay && <SwipeReadyOverlay />}</AnimatePresence>

        {/* Floating back button on mobile */}
        {isMobile && (
          <Button variant="outline" size="icon" onClick={handleBack} className="absolute top-1 left-2 z-30 h-7 w-7 text-muted-foreground hover:text-foreground bg-card/80 backdrop-blur-sm">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        )}

        <div className="container mx-auto max-w-lg md:max-w-3xl lg:max-w-6xl xl:max-w-7xl flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Controls bar — desktop keeps full bar, mobile collapses */}
          {!isMobile && (
            <div className="flex items-center gap-2 mb-1.5">
              <Button variant="outline" size="icon" onClick={handleBack} className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                variant={gauntletMode ? "default" : "outline"}
                size="icon"
                onClick={handleToggleGauntlet}
                className={`h-8 w-8 shrink-0 ${gauntletMode ? "text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}
                title={gauntletMode ? "Gauntlet Mode ON" : "Gauntlet Mode OFF"}
              >
                <Sword className="h-4 w-4" fill="currentColor" />
              </Button>
              <div className="flex-1 flex items-center justify-center">
                <h1 className="text-sm font-bold text-foreground">Who Mogs?</h1>
              </div>
              {showMatchCount && (
                <p className="text-muted-foreground text-xs flex items-center gap-1 shrink-0">
                  <Swords className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-primary font-bold">{matchCount}</span>
                </p>
              )}
              {timerEnabled && <SwipeTimer timeLeft={timeLeft} duration={duration} />}
              {user && (
                <SwipeInventoryButton rewinds={myRewinds} shields={myShields} reveals={myReveals} />
              )}
              <div className="flex items-center gap-1 shrink-0">
                {user && (
                  <SwipeAnimationPicker
                    currentAnimation={swipeAnimation}
                    onSelect={(id) => setSwipeAnimation(id)}
                    isPro={isPro}
                  />
                )}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={capture}
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  title="Save snapshot"
                >
                  <Camera className="h-4 w-4" />
                </Button>
                <Link to={`/leaderboard/${leagueId}`}>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <Trophy className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Mobile: minimal top area with timer only */}
          {isMobile && timerEnabled && (
            <div className="flex items-center justify-end mb-1">
              <SwipeTimer timeLeft={timeLeft} duration={duration} />
            </div>
          )}

          {gauntletMode ? (
            <div className={`flex items-center justify-center gap-2 ${isMobile ? 'mb-1' : 'mb-2'}`}>
              <Sword className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-primary">Gauntlet</span>
              {gauntletStreak > 0 && (
                <span className="text-[10px] font-bold text-muted-foreground">
                  🔥 {gauntletStreak} win streak
                </span>
              )}
            </div>
          ) : (
            showSwipeProgress && <Progress value={progress} className={`${isMobile ? 'mb-1' : 'mb-2'} h-1`} />
          )}

          {/* Matchup area */}
          {pair && (showInSwipeAd || showAdsenseInSwipe) ? (
            <MatchupCapture ref={captureRef} leagueName={leagueName} isMobile={isMobile} className="min-h-0 flex-1">
              <motion.div
                key={`ad-${showInSwipeAd?.id ?? 'adsense'}-${matchCount}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="flex flex-1 min-h-0 w-full"
              >
                {/* Full-width ad takeover */}
                <SwipeAdCard
                  creative={showInSwipeAd}
                  adsenseSlot={showAdsenseInSwipe ? (adsenseSlot || "auto") : (adSource !== "custom" && !showInSwipeAd?.image_url ? adsenseSlot : undefined)}
                  adsenseClientId={showAdsenseInSwipe ? (adsenseClientId || "ca-pub-9823769047605421") : (adSource !== "custom" ? adsenseClientId : undefined)}
                  onSkip={() => {
                    setShowInSwipeAd(null);
                    setShowAdsenseInSwipe(false);
                    if (!gauntletMode) {
                      setCurrentIndex(currentIndex + 1);
                    } else if (gauntletChampion) {
                      setGauntletPair([gauntletChampion, getGauntletChallenger(gauntletChampion)]);
                    }
                  }}
                />
              </motion.div>
            </MatchupCapture>
          ) : pair && (
            <MatchupCapture ref={captureRef} leagueName={leagueName} isMobile={isMobile} className="min-h-0 flex-1">
              {gauntletMode ? (
                /* Gauntlet: render champion stable, only challenger animates */
                <div className={`flex flex-col portrait:flex-col landscape:flex-row md:flex-row ${isMobile ? 'gap-0.5' : 'gap-1'} landscape:gap-4 md:gap-5 lg:gap-8 flex-1`}>
                  {pair.map((item, idx) => {
                    const isChampion = gauntletChampion && item.id === gauntletChampion.id;
                    return (
                      <GauntletCard
                        key={`slot-${idx}`}
                        item={item}
                        idx={idx}
                        isChampion={!!isChampion}
                        matchCount={matchCount}
                        chosen={chosen}
                        rankMap={rankMap}
                        localRankMap={localRankMap}
                        localElos={localElos}
                        itemImages={itemImages}
                        currentImageIndex={currentImageIndex}
                        eloVisible={eloVisible}
                        rankVisible={rankVisible}
                        statsHidden={statsHidden}
                        showGlobalStats={showGlobalStats}
                        items={items}
                        eloChanges={eloChanges}
                        globalDirections={globalDirections}
                        rankChanges={rankChanges}
                        getDisplayImage={getDisplayImage}
                        getImageStyle={getImageStyle}
                        handleChoose={handleChoose}
                        handleReportImage={handleReportImage}
                        isMobile={isMobile}
                        cardBgOpacity={cardBgOpacity}
                        cardStatsConfig={cardStatsConfig}
                      />
                    );
                  })}
                </div>
              ) : (
                <motion.div
                  key={`pair-${pair[0].id}-${pair[1].id}-${currentIndex}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className={`flex flex-col portrait:flex-col landscape:flex-row md:flex-row ${isMobile ? 'gap-0.5' : 'gap-1'} landscape:gap-4 md:gap-5 lg:gap-8 flex-1`}
                >
                  {pair.map((item, idx) => {
                    const displayImage = getDisplayImage(item);
                    const rank = rankMap.get(item.id);
                    const hasMultipleImages = (itemImages.get(item.id)?.length || 0) > 0;
                    const isWinner = chosen === idx;
                    const isLoser = chosen !== null && chosen !== idx;

                    return (
                      <React.Fragment key={item.id}>
                        {/* VS / Who Mogs? badge between cards (after first card) */}
                        {idx === 1 && (
                          <div className="flex items-center justify-center py-0 landscape:py-0 md:py-0 shrink-0">
                            {isMobile ? (
                              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Who Mogs?</span>
                            ) : (
                              <span className="text-xs md:text-base lg:text-lg font-black text-muted-foreground/60 select-none">VS</span>
                            )}
                          </div>
                        )}
          <div className={`flex flex-col flex-1 min-h-0 rounded-2xl border border-border bg-card ${item.title_image_url ? 'overflow-visible' : 'overflow-hidden'}`} style={{ willChange: "transform" }}>
                          <CardDraggable
                            idx={idx as 0 | 1}
                            chosen={chosen}
                            item={item}
                            displayImage={displayImage}
                            isWinner={isWinner}
                            isLoser={isLoser}
                            handleChoose={handleChoose}
                            getImageStyle={getImageStyle}
                            cardBgOpacity={cardBgOpacity}
                          />

                          {/* Unified stats footer */}
                          <CardStatsFooter
                            config={cardStatsConfig}
                            isMobile={isMobile}
                            itemName={item.name}
                            subtitle={item.subtitle}
                            titleImageUrl={item.title_image_url}
                            titleImageStyle={getTitleImageStyle(item, isMobile)}
                            localElo={localElos.get(item.id) ?? 1200}
                            localRank={localRankMap.get(item.id)}
                            globalElo={showGlobalStats ? (items.find(i => i.id === item.id)?.elo || item.elo) : undefined}
                            globalRank={showGlobalStats ? rank : undefined}
                            eloChange={eloChanges.get(item.id) ?? null}
                            rankOld={rankChanges.get(item.id)?.old ?? null}
                            rankNew={rankChanges.get(item.id)?.new ?? null}
                            globalDirection={globalDirections.get(item.id)}
                            statsHidden={statsHidden}
                            hasMultipleImages={hasMultipleImages}
                            onChoose={() => handleChoose(idx as 0 | 1)}
                            onReport={() => handleReportImage(item)}
                          />
                        </div>
                      </React.Fragment>
                    );
                  })}
                </motion.div>
              )}

              {/* VS badge removed from overlay - now inline between cards */}

              {/* Card animation */}
              <CardAnimationRouter
                animationId={effectiveAnim}
                winnerSide={sliceWinner}
                items={pair ? pair.map(item => ({
                  imageUrl: getDisplayImage(item),
                  imageStyle: getImageStyle(item),
                  name: item.name,
                  subtitle: item.subtitle,
                  titleImageUrl: item.title_image_url || undefined,
                  titleImageScale: item.title_image_scale,
                  titleImageOffsetY: item.title_image_offset_y,
                  titleImageMaxHeight: item.title_image_max_height,
                  localElo: localElos.get(item.id) ?? 1200,
                  localRank: localRankMap.get(item.id),
                  globalElo: items.find(i => i.id === item.id)?.elo ?? item.elo,
                  globalRank: rankMap.get(item.id),
                  eloVisible: true,
                  rankVisible: true,
                  eloChange: eloChanges.get(item.id) ?? null,
                  rankOld: rankChanges.get(item.id)?.old ?? null,
                  rankNew: rankChanges.get(item.id)?.new ?? null,
                  globalDirection: globalDirections.get(item.id),
                  showGlobalStats,
                })) : []}
                onComplete={handleSliceComplete}
              />
            </MatchupCapture>
          )}

          {/* Mobile action bar below cards */}
          {isMobile && (
            <div className="flex items-center justify-center gap-3 mt-1 relative z-40 flex-shrink-0">
              <Button
                variant={gauntletMode ? "default" : "outline"}
                size="icon"
                onClick={handleToggleGauntlet}
                className={`h-7 w-7 shrink-0 ${gauntletMode ? "text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}
                title={gauntletMode ? "Gauntlet Mode ON" : "Gauntlet Mode OFF"}
              >
                <Sword className="h-3.5 w-3.5" fill="currentColor" />
              </Button>
              {user && (
                <SwipeInventoryButton rewinds={myRewinds} shields={myShields} reveals={myReveals} />
              )}
              {user && (
                <SwipeAnimationPicker
                  currentAnimation={swipeAnimation}
                  onSelect={(id) => setSwipeAnimation(id)}
                  isPro={isPro}
                />
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={capture}
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                title="Save snapshot"
              >
                <Camera className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const next = !(userShowElo && userShowRank);
                  setUserShowElo(next);
                  setUserShowRank(next);
                }}
                className="h-7 w-7 text-muted-foreground shrink-0"
                title={userShowElo && userShowRank ? "Hide Stats" : "Show Stats"}
              >
                {userShowElo && userShowRank ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
              <Link to={`/leaderboard/${leagueId}`}>
                <Button variant="outline" size="icon" className="h-7 w-7">
                  <Trophy className="h-3 w-3" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCommentsOpen(true)}
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                title="Comments"
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {!isMobile && (
            <p className="text-center text-[10px] text-muted-foreground mt-0.5">
              {gauntletMode
                ? `Tap to choose · Winner stays · ${matchCount} votes`
                : `Tap or swipe to choose · ${currentIndex + 1}/${matchups.length}`}
            </p>
          )}

          {!isMobile && <ScrollToCommentsHint />}

          {/* Comments: drawer on mobile, inline on desktop */}
          {isMobile && leagueId && (
            <Drawer open={commentsOpen} onOpenChange={setCommentsOpen}>
              <DrawerContent className="max-h-[75dvh]">
                <DrawerHeader>
                  <DrawerTitle>Comments</DrawerTitle>
                </DrawerHeader>
                <div className="overflow-y-auto px-4 pb-4">
                  <SwipeComments leagueId={leagueId} />
                </div>
              </DrawerContent>
            </Drawer>
          )}
          {!isMobile && leagueId && <SwipeComments leagueId={leagueId} />}
        </div>
      </div>
    </>
  );
}

/* ─── CardDraggable: GPU-accelerated drag with velocity prediction + direction overlay ─── */
function CardDraggable({
  idx, chosen, item, displayImage, isWinner, isLoser, handleChoose, getImageStyle, cardBgOpacity,
}: {
  idx: 0 | 1;
  chosen: 0 | 1 | null;
  item: PresetItem;
  displayImage: string | null;
  isWinner: boolean;
  isLoser: boolean;
  handleChoose: (idx: 0 | 1) => void;
  getImageStyle: (item: PresetItem) => React.CSSProperties;
  cardBgOpacity: number;
}) {
  const dragX = useMotionValue(0);
  const [dragOffset, setDragOffset] = useState(0);
  const rotation = useTransform(dragX, [-200, 0, 200], [-8, 0, 8]);

  return (
    <motion.button
      onClick={() => handleChoose(idx)}
      drag={chosen === null ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.3}
      style={{ x: dragX, rotate: rotation, willChange: "transform" }}
      onDrag={() => setDragOffset(dragX.get())}
      onDragEnd={(_e, info) => {
        setDragOffset(0);
        // Velocity-based prediction: trigger at lower offset if fast swipe
        if (Math.abs(info.velocity.x) > 500 || Math.abs(info.offset.x) > 60) {
          handleChoose(idx);
        }
      }}
      whileTap={{ scale: 0.99 }}
      className={`relative ${item.title_image_url ? 'overflow-visible' : 'overflow-hidden'} cursor-pointer transition-shadow duration-300 ${
        isWinner
          ? "ring-2 ring-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
          : isLoser
          ? "opacity-50"
          : ""
      }`}
    >
      {/* Image container */}
      <div className="w-full min-h-[100px] portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] bg-muted/30 overflow-hidden relative">
        {displayImage && (
          <AutoVideo src={displayImage} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl" style={{ opacity: cardBgOpacity / 100 }} />
        )}
        {displayImage ? (
          <AutoVideo
            src={displayImage}
            alt={item.name}
            className="w-full h-full object-contain relative z-10"
            style={getImageStyle(item)}
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=200`;
            }}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-4xl font-black text-muted-foreground/30">
            {item.name.charAt(0)}
          </span>
        )}
      </div>

      {/* Swipe direction overlay */}
      <SwipeDirectionOverlay dragX={dragOffset} />

      {/* Winner crown */}
      {isWinner && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg"
        >
          <Crown className="h-4 w-4" />
        </motion.div>
      )}
    </motion.button>
  );
}


function GauntletCard({
  item, idx, isChampion, matchCount, chosen, rankMap, localRankMap, localElos, itemImages, currentImageIndex,
  eloVisible, rankVisible, statsHidden, showGlobalStats, items, eloChanges, globalDirections, rankChanges, getDisplayImage, getImageStyle, handleChoose, handleReportImage, isMobile, cardBgOpacity, cardStatsConfig,
}: {
  item: PresetItem; idx: number; isChampion: boolean; matchCount: number;
  chosen: 0 | 1 | null; rankMap: Map<string, number>; localRankMap: Map<string, number>; localElos: Map<string, number>;
  itemImages: Map<string, ItemImage[]>; currentImageIndex: Map<string, number>;
  eloVisible: boolean; rankVisible: boolean; statsHidden: boolean; showGlobalStats: boolean; items: PresetItem[];
  eloChanges: Map<string, number>; globalDirections: Map<string, "up" | "down" | "none">; rankChanges: Map<string, { old: number; new: number }>;
  getDisplayImage: (item: PresetItem) => string | null;
  getImageStyle: (item: PresetItem) => React.CSSProperties;
  handleChoose: (idx: 0 | 1) => void;
  handleReportImage: (item: PresetItem) => void;
  isMobile: boolean;
  cardBgOpacity: number;
  cardStatsConfig: CardStatsConfig;
}) {
  const displayImage = getDisplayImage(item);
  const rank = rankMap.get(item.id);
  const hasMultipleImages = (itemImages.get(item.id)?.length || 0) > 0;
  const isWinner = chosen === idx;
  const isLoser = chosen !== null && chosen !== idx;

  const cardContent = (
    <div className={`flex flex-col flex-1 min-h-0 rounded-2xl border border-border bg-card ${item.title_image_url ? 'overflow-visible' : 'overflow-hidden'}`} style={{ willChange: "transform" }}>
      <CardDraggable
        idx={idx as 0 | 1}
        chosen={chosen}
        item={item}
        displayImage={displayImage}
        isWinner={isWinner}
        isLoser={isLoser}
        handleChoose={handleChoose}
        getImageStyle={getImageStyle}
        cardBgOpacity={cardBgOpacity}
      />
      <CardStatsFooter
        config={cardStatsConfig}
        isMobile={isMobile}
        itemName={item.name}
        subtitle={item.subtitle}
        titleImageUrl={item.title_image_url}
        titleImageStyle={getTitleImageStyle(item, isMobile)}
        localElo={localElos.get(item.id) ?? 1200}
        localRank={localRankMap.get(item.id)}
        globalElo={showGlobalStats ? (items.find(i => i.id === item.id)?.elo || item.elo) : undefined}
        globalRank={showGlobalStats ? rank : undefined}
        eloChange={eloChanges.get(item.id) ?? null}
        rankOld={rankChanges.get(item.id)?.old ?? null}
        rankNew={rankChanges.get(item.id)?.new ?? null}
        globalDirection={globalDirections.get(item.id)}
        statsHidden={statsHidden}
        hasMultipleImages={hasMultipleImages}
        onChoose={() => handleChoose(idx as 0 | 1)}
        onReport={() => handleReportImage(item)}
      />
    </div>
  );

  if (isChampion) {
    // Champion stays stable — no AnimatePresence exit/enter
    return <div className="flex flex-col flex-1 min-h-0">{cardContent}</div>;
  }

  // Challenger fades in
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`challenger-${item.id}-${matchCount}`}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col flex-1 min-h-0"
      >
        {cardContent}
      </motion.div>
    </AnimatePresence>
  );
}
