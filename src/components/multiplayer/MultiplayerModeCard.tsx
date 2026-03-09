import { motion } from "framer-motion";
import { Users, Target, Eye, Castle, Flame, Lock } from "lucide-react";
import type { MultiplayerMode } from "@/hooks/useMultiplayerGame";

interface MultiplayerModeCardProps {
  mode: MultiplayerMode;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
}

const MODE_CONFIG: Record<
  MultiplayerMode,
  {
    title: string;
    description: string;
    icon: React.ReactNode;
    gradient: string;
    bgColor: string;
  }
> = {
  tag_team: {
    title: "Tag Team",
    description: "2v2 — Each duo submits items, community votes decide the winner",
    icon: <Users className="h-7 w-7" />,
    gradient: "from-blue-500 to-cyan-500",
    bgColor: "bg-gradient-to-br from-blue-500 to-cyan-500",
  },
  draft_duel: {
    title: "Draft & Duel",
    description: "2v2 — Snake draft items, then battle in a best-of series",
    icon: <Target className="h-7 w-7" />,
    gradient: "from-purple-500 to-pink-500",
    bgColor: "bg-gradient-to-br from-purple-500 to-pink-500",
  },
  prediction_wars: {
    title: "Prediction Wars",
    description: "2v2 — Predict matchup outcomes, most correct wins",
    icon: <Eye className="h-7 w-7" />,
    gradient: "from-amber-500 to-orange-500",
    bgColor: "bg-gradient-to-br from-amber-500 to-orange-500",
  },
  siege: {
    title: "Siege Mode",
    description: "2v2 — Defend your tower, destroy the enemy's",
    icon: <Castle className="h-7 w-7" />,
    gradient: "from-red-500 to-rose-500",
    bgColor: "bg-gradient-to-br from-red-500 to-rose-500",
  },
  hot_streak: {
    title: "Hot Streak",
    description: "2v2 — Tag-team relay, longest combined streak wins",
    icon: <Flame className="h-7 w-7" />,
    gradient: "from-green-500 to-emerald-500",
    bgColor: "bg-gradient-to-br from-green-500 to-emerald-500",
  },
};

export default function MultiplayerModeCard({ mode, onClick, disabled, selected }: MultiplayerModeCardProps) {
  const config = MODE_CONFIG[mode];

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      className="flex flex-col items-center gap-2 group"
    >
      {/* Bubble */}
      <div
        className={`relative flex items-center justify-center w-20 h-20 rounded-full shadow-lg transition-all ${
          disabled
            ? "bg-muted opacity-50"
            : config.bgColor
        } ${selected ? "ring-4 ring-primary ring-offset-2 ring-offset-background" : ""}`}
      >
        <div className="text-white drop-shadow-md">
          {config.icon}
        </div>
        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
            <Lock className="h-5 w-5 text-white/80" />
          </div>
        )}
      </div>

      {/* Title */}
      <span className={`text-sm font-bold transition-colors ${
        disabled ? "text-muted-foreground" : selected ? "text-primary" : "text-foreground"
      }`}>
        {config.title}
      </span>
    </motion.button>
  );
}

export { MODE_CONFIG };
