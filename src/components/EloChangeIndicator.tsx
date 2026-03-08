import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Globe } from "lucide-react";

interface EloChangeIndicatorProps {
  change: number | null;
  oldRank?: number | null;
  newRank?: number | null;
  globalDirection?: "up" | "down" | "none";
}

export default function EloChangeIndicator({ change, oldRank, newRank, globalDirection }: EloChangeIndicatorProps) {
  if (change === null && !globalDirection) return null;

  const isPositive = change !== null && change > 0;
  const rankChange = oldRank && newRank ? oldRank - newRank : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: isPositive ? 8 : -8, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: isPositive ? -12 : 12, scale: 0.6 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex items-center gap-1 justify-center"
      >
        {change !== null && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 400, damping: 15 }}
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${
              isPositive
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>{isPositive ? "+" : ""}{change}</span>
          </motion.div>
        )}

        {rankChange !== null && rankChange !== 0 && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
            className={`text-[10px] font-semibold ${
              rankChange > 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {rankChange > 0 ? `▲${rankChange}` : `▼${Math.abs(rankChange)}`}
          </motion.span>
        )}

        {globalDirection && globalDirection !== "none" && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 300, damping: 20 }}
            className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              globalDirection === "up"
                ? "bg-blue-500/15 text-blue-400"
                : "bg-orange-500/15 text-orange-400"
            }`}
          >
            <Globe className="h-2.5 w-2.5" />
            {globalDirection === "up" ? "↑" : "↓"}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
