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

const spring = { type: "spring" as const, stiffness: 300, damping: 28 };
const springFast = { type: "spring" as const, stiffness: 400, damping: 30 };

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

        <div className="flex items-start justify-center gap-10 mt-8">
          <AnimatePresence mode="popLayout">
            {(expanded === null || expanded === "collections") && (
              <TopBubble
                key="collections" label="Collections" icon={<LayoutGrid />}
                isExpanded={expanded === "collections"} onToggle={() => toggle("collections")}
                subExpanded={expanded === "collections" ? subExpanded : null} onSubToggle={handleSubToggle}
                categories={currentCategories}
                selectedCategory={expanded === "collections" ? selectedCategory : null}
                onCategorySelect={setSelectedCategory} getLeagueIcon={getLeagueIcon} onLeagueSelect={handleLeagueSelect}
              />
            )}
            {(expanded === null || expanded === "compete") && (
              <TopBubble
                key="compete" label="Compete" icon={<Users />}
                isExpanded={expanded === "compete"} onToggle={() => toggle("compete")}
                subExpanded={expanded === "compete" ? subExpanded : null} onSubToggle={handleSubToggle}
                categories={currentCategories}
                selectedCategory={expanded === "compete" ? selectedCategory : null}
                onCategorySelect={setSelectedCategory} getLeagueIcon={getLeagueIcon} onLeagueSelect={handleLeagueSelect}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared bubble style ─── */
const bubbleBase = "rounded-full flex flex-col items-center justify-center border-2";
const bubbleInactive = "border-border bg-card text-foreground";
const bubbleActive = "border-primary bg-primary/10 text-primary";
const bubbleHoverInactive = "hover:border-primary/40";

/* ─── Top-level bubble ─── */
function TopBubble({
  label, icon, isExpanded, onToggle, subExpanded, onSubToggle,
  categories, selectedCategory, onCategorySelect, getLeagueIcon, onLeagueSelect,
}: {
  label: string; icon: React.ReactNode; isExpanded: boolean; onToggle: () => void;
  subExpanded: SubKey; onSubToggle: (sub: SubKey) => void;
  categories: Record<string, LeagueItem[]>; selectedCategory: string | null;
  onCategorySelect: (cat: string | null) => void;
  getLeagueIcon: (name: string) => string;
  onLeagueSelect: (league: LeagueItem) => void;
}) {
  const categoryKeys = Object.keys(categories);
  const hasMultipleCategories = categoryKeys.length > 1;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={spring}
      className="flex flex-col items-center gap-5"
    >
      {/* Main circle — hide when swipe is expanded */}
      <AnimatePresence mode="wait">
        {subExpanded !== "swipe" && (
          <motion.button
            key="main-circle"
            onClick={onToggle}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.2 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            className={`h-32 w-32 gap-2 ${bubbleBase} ${isExpanded ? bubbleActive : `${bubbleInactive} ${bubbleHoverInactive}`}`}
            style={{ boxShadow: isExpanded ? "0 0 40px hsl(var(--primary) / 0.25)" : "none" }}
          >
            <span className="h-10 w-10 flex items-center justify-center">{icon}</span>
            <span className="text-sm font-extrabold tracking-wide">{label}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Sub-bubbles: Swipe & Elo Check */}
      <AnimatePresence mode="wait">
        {isExpanded && (
          <motion.div
            key="sub-actions"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={spring}
            className="flex flex-col items-center gap-5"
          >
            <div className="flex items-center justify-center gap-6">
              <AnimatePresence mode="popLayout">
                {(subExpanded === null || (subExpanded === "swipe" && !selectedCategory)) && (
                  <motion.button
                    key="swipe"
                    onClick={() => onSubToggle("swipe")}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.2 }}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.95 }}
                    className={`${bubbleBase} gap-1 ${
                      subExpanded === "swipe" ? bubbleActive : "border-primary/30 bg-primary/5 text-primary"
                    }`}
                    style={{
                      width: subExpanded === "swipe" ? 128 : 80,
                      height: subExpanded === "swipe" ? 128 : 80,
                      boxShadow: subExpanded === "swipe" ? "0 0 40px hsl(var(--primary) / 0.25)" : "none",
                    }}
                  >
                    <Shuffle className={subExpanded === "swipe" ? "h-10 w-10" : "h-6 w-6"} />
                    <span className={`font-extrabold tracking-wide ${subExpanded === "swipe" ? "text-sm" : "text-[10px]"}`}>
                      Swipe
                    </span>
                  </motion.button>
                )}
                {(subExpanded === null || subExpanded === "elocheck") && (
                  <motion.button
                    key="elocheck"
                    onClick={() => onSubToggle("elocheck")}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ ...spring, delay: 0.05 }}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.95 }}
                    className={`h-20 w-20 ${bubbleBase} gap-1 border-primary/30 bg-primary/5 text-primary`}
                  >
                    <Zap className="h-6 w-6" />
                    <span className="text-[10px] font-extrabold tracking-wide">Elo Check</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Level 3: Categories or direct leagues */}
            <AnimatePresence mode="wait">
              {subExpanded === "swipe" && (
                <motion.div
                  key="category-area"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={spring}
                  className="flex flex-col items-center gap-5"
                >
                  {hasMultipleCategories ? (
                    <>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <AnimatePresence mode="popLayout">
                          {categoryKeys
                            .filter((cat) => selectedCategory === null || selectedCategory === cat)
                            .map((cat, i) => {
                              const isActive = selectedCategory === cat;
                              return (
                                <motion.button
                                  key={cat}
                                  layout
                                  onClick={() => onCategorySelect(isActive ? null : cat)}
                                  initial={{ opacity: 0, scale: 0.5 }}
                                  animate={{
                                    opacity: 1,
                                    scale: 1,
                                    width: isActive ? 128 : 96,
                                    height: isActive ? 128 : 96,
                                  }}
                                  exit={{ opacity: 0, scale: 0.5 }}
                                  transition={{ ...spring, delay: i * 0.03 }}
                                  whileHover={{ scale: 1.06 }}
                                  whileTap={{ scale: 0.95 }}
                                  className={`${bubbleBase} gap-1 ${
                                    isActive ? bubbleActive : `${bubbleInactive} ${bubbleHoverInactive}`
                                  }`}
                                  style={{ boxShadow: isActive ? "0 0 40px hsl(var(--primary) / 0.25)" : "none" }}
                                >
                                  <span className={isActive ? "text-4xl" : "text-2xl"}>
                                    {CATEGORY_ICONS[cat] || "📋"}
                                  </span>
                                  <span className={`font-extrabold tracking-wide leading-tight text-center px-1 ${
                                    isActive ? "text-xs" : "text-[9px]"
                                  }`}>
                                    {cat}
                                  </span>
                                </motion.button>
                              );
                            })}
                        </AnimatePresence>
                      </div>

                      <AnimatePresence mode="wait">
                        {selectedCategory && categories[selectedCategory] && (
                          <motion.div
                            key={`leagues-${selectedCategory}`}
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={spring}
                            className="flex flex-wrap items-center justify-center gap-3"
                          >
                            {categories[selectedCategory].map((league, i) => (
                              <motion.button
                                key={league.id}
                                onClick={() => onLeagueSelect(league)}
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ ...springFast, delay: i * 0.04 }}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                className={`h-20 w-20 ${bubbleBase} gap-0.5 ${bubbleInactive} ${bubbleHoverInactive}`}
                              >
                                <span className="text-xl">{getLeagueIcon(league.name)}</span>
                                <span className="text-[9px] font-bold tracking-wide leading-tight text-center px-1 line-clamp-2">
                                  {league.name}
                                </span>
                              </motion.button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {categoryKeys.flatMap((cat) =>
                        categories[cat].map((league, i) => (
                          <motion.button
                            key={league.id}
                            onClick={() => onLeagueSelect(league)}
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ ...springFast, delay: i * 0.04 }}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className={`h-20 w-20 ${bubbleBase} gap-0.5 ${bubbleInactive} ${bubbleHoverInactive}`}
                          >
                            <span className="text-xl">{getLeagueIcon(league.name)}</span>
                            <span className="text-[9px] font-bold tracking-wide leading-tight text-center px-1 line-clamp-2">
                              {league.name}
                            </span>
                          </motion.button>
                        ))
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
