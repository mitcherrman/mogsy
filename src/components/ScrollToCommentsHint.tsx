import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MessageCircle } from "lucide-react";

export default function ScrollToCommentsHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 8000);
    const hideTimer = setTimeout(() => setVisible(false), 14000);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4 }}
          onClick={() => {
            setVisible(false);
            window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
          }}
          className="flex items-center gap-1.5 mx-auto mt-1 px-3 py-1 rounded-full bg-muted/60 border border-border/50 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="h-3 w-3" />
          <span>Scroll down for comments</span>
          <ChevronDown className="h-3 w-3 animate-bounce" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
