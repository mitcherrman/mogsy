import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shuffle, Zap, Users, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";
import { supabase } from "@/integrations/supabase/client";

type ModeKey = "collections" | "compete" | null;
type SubKey = "swipe" | "elocheck" | null;

const CATEGORY_ICONS: Record<string, string> = {
  Anime: "🎌",
  Movies: "🎬",
  "Video Games": "🎮",
  Celebrities: "⭐",
  Other: "📋",
};

interface LeagueItem {
  id: string;
  name: string;
  category: string | null;
  type: string;
}

// Simple, consistent easing — no springs to avoid overshoot/bounce
const ease = { duration: 0.25, ease: [0.4, 0, 0.2, 1] as const };
const fadeIn = { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.85 }, transition: ease };

export default function Play() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<ModeKey>(null);
  const [subExpanded, setSubExpanded] = useState<SubKey>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<LeagueItem[]>([]);

  useEffect(() => {
    supabase
      .from("leagues")
      .select("id, name, category, type")
      .then(({ data }) => { if (data) setLeagues(data); });
  }, []);

  const toggle = (key: ModeKey) => {
    if (expanded === key) { setExpanded(null); setSubExpanded(null); setSelectedCategory(null); }
    else { setExpanded(key); setSubExpanded(null); setSelectedCategory(null); }
  };

  const handleSubToggle = (sub: SubKey) => {
    if (sub === "elocheck") { navigate("/elo-check"); return; }
    if (subExpanded === sub) { setSubExpanded(null); setSelectedCategory(null); }
    else { setSubExpanded(sub); setSelectedCategory(null); }
  };

  const handleBack = () => {
    if (selectedCategory) setSelectedCategory(null);
    else if (subExpanded) setSubExpanded(null);
    else if (expanded) setExpanded(null);
    else navigate(-1);
  };

  const handleLeagueSelect = (league: LeagueItem) => {
    if (league.type === "preset") navigate(`/swipe/preset/${league.id}`);
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

  const getLeagueIcon = (name: string) => {
    if (name.includes("Restaurant")) return "🍽️";
    if (name.includes("Fast Food")) return "🍔";
    if (name.includes("Car")) return "🏎️";
    if (name.includes("Global")) return "🌍";
    if (name.includes("North America")) return "🇺🇸";
    if (name.includes("Europe")) return "🇪🇺";
    if (name.includes("Asia")) return "🌏";
    return "📋";
  };

  // Determine what to render based on current drill-down state
  const renderContent = () => {
    // No mode selected — show Collections & Compete side by side
    if (!expanded) {
      return (
        <AnimatePresence mode="wait">
          <motion.div key="top-level" {...fadeIn} className="flex items-center justify-center gap-10">
            <Bubble size={148} onClick={() => toggle("collections")} active={false} variant="card">
              <span className="h-10 w-10 flex items-center justify-center"><LayoutGrid className="h-10 w-10" /></span>
              <span className="text-sm font-extrabold tracking-wide">Collections</span>
            </Bubble>
            <Bubble size={148} onClick={() => toggle("compete")} active={false} variant="card">
              <span className="h-10 w-10 flex items-center justify-center"><Users className="h-10 w-10" /></span>
              <span className="text-sm font-extrabold tracking-wide">Compete</span>
            </Bubble>
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
            <Bubble size={148} onClick={() => toggle(expanded)} active variant="card">
              <span className="h-10 w-10 flex items-center justify-center">{modeIcon}</span>
              <span className="text-sm font-extrabold tracking-wide">{modeLabel}</span>
            </Bubble>
            <div className="flex items-center justify-center gap-6">
               <Bubble size={100} onClick={() => handleSubToggle("swipe")} active={false} variant="accent">
                 <Shuffle className="h-7 w-7" />
                 <span className="text-xs font-extrabold tracking-wide">Swipe</span>
               </Bubble>
               <Bubble size={100} onClick={() => handleSubToggle("elocheck")} active={false} variant="accent">
                 <Zap className="h-7 w-7" />
                 <span className="text-xs font-extrabold tracking-wide">Elo Check</span>
               </Bubble>
            </div>
          </motion.div>
        </AnimatePresence>
      );
    }

    // Swipe selected — show categories (or direct leagues for single-category)
    const categoryKeys = Object.keys(currentCategories);
    const hasMultipleCategories = categoryKeys.length > 1;

    if (!selectedCategory && hasMultipleCategories) {
      // Show Swipe bubble + category bubbles
      return (
        <AnimatePresence mode="wait">
          <motion.div key="swipe-categories" {...fadeIn} className="flex flex-col items-center gap-5">
             <Bubble size={148} onClick={() => handleSubToggle("swipe")} active variant="accent">
               <Shuffle className="h-10 w-10" />
               <span className="text-sm font-extrabold tracking-wide">Swipe</span>
             </Bubble>
             <div className="flex flex-wrap items-center justify-center gap-4">
               {categoryKeys.map((cat, i) => (
                 <motion.div
                   key={cat}
                   initial={{ opacity: 0, scale: 0.7 }}
                   animate={{ opacity: 1, scale: 1 }}
                   transition={{ ...ease, delay: i * 0.04 }}
                 >
                   <Bubble size={112} onClick={() => onCatSelect(cat)} active={false} variant="card">
                    <span className="text-2xl">{CATEGORY_ICONS[cat] || "📋"}</span>
                    <span className="text-[9px] font-extrabold tracking-wide leading-tight text-center px-1">{cat}</span>
                  </Bubble>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      );
    }

    if (selectedCategory && hasMultipleCategories) {
      // Show selected category bubble + league bubbles
      const leaguesInCat = currentCategories[selectedCategory] || [];
      return (
        <AnimatePresence mode="wait">
          <motion.div key={`cat-${selectedCategory}`} {...fadeIn} className="flex flex-col items-center gap-5">
            <Bubble size={148} onClick={() => setSelectedCategory(null)} active variant="card">
              <span className="text-4xl">{CATEGORY_ICONS[selectedCategory] || "📋"}</span>
              <span className="text-xs font-extrabold tracking-wide">{selectedCategory}</span>
            </Bubble>
             <div className="flex flex-wrap items-center justify-center gap-4">
               {leaguesInCat.map((league, i) => (
                 <motion.div
                   key={league.id}
                   initial={{ opacity: 0, scale: 0.7 }}
                   animate={{ opacity: 1, scale: 1 }}
                   transition={{ ...ease, delay: i * 0.04 }}
                 >
                   <Bubble size={100} onClick={() => handleLeagueSelect(league)} active={false} variant="card">
                    <span className="text-xl">{getLeagueIcon(league.name)}</span>
                    <span className="text-[9px] font-bold tracking-wide leading-tight text-center px-1 line-clamp-2">{league.name}</span>
                  </Bubble>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      );
    }

    // Single category (e.g. Compete → Leagues) — show swipe bubble + league bubbles directly
    const allLeagues = categoryKeys.flatMap((cat) => currentCategories[cat]);
    return (
      <AnimatePresence mode="wait">
        <motion.div key="swipe-leagues-direct" {...fadeIn} className="flex flex-col items-center gap-5">
           <Bubble size={148} onClick={() => handleSubToggle("swipe")} active variant="accent">
             <Shuffle className="h-10 w-10" />
             <span className="text-sm font-extrabold tracking-wide">Swipe</span>
           </Bubble>
           <div className="flex flex-wrap items-center justify-center gap-4">
             {allLeagues.map((league, i) => (
               <motion.div
                 key={league.id}
                 initial={{ opacity: 0, scale: 0.7 }}
                 animate={{ opacity: 1, scale: 1 }}
                 transition={{ ...ease, delay: i * 0.04 }}
               >
                 <Bubble size={100} onClick={() => handleLeagueSelect(league)} active={false} variant="card">
                  <span className="text-xl">{getLeagueIcon(league.name)}</span>
                  <span className="text-[9px] font-bold tracking-wide leading-tight text-center px-1 line-clamp-2">{league.name}</span>
                </Bubble>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  };

  const onCatSelect = (cat: string) => setSelectedCategory(cat);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
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

/* ─── Reusable circle bubble ─── */
function Bubble({
  size,
  onClick,
  active,
  variant,
  children,
}: {
  size: number;
  onClick: () => void;
  active: boolean;
  variant: "card" | "accent";
  children: React.ReactNode;
}) {
  const baseClass = "rounded-full flex flex-col items-center justify-center border-2 cursor-pointer select-none";

  let colorClass: string;
  if (active && variant === "card") {
    colorClass = "border-primary bg-primary/10 text-primary";
  } else if (active && variant === "accent") {
    colorClass = "border-primary bg-primary/10 text-primary";
  } else if (variant === "accent") {
    colorClass = "border-primary/30 bg-primary/5 text-primary";
  } else {
    colorClass = "border-border bg-card text-foreground";
  }

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.95 }}
      className={`${baseClass} ${colorClass}`}
      style={{
        width: size,
        height: size,
        gap: size >= 128 ? 8 : 4,
        boxShadow: active ? "0 0 40px hsl(var(--primary) / 0.25)" : "none",
      }}
    >
      {children}
    </motion.button>
  );
}
