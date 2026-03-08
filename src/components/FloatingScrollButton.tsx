import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, ArrowDown } from "lucide-react";

export default function FloatingScrollButton() {
  const [atBottom, setAtBottom] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY;
      const windowH = window.innerHeight;
      const docH = document.documentElement.scrollHeight;
      setVisible(docH > windowH + 200);
      setAtBottom(scrollY + windowH >= docH - 100);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  const handleClick = () => {
    if (atBottom) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    }
  };

  return (
    <AnimatePresence>
      <motion.button
        key={atBottom ? "up" : "down"}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleClick}
        className="fixed bottom-6 left-6 z-[60] w-10 h-10 rounded-full bg-card/90 backdrop-blur-xl border border-border shadow-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        {atBottom ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </motion.button>
    </AnimatePresence>
  );
}
