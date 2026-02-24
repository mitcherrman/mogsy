import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shuffle, Zap, Users, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import { useSwipeSound } from "@/hooks/useSwipeSound";

type ModeKey = "collections" | "compete" | null;
type SubKey = "swipe" | "elocheck" | null;

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

export default function Play() {
  const navigate = useNavigate();
  const location = useLocation();
  const { playSwipeSound } = useSwipeSound();

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
    else navigate(-1);
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

  const renderContent = () => {
    // No mode selected — show Collections & Compete side by side
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

    // Mode selected but no sub — show the selected mode bubble + Swipe & Elo Check
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
                  <span className="text-xs font-extrabold tracking-wide">Elo Check</span>
                </Bubble>
                <FadeLabel delay={0.5}>Guess who ranks higher</FadeLabel>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      );
    }

    // Swipe selected — show categories (or direct leagues for single-category)
    const categoryKeys = Object.keys(currentCategories).sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    const hasMultipleCategories = categoryKeys.length > 1;

    if (!selectedCategory && hasMultipleCategories) {
      return (
        <AnimatePresence mode="wait">
          <motion.div key="swipe-categories" {...fadeIn} className="flex flex-col items-center gap-5">
            <Bubble size={148} onClick={() => handleBubbleClick(() => handleSubToggle("swipe"))} active variant="accent">
              <Shuffle className="h-10 w-10" />
              <span className="text-sm font-extrabold tracking-wide">Swipe</span>
            </Bubble>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {categoryKeys.map((cat, i) => {
                const catImage = getCategoryImage(cat);
                return (
                  <motion.div
                    key={cat}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...ease, delay: i * 0.04 }}
                  >
                    <Bubble size={112} onClick={() => handleBubbleClick(() => onCatSelect(cat))} active={false} variant="card" imageUrl={catImage}>
                      <span className="text-sm font-extrabold tracking-wide leading-tight text-center px-1">{cat}</span>
                    </Bubble>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      );
    }

    if (selectedCategory && hasMultipleCategories) {
      const leaguesInCat = currentCategories[selectedCategory] || [];
      const catImage = getCategoryImage(selectedCategory);
      
      // Split into subcategories and regular leagues
      const subcategories = [...new Set(leaguesInCat.filter(l => l.subcategory).map(l => l.subcategory!))];
      const regularLeagues = leaguesInCat.filter(l => !l.subcategory);

      // If a subcategory is selected, show leagues within it
      if (selectedSubcategory) {
        const subLeagues = leaguesInCat.filter(l => l.subcategory === selectedSubcategory);
        const isLol = selectedSubcategory === "League of Legends";
        return (
          <AnimatePresence mode="wait">
            <motion.div key={`subcat-${selectedSubcategory}`} {...fadeIn} className={`flex flex-col items-center gap-5 ${isLol ? "theme-lol" : ""}`}>
              <Bubble size={148} onClick={() => handleBubbleClick(() => setSelectedSubcategory(null))} active variant="card" imageUrl={isLol ? "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg" : catImage}>
                <span className="text-sm font-extrabold tracking-wide">{selectedSubcategory}</span>
              </Bubble>
              <div className="flex flex-wrap items-center justify-center gap-4">
                {subLeagues.map((league, i) => {
                  const leagueImage = getLeagueImage(league.id);
                  return (
                    <motion.div
                      key={league.id}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ ...ease, delay: i * 0.04 }}
                    >
                      <Bubble size={100} onClick={() => handleBubbleClick(() => handleLeagueSelect(league))} active={false} variant={isLol ? "accent" : "card"} imageUrl={leagueImage}>
                        <span className="text-xs font-bold tracking-wide leading-tight text-center px-1 line-clamp-2">{league.name}</span>
                      </Bubble>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        );
      }

      return (
        <AnimatePresence mode="wait">
          <motion.div key={`cat-${selectedCategory}`} {...fadeIn} className="flex flex-col items-center gap-5">
            <Bubble size={148} onClick={() => handleBubbleClick(() => setSelectedCategory(null))} active variant="card" imageUrl={catImage}>
              <span className="text-sm font-extrabold tracking-wide">{selectedCategory}</span>
            </Bubble>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {/* Show subcategory bubbles */}
              {subcategories.map((sub, i) => {
                const isLol = sub === "League of Legends";
                return (
                  <motion.div
                    key={sub}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...ease, delay: i * 0.04 }}
                  >
                    <Bubble size={112} onClick={() => handleBubbleClick(() => setSelectedSubcategory(sub))} active={false} variant="card" imageUrl={isLol ? "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg" : undefined}>
                      <span className="text-sm font-extrabold tracking-wide leading-tight text-center px-1">{isLol ? "⚔️" : "📁"} {sub}</span>
                    </Bubble>
                  </motion.div>
                );
              })}
              {/* Show regular leagues */}
              {regularLeagues.map((league, i) => {
                const leagueImage = getLeagueImage(league.id);
                return (
                  <motion.div
                    key={league.id}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...ease, delay: (subcategories.length + i) * 0.04 }}
                  >
                    <Bubble size={100} onClick={() => handleBubbleClick(() => handleLeagueSelect(league))} active={false} variant="card" imageUrl={leagueImage}>
                      <span className="text-xs font-bold tracking-wide leading-tight text-center px-1 line-clamp-2">{league.name}</span>
                    </Bubble>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      );
    }

    // Single category — show league bubbles directly
    const allLeagues = categoryKeys.flatMap((cat) => currentCategories[cat]);
    return (
      <AnimatePresence mode="wait">
        <motion.div key="swipe-leagues-direct" {...fadeIn} className="flex flex-col items-center gap-5">
          <Bubble size={148} onClick={() => handleBubbleClick(() => handleSubToggle("swipe"))} active variant="accent">
            <Shuffle className="h-10 w-10" />
            <span className="text-sm font-extrabold tracking-wide">Swipe</span>
          </Bubble>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {allLeagues.map((league, i) => {
              const leagueImage = getLeagueImage(league.id);
              return (
                <motion.div
                  key={league.id}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...ease, delay: i * 0.04 }}
                >
                  <Bubble size={100} onClick={() => handleBubbleClick(() => handleLeagueSelect(league))} active={false} variant="card" imageUrl={leagueImage}>
                    <span className="text-xs font-bold tracking-wide leading-tight text-center px-1 line-clamp-2">{league.name}</span>
                  </Bubble>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  };

  const isLolTheme = selectedSubcategory === "League of Legends";

  return (
    <div className={`px-4 py-8 ${needsScroll ? 'min-h-screen' : 'h-[calc(100vh-4rem)] overflow-hidden'} ${isLolTheme ? 'theme-lol bg-[hsl(220,30%,8%)]' : 'bg-background'} transition-colors duration-500`}>
      <SEOHead title="Play — Mogsy" description="Pick your favorite in head-to-head matchups." />
      <div className="container mx-auto max-w-md">
        <div className="flex items-center gap-3 mb-12">
          <Button variant="ghost" size="icon" onClick={handleBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground flex-1">Play</h1>
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
