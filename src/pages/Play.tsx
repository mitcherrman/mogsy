import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shuffle, Zap, Users, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";

type ModeKey = "collections" | "compete" | null;

export default function Play() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<ModeKey>(null);

  const toggle = (key: ModeKey) =>
    setExpanded((prev) => (prev === key ? null : key));

  const handleSwipe = (mode: ModeKey) => {
    if (mode === "compete") navigate("/swipe");
    else navigate("/swipe-leagues", { state: { openCategory: null } });
  };

  const handleEloCheck = () => navigate("/elo-check");

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <SEOHead
        title="Play — Mogsy"
        description="Pick your favorite in head-to-head matchups. Swipe through leagues, rate items, and climb the Elo leaderboard."
      />
      <div className="container mx-auto max-w-md">
        {/* Header */}
        <div className="flex items-center gap-3 mb-12">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground flex-1">
            Play
          </h1>
        </div>

        {/* Main bubbles */}
        <div className="flex flex-col items-center gap-10">
          <PlayBubble
            label="Collections"
            icon={<LayoutGrid className="h-10 w-10" />}
            isExpanded={expanded === "collections"}
            onToggle={() => toggle("collections")}
            onSwipe={() => handleSwipe("collections")}
            onEloCheck={handleEloCheck}
          />

          <PlayBubble
            label="Compete"
            icon={<Users className="h-10 w-10" />}
            isExpanded={expanded === "compete"}
            onToggle={() => toggle("compete")}
            onSwipe={() => handleSwipe("compete")}
            onEloCheck={handleEloCheck}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Big circle bubble with expanding sub-actions ─── */
function PlayBubble({
  label,
  icon,
  isExpanded,
  onToggle,
  onSwipe,
  onEloCheck,
}: {
  label: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  onSwipe: () => void;
  onEloCheck: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Main bubble */}
      <motion.button
        onClick={onToggle}
        className={`relative h-32 w-32 rounded-full flex flex-col items-center justify-center gap-2 border-2 transition-colors duration-300 ${
          isExpanded
            ? "border-primary bg-primary/10 text-primary shadow-[0_0_40px_hsl(var(--primary)/0.25)]"
            : "border-border bg-card text-foreground hover:border-primary/40 hover:shadow-[0_0_30px_hsl(var(--primary)/0.12)]"
        }`}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        layout
      >
        {icon}
        <span className="text-sm font-extrabold tracking-wide">{label}</span>
      </motion.button>

      {/* Sub-bubbles */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 400, damping: 24 }}
            className="flex items-center gap-6"
          >
            <SubBubble
              label="Swipe"
              icon={<Shuffle className="h-6 w-6" />}
              onClick={onSwipe}
              delay={0}
            />
            <SubBubble
              label="Elo Check"
              icon={<Zap className="h-6 w-6" />}
              onClick={onEloCheck}
              delay={0.06}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Small action bubble ─── */
function SubBubble({
  label,
  icon,
  onClick,
  delay,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.5, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 22, delay }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="h-20 w-20 rounded-full border border-primary/30 bg-primary/5 text-primary flex flex-col items-center justify-center gap-1 hover:bg-primary/15 hover:shadow-[0_0_24px_hsl(var(--primary)/0.2)] transition-colors duration-200"
    >
      {icon}
      <span className="text-[10px] font-bold tracking-wide">{label}</span>
    </motion.button>
  );
}
