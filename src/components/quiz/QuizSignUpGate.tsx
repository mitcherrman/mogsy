import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Flame, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuizProgress } from "@/lib/quiz/api";

interface Props {
  progress: QuizProgress | null;
  actionCount: number;
  returnTo?: string;
  /** When provided, shows a "Keep Playing as Guest" option that closes the gate. */
  onDismiss?: () => void;
}

export default function QuizSignUpGate({ progress, actionCount, returnTo = "/quiz", onDismiss }: Props) {
  const navigate = useNavigate();

  const xp = progress?.xp ?? 0;
  const streak = progress?.current_streak ?? 0;
  const rankName = typeof progress?.rank === "object"
    ? (progress.rank as any)?.rank_name
    : progress?.rank_name ?? null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-background/80 backdrop-blur-sm px-4 py-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl border border-[#c9a84c]/40 bg-gradient-to-br from-[#1a1530]/95 via-[#0a1428]/95 to-[#0a0a1a]/95 p-6 max-[430px]:p-5 shadow-[0_0_40px_rgba(0,0,0,0.6)]"
      >
        {/* Lock icon */}
        <div className="flex justify-center mb-4 [@media(max-height:480px)]:mb-2">
          <div className="flex h-14 w-14 [@media(max-height:480px)]:h-10 [@media(max-height:480px)]:w-10 items-center justify-center rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10">
            <Lock className="h-6 w-6 text-[#f0d78c]" />
          </div>
        </div>

        <h2 className="text-center text-xl font-bold text-[#f5e9c8] mb-1">
          Save your score?
        </h2>
        <p className="text-center text-sm text-muted-foreground mb-4">
          Create a free account to track your League quiz progress, streaks, and results.
        </p>
        <ul className="mx-auto mb-5 w-fit space-y-1 text-xs text-muted-foreground">
          <li>✦ Save your score &amp; XP</li>
          <li>✦ Keep your streaks</li>
          <li>✦ Appear on leaderboards</li>
          <li>✦ Unlock more quiz features later</li>
        </ul>

        {/* Stats row */}
        {(xp > 0 || streak > 0 || rankName) && (
          <div className="flex justify-center gap-4 mb-5">
            {xp > 0 && (
              <div className="flex flex-col items-center">
                <span className="inline-flex items-center gap-1 text-lg font-bold text-[#f0d78c]">
                  <Sparkles className="h-4 w-4" />{xp}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">XP earned</span>
              </div>
            )}
            {streak > 0 && (
              <div className="flex flex-col items-center">
                <span className="inline-flex items-center gap-1 text-lg font-bold text-orange-300">
                  <Flame className="h-4 w-4" />{streak}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">streak</span>
              </div>
            )}
            {rankName && (
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold text-[#f5e9c8]">{rankName}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">rank</span>
              </div>
            )}
          </div>
        )}

        <Button
          className="w-full mb-2 bg-gradient-to-r from-[#c9a84c] to-[#a8862f] font-bold text-[#1a1530] hover:from-[#d4b35c] hover:to-[#b8923f]"
          onClick={() => navigate(`/auth?mode=signup&returnTo=${encodeURIComponent(returnTo)}`)}
        >
          Create Account
        </Button>
        {onDismiss && (
          <Button
            variant="outline"
            className="w-full mb-2 text-sm"
            onClick={onDismiss}
          >
            Keep Playing as Guest
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full text-sm text-muted-foreground"
          onClick={() => navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}`)}
        >
          Already have an account? Sign in
        </Button>
      </motion.div>
    </motion.div>
  );
}
