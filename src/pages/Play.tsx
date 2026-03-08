import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shuffle, Zap, Users, LayoutGrid, Sparkles, Globe, Circle, RectangleHorizontal, List, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import { useSwipeSound } from "@/hooks/useSwipeSound";
import { useCardAnimation } from "@/hooks/useCardAnimation";
import { CARD_ANIMATIONS } from "@/lib/card-animations";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";

type ModeKey = "collections" | "compete" | null;
type SubKey = "swipe" | "elocheck" | null;
type DesktopLayout = "bubbles" | "pills" | "grid" | "list" | "tiles";

interface LeagueItem {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  type: string;
}

interface PreviewImage {
  league_id: string;
  category: string;
  image_url: string;
}

const ease = { duration: 0.25, ease: [0.4, 0, 0.2, 1] as const };
const fadeIn = { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.85 }, transition: ease };

const LAYOUT_OPTIONS: { id: DesktopLayout; icon: React.ReactNode; label: string }[] = [
  { id: "bubbles", icon: <Circle className="h-3.5 w-3.5" />, label: "Bubbles" },
  { id: "pills", icon: <RectangleHorizontal className="h-3.5 w-3.5" />, label: "Pills" },
  { id: "grid", icon: <LayoutGrid className="h-3.5 w-3.5" />, label: "Grid" },
  { id: "list", icon: <List className="h-3.5 w-3.5" />, label: "List" },
  { id: "tiles", icon: <Square className="h-3.5 w-3.5" />, label: "Tiles" },
];

export default function Play() {
  const navigate = useNavigate();
  const location = useLocation();
  const { playSwipeSound } = useSwipeSound();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { swipeAnimation, setSwipeAnimation, loading: animLoading } = useCardAnimation();
  const [isPro, setIsPro] = useState(false);
  const [animConfig, setAnimConfig] = useState<Record<string, { enabled: boolean; pro_only: boolean }>>({});

  const [desktopLayout, setDesktopLayout] = useState<DesktopLayout>(() => {
    const stored = localStorage.getItem("play-desktop-layout");
    return (stored as DesktopLayout) || "pills";
  });

  useEffect(() => {
    localStorage.setItem("play-desktop-layout", desktopLayout);
  }, [desktopLayout]);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("is_pro").eq("user_id", user.id).single()
        .then(({ data }) => { if (data?.is_pro) setIsPro(true); });
    }
    supabase.from("app_settings").select("value").eq("key", "card_animations").single()
      .then(({ data }) => { if (data?.value) setAnimConfig(data.value as any); });
  }, [user]);

  // Read restore state eagerly to avoid intermediate render flash
  const restoreState = location.state as { restoreCategory?: string; restoreSubcategory?: string } | null;
  const [expanded, setExpanded] = useState<ModeKey>(restoreState?.restoreCategory ? "collections" : null);
  const [subExpanded, setSubExpanded] = useState<SubKey>(restoreState?.restoreCategory ? "swipe" : null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(restoreState?.restoreCategory || null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(restoreState?.restoreSubcategory || null);
  const [leagues, setLeagues] = useState<LeagueItem[]>([]);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);

  // Fetch leagues
  useEffect(() => {
    supabase
      .from("leagues")
      .select("id, name, category, type, subcategory")
      .then(({ data }) => { if (data) setLeagues(data as LeagueItem[]); });
  }, []);

  // Clear restore state so refresh doesn't re-restore
  useEffect(() => {
    if (restoreState?.restoreCategory) {
      window.history.replaceState({}, "");
    }
  }, []);

  // Fetch random preview images from preset items
  useEffect(() => {
    const fetchImages = async () => {
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

    fetchImages();
  }, []);

  const getCategoryImage = useCallback((category: string) => {
    const catImages = previewImages.filter((img) => img.category === category);
    if (catImages.length === 0) return null;
    return catImages[0]?.image_url || null;
  }, [previewImages]);

  const getLeagueImage = useCallback((leagueId: string) => {
    const leagueImages = previewImages.filter((img) => img.league_id === leagueId);
    if (leagueImages.length === 0) return null;
    return leagueImages[0]?.image_url || null;
  }, [previewImages]);

  const handleBubbleClick = (action: () => void) => {
    playSwipeSound();
    action();
  };

  const toggle = (key: ModeKey) => {
    if (expanded === key) { setExpanded(null); setSubExpanded(null); setSelectedCategory(null); setSelectedSubcategory(null); }
    else { setExpanded(key); setSubExpanded(null); setSelectedCategory(null); setSelectedSubcategory(null); }
  };

  const handleSubToggle = (sub: SubKey) => {
    if (sub === "elocheck") { navigate("/elo-check"); return; }
    if (subExpanded === sub) { setSubExpanded(null); setSelectedCategory(null); setSelectedSubcategory(null); }
    else { setSubExpanded(sub); setSelectedCategory(null); setSelectedSubcategory(null); }
  };

  const handleBack = () => {
    if (selectedSubcategory) setSelectedSubcategory(null);
    else if (selectedCategory) setSelectedCategory(null);
    else if (subExpanded) setSubExpanded(null);
    else if (expanded) setExpanded(null);
    else navigate("/home");
  };

  const handleLeagueSelect = (league: LeagueItem) => {
    const navState = { subcategory: league.subcategory };
    if (league.type === "preset") navigate(`/swipe/preset/${league.id}`, { state: navState });
    else navigate("/swipe");
  };

  const presetLeagues = leagues.filter((l) => l.type === "preset");
  const userLeagues = leagues.filter((l) => l.type === "user");

  const presetCategories = presetLeagues.reduce<Record<string, LeagueItem[]>>((acc, l) => {
    const cat = l.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(l);
    return acc;
  }, {});

  const currentCategories =
    expanded === "collections" ? presetCategories : { Leagues: userLeagues };

  const onCatSelect = (cat: string) => setSelectedCategory(cat);

  // Determine if we need scrolling (large list of subcategories)
  const needsScroll = (() => {
    if (selectedSubcategory) {
      const cat = selectedCategory || "";
      const leaguesInSub = (currentCategories[cat] || []).filter(l => l.subcategory === selectedSubcategory);
      return leaguesInSub.length > 8;
    }
    if (selectedCategory) {
      const leaguesInCat = currentCategories[selectedCategory] || [];
      return leaguesInCat.length > 8;
    }
    if (subExpanded && !selectedCategory) {
      const categoryKeys = Object.keys(currentCategories);
      if (categoryKeys.length <= 1) {
        const allLeagues = categoryKeys.flatMap((cat) => currentCategories[cat]);
        return allLeagues.length > 8;
      }
      return categoryKeys.length > 6;
    }
    return false;
  })();

  // While restoring state, wait for leagues to load to avoid flashing wrong view
  if (restoreState?.restoreCategory && leagues.length === 0) {
    return <div className={`px-4 py-8 h-[calc(100vh-4rem)] overflow-hidden transition-colors duration-500`}>
      <SEOHead title="Play — Mogsy" description="Pick your favorite in head-to-head matchups." />
    </div>;
  }

  /* ─── Desktop layout item renderers ─── */
  const GridCard = ({ onClick, imageUrl, label, delay = 0, variant = "card" }: { onClick: () => void; imageUrl?: string | null; label: string; delay?: number; variant?: "card" | "accent" }) => (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className={`relative flex flex-col items-center justify-center rounded-lg border-2 cursor-pointer select-none overflow-hidden transition-colors w-full h-[120px] ${
        variant === "accent"
          ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
          : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      {imageUrl && (
        <>
          <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-black/50" />
        </>
      )}
      <span className={`relative z-10 text-xs font-extrabold tracking-wide leading-tight text-center px-2 line-clamp-2 ${imageUrl ? "text-white drop-shadow-lg" : ""}`}>{label}</span>
    </motion.button>
  );

  const ListRow = ({ onClick, imageUrl, label, delay = 0, variant = "card" }: { onClick: () => void; imageUrl?: string | null; label: string; delay?: number; variant?: "card" | "accent" }) => (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...ease, delay }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`relative w-full flex items-center h-12 rounded-lg border cursor-pointer select-none overflow-hidden transition-colors ${
        variant === "accent"
          ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
          : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      {imageUrl && (
        <>
          <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-black/50" />
        </>
      )}
      <span className={`relative z-10 px-4 text-sm font-bold tracking-wide leading-tight text-left line-clamp-1 ${imageUrl ? "text-white drop-shadow-lg" : ""}`}>{label}</span>
    </motion.button>
  );

  const TileSquare = ({ onClick, imageUrl, label, delay = 0, variant = "card" }: { onClick: () => void; imageUrl?: string | null; label: string; delay?: number; variant?: "card" | "accent" }) => (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...ease, delay }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className={`relative flex items-center justify-center rounded-lg border-2 cursor-pointer select-none overflow-hidden transition-colors w-full aspect-square ${
        variant === "accent"
          ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
          : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      {imageUrl && (
        <>
          <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-black/50" />
        </>
      )}
      <span className={`relative z-10 text-xs font-extrabold tracking-wide leading-tight text-center px-2 line-clamp-2 ${imageUrl ? "text-white drop-shadow-lg" : ""}`}>{label}</span>
    </motion.button>
  );

  /* ─── Desktop rectangular pill for sub-sub items ─── */
  const RectPill = ({ onClick, imageUrl, label, delay = 0, variant = "card" }: { onClick: () => void; imageUrl?: string | null; label: string; delay?: number; variant?: "card" | "accent" }) => (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className={`relative flex items-center gap-3 px-5 py-3 rounded-xl border-2 cursor-pointer select-none overflow-hidden transition-colors w-full ${
        variant === "accent"
          ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
          : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      {imageUrl && (
        <>
          <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover rounded-xl" loading="lazy" />
          <div className="absolute inset-0 bg-black/50 rounded-xl" />
        </>
      )}
      <span className={`relative z-10 text-sm font-extrabold tracking-wide leading-tight text-center line-clamp-2 ${imageUrl ? "text-white drop-shadow-lg" : ""}`}>{label}</span>
    </motion.button>
  );

  /* ─── Render a single item based on current layout ─── */
  const renderLayoutItem = (
    key: string,
    onClick: () => void,
    label: string,
    imageUrl?: string | null,
    delay?: number,
    variant?: "card" | "accent"
  ) => {
    const props = { key, onClick, imageUrl, label, delay, variant: variant || "card" as const };
    switch (desktopLayout) {
      case "bubbles":
        return (
          <motion.div key={key} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...ease, delay: delay || 0 }}>
            <Bubble size={isMobile ? 80 : 100} onClick={onClick} active={false} variant={variant || "card"} imageUrl={imageUrl}>
              <span className="text-xs font-extrabold tracking-wide leading-tight text-center px-1 line-clamp-2">{label}</span>
            </Bubble>
          </motion.div>
        );
      case "pills":
        return <RectPill {...props} />;
      case "grid":
        return <GridCard {...props} />;
      case "list":
        return <ListRow {...props} />;
      case "tiles":
        return <TileSquare {...props} />;
    }
  };

  /* ─── Container classes per layout mode ─── */
  const getContainerClass = () => {
    if (isMobile) {
      switch (desktopLayout) {
        case "grid":
        case "tiles":
          return "grid grid-cols-2 gap-3 w-full";
        case "list":
          return "flex flex-col gap-1 w-full";
        case "bubbles":
          return "grid grid-cols-2 gap-3 justify-items-center w-full";
        case "pills":
          return "grid grid-cols-2 gap-2 w-full";
        default:
          return "grid grid-cols-2 gap-3 w-full";
      }
    }
    switch (desktopLayout) {
      case "grid":
        return "grid grid-cols-3 gap-3";
      case "list":
        return "flex flex-col gap-1 w-full";
      default:
        return "flex flex-wrap items-start justify-start gap-3";
    }
  };

  /* ─── Desktop: renders sub-options inline below top-level bubbles ─── */
  const renderDesktopSubContent = () => {
    if (!expanded) return null;

    // Mode selected but no sub — show Swipe & Aura Check
    if (!subExpanded) {
      return (
        <motion.div key="desktop-sub" {...fadeIn} className="flex items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <motion.button
              onClick={() => handleBubbleClick(() => handleSubToggle("swipe"))}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="flex items-center gap-3 px-6 py-3 rounded-xl border-2 border-primary/30 bg-primary/5 text-primary cursor-pointer select-none transition-colors hover:bg-primary/10"
            >
              <Shuffle className="h-5 w-5" />
              <span className="text-sm font-extrabold tracking-wide">Swipe</span>
            </motion.button>
            <FadeLabel delay={0.5}>Pick your favorite</FadeLabel>
          </div>
          <div className="flex flex-col items-center gap-2">
            <motion.button
              onClick={() => handleBubbleClick(() => handleSubToggle("elocheck"))}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="flex items-center gap-3 px-6 py-3 rounded-xl border-2 border-primary/30 bg-primary/5 text-primary cursor-pointer select-none transition-colors hover:bg-primary/10"
            >
              <Zap className="h-5 w-5" />
              <span className="text-sm font-extrabold tracking-wide">Aura Check</span>
            </motion.button>
            <FadeLabel delay={0.5}>Guess who ranks higher</FadeLabel>
          </div>
        </motion.div>
      );
    }

    // Swipe selected — show categories or leagues
    return renderCategoryContent();
  };

  /* ─── Shared: category/league drill-down (used by both mobile and desktop) ─── */
  const renderCategoryContent = () => {
    const categoryKeys = Object.keys(currentCategories).sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    const hasMultipleCategories = categoryKeys.length > 1;

    if (!selectedCategory && hasMultipleCategories) {
      return (
        <motion.div key="swipe-categories-inline" {...fadeIn} className="flex flex-col items-center gap-5 w-full">
          {isMobile && (
            <Bubble size={148} onClick={() => handleBubbleClick(() => handleSubToggle("swipe"))} active variant="accent">
              <Shuffle className="h-10 w-10" />
              <span className="text-sm font-extrabold tracking-wide">Swipe</span>
            </Bubble>
          )}
          <div className={getContainerClass()}>
            {categoryKeys.map((cat, i) => {
              const catImage = getCategoryImage(cat);
              return renderLayoutItem(cat, () => handleBubbleClick(() => onCatSelect(cat)), cat, catImage, i * 0.04);
            })}
          </div>
        </motion.div>
      );
    }

    if (selectedCategory && hasMultipleCategories) {
      const leaguesInCat = currentCategories[selectedCategory] || [];
      const catImage = getCategoryImage(selectedCategory);
      const subcategories = [...new Set(leaguesInCat.filter(l => l.subcategory).map(l => l.subcategory!))];
      const regularLeagues = leaguesInCat.filter(l => !l.subcategory);

      if (selectedSubcategory) {
        const subLeagues = leaguesInCat.filter(l => l.subcategory === selectedSubcategory);
        const isLol = selectedSubcategory === "League of Legends";
        return (
          <motion.div key={`subcat-${selectedSubcategory}`} {...fadeIn} className={`flex flex-col items-center gap-5 w-full ${isLol ? "theme-lol" : ""}`}>
            {isMobile ? (
              <Bubble size={148} onClick={() => handleBubbleClick(() => setSelectedSubcategory(null))} active variant="card" imageUrl={isLol ? "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg" : catImage}>
                <span className="text-sm font-extrabold tracking-wide">{selectedSubcategory}</span>
              </Bubble>
            ) : (
              <RectPill onClick={() => handleBubbleClick(() => setSelectedSubcategory(null))} imageUrl={isLol ? "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg" : catImage} label={selectedSubcategory} variant="accent" />
            )}
            <div className={getContainerClass()}>
              {subLeagues.map((league, i) => {
                const leagueImage = getLeagueImage(league.id);
                return renderLayoutItem(league.id, () => handleBubbleClick(() => handleLeagueSelect(league)), league.name, leagueImage, i * 0.04, isLol ? "accent" : "card");
              })}
            </div>
          </motion.div>
        );
      }

      const sortedLeagues = [...regularLeagues].sort((a, b) => {
        const aWords = a.name.split(' ').length;
        const bWords = b.name.split(' ').length;
        if (aWords !== bWords) return aWords - bWords;
        return a.name.localeCompare(b.name);
      });

      const allItems = [
        ...subcategories.map(sub => ({ type: 'subcategory' as const, id: sub, name: sub })),
        ...sortedLeagues.map(l => ({ type: 'league' as const, id: l.id, name: l.name, league: l })),
      ];

      return (
        <motion.div key={`cat-${selectedCategory}`} {...fadeIn} className="flex flex-col items-center gap-5 w-full">
          {isMobile ? (
            <Bubble size={148} onClick={() => handleBubbleClick(() => setSelectedCategory(null))} active variant="card" imageUrl={catImage}>
              <span className="text-sm font-extrabold tracking-wide">{selectedCategory}</span>
            </Bubble>
          ) : (
            <RectPill onClick={() => handleBubbleClick(() => setSelectedCategory(null))} imageUrl={catImage} label={selectedCategory} variant="accent" />
          )}
          <div className={getContainerClass()}>
            {allItems.map((entry, i) => {
              if (entry.type === 'subcategory') {
                const isLol = entry.name === "League of Legends";
                return renderLayoutItem(entry.id, () => handleBubbleClick(() => setSelectedSubcategory(entry.name)), `${isLol ? "⚔️" : "📁"} ${entry.name}`, isLol ? "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg" : undefined, i * 0.04);
              }
              const leagueImage = getLeagueImage(entry.id);
              return renderLayoutItem(entry.id, () => handleBubbleClick(() => handleLeagueSelect(entry.league!)), entry.name, leagueImage, i * 0.04);
            })}
          </div>
        </motion.div>
      );
    }

    // Single category — show league items directly
    const allLeagues = Object.keys(currentCategories).flatMap((cat) => currentCategories[cat]);
    return (
      <motion.div key="swipe-leagues-direct" {...fadeIn} className="flex flex-col items-center gap-5 w-full">
        {isMobile && (
          <Bubble size={148} onClick={() => handleBubbleClick(() => handleSubToggle("swipe"))} active variant="accent">
            <Shuffle className="h-10 w-10" />
            <span className="text-sm font-extrabold tracking-wide">Swipe</span>
          </Bubble>
        )}
        <div className={getContainerClass()}>
          {allLeagues.map((league, i) => {
            const leagueImage = getLeagueImage(league.id);
            return renderLayoutItem(league.id, () => handleBubbleClick(() => handleLeagueSelect(league)), league.name, leagueImage, i * 0.04);
          })}
        </div>
      </motion.div>
    );
  };

  const renderContent = () => {
    // ─── DESKTOP: inline expansion, both top-level bubbles always visible ───
    if (!isMobile) {
      return (
        <div className="flex flex-col items-center gap-8 w-full">
          <div className="flex items-start justify-center gap-10">
            {/* Collections column */}
            <div className="flex flex-col items-center gap-4">
              <div className="flex flex-col items-center gap-2">
                <Bubble size={148} onClick={() => handleBubbleClick(() => toggle("collections"))} active={expanded === "collections"} variant="card">
                  <span className="h-10 w-10 flex items-center justify-center"><LayoutGrid className="h-10 w-10" /></span>
                  <span className="text-sm font-extrabold tracking-wide">Collections</span>
                </Bubble>
                <FadeLabel delay={0.5}>Vote on curated matchups</FadeLabel>
              </div>
              <AnimatePresence mode="wait">
                {expanded === "collections" && renderDesktopSubContent()}
              </AnimatePresence>
            </div>
            {/* Compete column */}
            <div className="flex flex-col items-center gap-4">
              <div className="flex flex-col items-center gap-2">
                <Bubble size={148} onClick={() => handleBubbleClick(() => toggle("compete"))} active={expanded === "compete"} variant="card">
                  <span className="h-10 w-10 flex items-center justify-center"><Users className="h-10 w-10" /></span>
                  <span className="text-sm font-extrabold tracking-wide">Compete</span>
                </Bubble>
                <FadeLabel delay={0.5}>Go head-to-head with others</FadeLabel>
              </div>
              <AnimatePresence mode="wait">
                {expanded === "compete" && renderDesktopSubContent()}
              </AnimatePresence>
            </div>
          </div>
        </div>
      );
    }

    // ─── MOBILE: original step-by-step navigation ───
    if (!expanded) {
      return (
        <AnimatePresence mode="wait">
          <motion.div key="top-level" {...fadeIn} className="flex items-center justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <Bubble size={148} onClick={() => handleBubbleClick(() => toggle("collections"))} active={false} variant="card">
                <span className="h-10 w-10 flex items-center justify-center"><LayoutGrid className="h-10 w-10" /></span>
                <span className="text-sm font-extrabold tracking-wide">Collections</span>
              </Bubble>
              <FadeLabel delay={0.5}>Vote on curated matchups</FadeLabel>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Bubble size={148} onClick={() => handleBubbleClick(() => toggle("compete"))} active={false} variant="card">
                <span className="h-10 w-10 flex items-center justify-center"><Users className="h-10 w-10" /></span>
                <span className="text-sm font-extrabold tracking-wide">Compete</span>
              </Bubble>
              <FadeLabel delay={0.5}>Go head-to-head with others</FadeLabel>
            </div>
          </motion.div>
        </AnimatePresence>
      );
    }

    if (!subExpanded) {
      const modeLabel = expanded === "collections" ? "Collections" : "Compete";
      const modeIcon = expanded === "collections" ? <LayoutGrid className="h-10 w-10" /> : <Users className="h-10 w-10" />;
      return (
        <AnimatePresence mode="wait">
          <motion.div key="mode-selected" {...fadeIn} className="flex flex-col items-center gap-5">
            <Bubble size={148} onClick={() => handleBubbleClick(() => toggle(expanded))} active variant="card">
              <span className="h-10 w-10 flex items-center justify-center">{modeIcon}</span>
              <span className="text-sm font-extrabold tracking-wide">{modeLabel}</span>
            </Bubble>
            <div className="flex items-center justify-center gap-6">
              <div className="flex flex-col items-center gap-2">
                <Bubble size={100} onClick={() => handleBubbleClick(() => handleSubToggle("swipe"))} active={false} variant="accent">
                  <Shuffle className="h-7 w-7" />
                  <span className="text-xs font-extrabold tracking-wide">Swipe</span>
                </Bubble>
                <FadeLabel delay={0.5}>Pick your favorite</FadeLabel>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Bubble size={100} onClick={() => handleBubbleClick(() => handleSubToggle("elocheck"))} active={false} variant="accent">
                  <Zap className="h-7 w-7" />
                  <span className="text-xs font-extrabold tracking-wide">Aura Check</span>
                </Bubble>
                <FadeLabel delay={0.5}>Guess who ranks higher</FadeLabel>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      );
    }

    // Mobile: category drill-down wrapped in AnimatePresence
    return (
      <AnimatePresence mode="wait">
        {renderCategoryContent()}
      </AnimatePresence>
    );
  };

  const isLolTheme = selectedSubcategory === "League of Legends";

  return (
    <div className={`px-4 py-8 ${needsScroll ? 'min-h-screen' : 'h-[calc(100vh-4rem)] overflow-hidden'} ${isLolTheme ? 'theme-lol bg-[hsl(220,30%,8%)]' : ''} transition-colors duration-500`}>
      <SEOHead title="Play — Mogsy" description="Pick your favorite in head-to-head matchups." />
      <div className={`container mx-auto ${isMobile ? 'max-w-md' : 'max-w-3xl'}`}>
        <div className="flex items-center gap-3 mb-12">
          <Button variant="ghost" size="icon" onClick={handleBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground flex-1">Play</h1>
          {expanded && (
            <Button variant="outline" size="sm" onClick={() => navigate(expanded === "collections" ? "/leagues/collections" : "/leagues/compete")} className="gap-1.5 h-8 text-xs">
              <Globe className="h-3.5 w-3.5" /> Leaderboard
            </Button>
          )}
          
          {user && !animLoading && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs font-medium hidden sm:inline">Animation</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-1.5">Card Animation</p>
                {CARD_ANIMATIONS.filter(a => {
                  const cfg = animConfig[a.id];
                  if (cfg && !cfg.enabled) return false;
                  return a.contexts.includes("swipe");
                }).map(anim => {
                  const cfg = animConfig[anim.id];
                  const isProOnly = cfg?.pro_only;
                  const locked = isProOnly && !isPro;
                  const selected = swipeAnimation === anim.id;
                  return (
                    <button
                      key={anim.id}
                      onClick={() => !locked && setSwipeAnimation(anim.id)}
                      disabled={locked}
                      className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors text-sm ${
                        selected
                          ? "bg-primary/10 text-primary font-semibold"
                          : locked
                          ? "text-muted-foreground/50 cursor-not-allowed"
                          : "text-foreground hover:bg-secondary"
                      }`}
                    >
                      <span>{anim.icon}</span>
                      <span className="flex-1 text-xs">{anim.name}</span>
                      {isProOnly && !isPro && <span className="text-[8px] bg-muted rounded px-1 py-0.5 font-bold">PRO</span>}
                      {selected && <span className="text-primary text-xs">✓</span>}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}
        </div>
        <div className="flex justify-center mt-8">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

/* ─── Fade-in label below bubbles ─── */
function FadeLabel({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay }}
      className="text-[10px] text-muted-foreground text-center max-w-[130px] leading-tight"
    >
      {children}
    </motion.span>
  );
}

/* ─── Reusable circle bubble with optional background image ─── */
function Bubble({
  size,
  onClick,
  active,
  variant,
  imageUrl,
  children,
}: {
  size: number;
  onClick: () => void;
  active: boolean;
  variant: "card" | "accent";
  imageUrl?: string | null;
  children: React.ReactNode;
}) {
  const baseClass = "rounded-full flex flex-col items-center justify-center border-2 cursor-pointer select-none overflow-hidden relative";

  let colorClass: string;
  if (active && variant === "card") {
    colorClass = "border-primary text-primary";
  } else if (active && variant === "accent") {
    colorClass = "border-primary text-primary";
  } else if (variant === "accent") {
    colorClass = "border-primary/30 text-primary";
  } else {
    colorClass = "border-border text-foreground";
  }

  const hasImage = !!imageUrl;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.95 }}
      className={`${baseClass} ${colorClass} ${!hasImage ? (active ? "bg-primary/10" : variant === "accent" ? "bg-primary/5" : "bg-card") : ""}`}
      style={{
        width: size,
        height: size,
        gap: size >= 128 ? 8 : 4,
        boxShadow: active ? "0 0 40px hsl(var(--primary) / 0.25)" : "none",
      }}
    >
      {hasImage && (
        <>
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover rounded-full transition-opacity duration-700"
          />
          <div className="absolute inset-0 bg-black/50 rounded-full" />
        </>
      )}
      <span className={`relative z-10 flex flex-col items-center justify-center ${hasImage ? "text-white drop-shadow-lg" : ""}`}
        style={{ gap: size >= 128 ? 8 : 4 }}
      >
        {children}
      </span>
    </motion.button>
  );
}
