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

// Timing constants (25% slower than previous)
const DUR_FAST = 0.19;
const DUR_MED = 0.24;
const DUR_EXIT = 0.15;

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
      .then(({ data }) => {
        if (data) setLeagues(data);
      });
  }, []);

  const toggle = (key: ModeKey) => {
    if (expanded === key) {
      setExpanded(null);
      setSubExpanded(null);
      setSelectedCategory(null);
    } else {
      setExpanded(key);
      setSubExpanded(null);
      setSelectedCategory(null);
    }
  };

  const handleSubToggle = (sub: SubKey) => {
    if (sub === "elocheck") {
      navigate("/elo-check");
      return;
    }
    if (subExpanded === sub) {
      setSubExpanded(null);
      setSelectedCategory(null);
    } else {
      setSubExpanded(sub);
      setSelectedCategory(null);
    }
  };

  const handleBack = () => {
    if (selectedCategory) {
      setSelectedCategory(null);
    } else if (subExpanded) {
      setSubExpanded(null);
    } else if (expanded) {
      setExpanded(null);
    } else {
      navigate(-1);
    }
  };

  const handleLeagueSelect = (league: LeagueItem) => {
    if (league.type === "preset") {
      navigate(`/swipe/preset/${league.id}`);
    } else {
      navigate("/swipe");
    }
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

  const getLeagueIcon = (name: string, category: string | null) => {
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
      <SEOHead
        title="Play — Mogsy"
        description="Pick your favorite in head-to-head matchups."
      />
      <div className="container mx-auto max-w-md">
        <div className="flex items-center gap-3 mb-12">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground flex-1">Play</h1>
        </div>

        <div className="flex items-start justify-center gap-10 mt-8">
          <AnimatePresence mode="popLayout">
            {(expanded === null || expanded === "collections") && (
              <TopBubble
                key="collections"
                label="Collections"
                icon={<LayoutGrid className="h-10 w-10" />}
                isExpanded={expanded === "collections"}
                onToggle={() => toggle("collections")}
                subExpanded={expanded === "collections" ? subExpanded : null}
                onSubToggle={handleSubToggle}
                categories={currentCategories}
                selectedCategory={expanded === "collections" ? selectedCategory : null}
                onCategorySelect={setSelectedCategory}
                getLeagueIcon={getLeagueIcon}
                onLeagueSelect={handleLeagueSelect}
              />
            )}
            {(expanded === null || expanded === "compete") && (
              <TopBubble
                key="compete"
                label="Compete"
                icon={<Users className="h-10 w-10" />}
                isExpanded={expanded === "compete"}
                onToggle={() => toggle("compete")}
                subExpanded={expanded === "compete" ? subExpanded : null}
                onSubToggle={handleSubToggle}
                categories={currentCategories}
                selectedCategory={expanded === "compete" ? selectedCategory : null}
                onCategorySelect={setSelectedCategory}
                getLeagueIcon={getLeagueIcon}
                onLeagueSelect={handleLeagueSelect}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ─── Top-level bubble ─── */
function TopBubble({
  label,
  icon,
  isExpanded,
  onToggle,
  subExpanded,
  onSubToggle,
  categories,
  selectedCategory,
  onCategorySelect,
  getLeagueIcon,
  onLeagueSelect,
}: {
  label: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  subExpanded: SubKey;
  onSubToggle: (sub: SubKey) => void;
  categories: Record<string, LeagueItem[]>;
  selectedCategory: string | null;
  onCategorySelect: (cat: string | null) => void;
  getLeagueIcon: (name: string, category: string | null) => string;
  onLeagueSelect: (league: LeagueItem) => void;
}) {
  const categoryKeys = Object.keys(categories);
  const hasMultipleCategories = categoryKeys.length > 1;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: DUR_EXIT } }}
      transition={{ duration: DUR_MED }}
      className="flex flex-col items-center gap-4"
    >
      {/* Main circle — hide when swipe sub-expanded */}
      <AnimatePresence>
        {subExpanded !== "swipe" && (
          <motion.button
            key="main-circle"
            onClick={onToggle}
            layout
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6, transition: { duration: DUR_EXIT } }}
            className={`relative h-32 w-32 rounded-full flex flex-col items-center justify-center gap-2 border-2 transition-colors duration-300 ${
              isExpanded
                ? "border-primary bg-primary/10 text-primary shadow-[0_0_40px_hsl(var(--primary)/0.25)]"
                : "border-border bg-card text-foreground hover:border-primary/40 hover:shadow-[0_0_30px_hsl(var(--primary)/0.12)]"
            }`}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
          >
            {icon}
            <span className="text-sm font-extrabold tracking-wide">{label}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Sub-bubbles: Swipe & Elo Check */}
      <AnimatePresence mode="popLayout">
        {isExpanded && (
          <motion.div
            key="sub-actions"
            layout
            initial={{ opacity: 0, y: -16, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.8 }}
            transition={{ duration: DUR_MED }}
            className="flex flex-col items-center gap-4"
          >
            <div className="flex items-center justify-center gap-6">
              <AnimatePresence mode="popLayout">
                {(subExpanded === null || subExpanded === "swipe") && (
                  <SubBubble
                    key="swipe"
                    label="Swipe"
                    icon={<Shuffle className="h-6 w-6" />}
                    onClick={() => onSubToggle("swipe")}
                    isActive={subExpanded === "swipe"}
                    delay={0}
                  />
                )}
                {(subExpanded === null || subExpanded === "elocheck") && (
                  <SubBubble
                    key="elocheck"
                    label="Elo Check"
                    icon={<Zap className="h-6 w-6" />}
                    onClick={() => onSubToggle("elocheck")}
                    isActive={false}
                    delay={0.08}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Level 3: Category bubbles (or direct leagues if single category) */}
            <AnimatePresence>
              {subExpanded === "swipe" && (
                <motion.div
                  key="category-area"
                  initial={{ opacity: 0, y: -12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.9 }}
                  transition={{ duration: DUR_MED }}
                  className="flex flex-col items-center gap-4 mt-2"
                >
                  {hasMultipleCategories ? (
                    <>
                      {/* Category bubbles row */}
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <AnimatePresence mode="popLayout">
                          {categoryKeys
                            .filter((cat) => selectedCategory === null || selectedCategory === cat)
                            .map((cat, i) => (
                              <CategoryBubble
                                key={cat}
                                label={cat}
                                emoji={CATEGORY_ICONS[cat] || "📋"}
                                isActive={selectedCategory === cat}
                                onClick={() =>
                                  onCategorySelect(selectedCategory === cat ? null : cat)
                                }
                                delay={i * 0.04}
                              />
                            ))}
                        </AnimatePresence>
                      </div>

                      {/* Expanded league bubbles under selected category */}
                      <AnimatePresence>
                        {selectedCategory && categories[selectedCategory] && (
                          <motion.div
                            key={`leagues-${selectedCategory}`}
                            initial={{ opacity: 0, y: -10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.9 }}
                            transition={{ duration: DUR_MED }}
                            className="flex flex-wrap items-center justify-center gap-3"
                          >
                            {categories[selectedCategory].map((league, i) => (
                              <LeagueBubble
                                key={league.id}
                                label={league.name}
                                emoji={getLeagueIcon(league.name, league.category)}
                                onClick={() => onLeagueSelect(league)}
                                delay={i * 0.04}
                              />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  ) : (
                    /* Single category — show leagues directly */
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {categoryKeys.flatMap((cat) =>
                        categories[cat].map((league, i) => (
                          <LeagueBubble
                            key={league.id}
                            label={league.name}
                            emoji={getLeagueIcon(league.name, league.category)}
                            onClick={() => onLeagueSelect(league)}
                            delay={i * 0.04}
                          />
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

/* ─── Medium action bubble (Swipe / Elo Check) ─── */
function SubBubble({
  label,
  icon,
  onClick,
  isActive,
  delay,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  isActive: boolean;
  delay: number;
}) {
  return (
    <motion.button
      layout
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.5, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5, y: -10 }}
      transition={{ duration: DUR_FAST, delay }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className={`h-20 w-20 rounded-full border flex flex-col items-center justify-center gap-1 transition-colors duration-200 ${
        isActive
          ? "border-primary bg-primary/15 text-primary shadow-[0_0_24px_hsl(var(--primary)/0.25)]"
          : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 hover:shadow-[0_0_24px_hsl(var(--primary)/0.2)]"
      }`}
    >
      {icon}
      <span className="text-[10px] font-bold tracking-wide">{label}</span>
    </motion.button>
  );
}

/* ─── Category bubble ─── */
function CategoryBubble({
  label,
  emoji,
  isActive,
  onClick,
  delay,
}: {
  label: string;
  emoji: string;
  isActive: boolean;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      layout
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.4, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.4, y: -8, transition: { duration: DUR_EXIT } }}
      transition={{ duration: DUR_FAST, delay }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className={`h-[4.5rem] w-[4.5rem] rounded-full border flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 ${
        isActive
          ? "border-primary bg-primary/15 text-primary shadow-[0_0_24px_hsl(var(--primary)/0.25)]"
          : "border-border bg-card text-foreground hover:border-primary/40 hover:shadow-[0_0_20px_hsl(var(--primary)/0.15)]"
      }`}
    >
      <span className="text-xl">{emoji}</span>
      <span className="text-[8px] font-bold tracking-wide leading-tight text-center px-1">
        {label}
      </span>
    </motion.button>
  );
}

/* ─── Small league bubble ─── */
function LeagueBubble({
  label,
  emoji,
  onClick,
  delay,
}: {
  label: string;
  emoji: string;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.4, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: DUR_FAST, delay }}
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.88 }}
      className="h-16 w-16 rounded-full border border-border bg-card text-foreground flex flex-col items-center justify-center gap-0.5 hover:border-primary/40 hover:shadow-[0_0_20px_hsl(var(--primary)/0.15)] transition-colors duration-200"
    >
      <span className="text-lg">{emoji}</span>
      <span className="text-[8px] font-bold tracking-wide leading-tight text-center px-1 line-clamp-2">
        {label}
      </span>
    </motion.button>
  );
}
