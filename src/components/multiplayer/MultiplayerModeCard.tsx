import { motion } from "framer-motion";
import { Users, Target, Eye, Castle, Flame, Lock } from "lucide-react";
import type { MultiplayerMode } from "@/hooks/useMultiplayerGame";

interface MultiplayerModeCardProps {
  mode: MultiplayerMode;
  onClick: () => void;
  disabled?: boolean;
}

const MODE_CONFIG: Record<
  MultiplayerMode,
  {
    title: string;
    description: string;
    icon: React.ReactNode;
    gradient: string;
  }
> = {
  tag_team: {
    title: "Tag Team",
    description: "2v2 — Each duo submits items, community votes decide the winner",
    icon: <Users className="h-6 w-6" />,
    gradient: "from-blue-500 to-cyan-500",
  },
  draft_duel: {
    title: "Draft & Duel",
    description: "2v2 — Snake draft items, then battle in a best-of series",
    icon: <Target className="h-6 w-6" />,
    gradient: "from-purple-500 to-pink-500",
  },
  prediction_wars: {
    title: "Prediction Wars",
    description: "2v2 — Predict matchup outcomes, most correct wins",
    icon: <Eye className="h-6 w-6" />,
    gradient: "from-amber-500 to-orange-500",
  },
  siege: {
    title: "Siege Mode",
    description: "2v2 — Defend your tower, destroy the enemy's",
    icon: <Castle className="h-6 w-6" />,
    gradient: "from-red-500 to-rose-500",
  },
  hot_streak: {
    title: "Hot Streak",
    description: "2v2 — Tag-team relay, longest combined streak wins",
    icon: <Flame className="h-6 w-6" />,
    gradient: "from-green-500 to-emerald-500",
  },
};

export default function MultiplayerModeCard({ mode, onClick, disabled }: MultiplayerModeCardProps) {
  const config = MODE_CONFIG[mode];

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className={`relative w-full p-4 rounded-xl border-2 text-left transition-all overflow-hidden group ${
        disabled
          ? "border-muted bg-muted/30 cursor-not-allowed opacity-60"
          : "border-border bg-card hover:border-primary/50 cursor-pointer"
      }`}
    >
      {/* Gradient accent */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-0 group-hover:opacity-10 transition-opacity`}
      />

      <div className="relative flex items-start gap-4">
        {/* Icon */}
        <div
          className={`flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br ${config.gradient} text-white shadow-lg`}
        >
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-foreground">{config.title}</h3>
            {disabled && <Lock className="h-4 w-4 text-muted-foreground" />}
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{config.description}</p>
        </div>

        {/* Player count badge */}
        <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
          <Users className="h-3 w-3" />
          <span>2v2</span>
        </div>
      </div>
    </motion.button>
  );
}
