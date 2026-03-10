import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown } from "lucide-react";

interface SwipeBottomBarProps {
  children: React.ReactNode;
}

export default function SwipeBottomBar({ children }: SwipeBottomBarProps) {
  const [expanded, setExpanded] = useState(true);

  // Auto-minimize after 6 seconds
  useEffect(() => {
    if (!expanded) return;
    const t = setTimeout(() => setExpanded(false), 6000);
    return () => clearTimeout(t);
  }, [expanded]);

  // Re-expand on interaction then auto-collapse again
  const handleToggle = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  return (
    <div className="sticky bottom-0 left-0 right-0 z-30 mt-2">
      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-card/95 backdrop-blur-sm border-t border-border rounded-t-xl shadow-lg"
          >
            <div className="flex items-center justify-center gap-3 px-3 py-2">
              {children}
            </div>
            <button
              onClick={handleToggle}
              className="w-full flex items-center justify-center py-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors border-t border-border/30"
            >
              <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="minimized"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleToggle}
            className="w-full flex items-center justify-center py-1.5 bg-card/80 backdrop-blur-sm border-t border-border rounded-t-xl"
          >
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
