import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markSoftNudgeSeen } from "@/lib/quiz/onboarding-gate";

interface Props {
  returnTo?: string;
}

export default function QuizSignUpNudge({ returnTo = "/quiz" }: Props) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(true);

  const dismiss = () => {
    markSoftNudgeSeen();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25 }}
          className="fixed bottom-4 left-1/2 z-[150] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-[#c9a84c]/40 bg-[#1a1530]/95 px-4 py-3 shadow-lg backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 shrink-0 text-[#f0d78c]" />
            <p className="flex-1 text-sm text-[#f5e9c8]">
              Sign up to save your XP and streak to your profile.
            </p>
            <Button
              size="sm"
              className="shrink-0 bg-gradient-to-r from-[#c9a84c] to-[#a8862f] font-bold text-[#1a1530] hover:from-[#d4b35c] hover:to-[#b8923f]"
              onClick={() => navigate(`/auth?mode=signup&returnTo=${encodeURIComponent(returnTo)}`)}
            >
              Sign up
            </Button>
            <button
              onClick={dismiss}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
