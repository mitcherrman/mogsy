import { motion } from "framer-motion";
import { CalendarDays, Flame, Sparkles, Check, ArrowRight, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { DailyChallengeState } from "@/lib/quiz/featured-mock";

/**
 * Featured Daily Challenge hero card. Sits directly under the page header and
 * acts as the primary CTA on the Quiz page.
 */
export default function QuizDailyChallengeCard({
  state,
  onPlay,
  disabled,
}: {
  state: DailyChallengeState;
  onPlay: () => void;
  disabled?: boolean;
}) {
  const pct = Math.round((state.answered / Math.max(1, state.target)) * 100);
  const completed = state.completed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card
        className="relative overflow-hidden border-[#c9a84c]/40 bg-gradient-to-br from-[#1a1530]/90 via-[#0a1428]/90 to-[#0a0a1a]/90 backdrop-blur-sm"
        style={{
          boxShadow:
            "0 0 0 1px rgba(201,168,76,0.18) inset, 0 0 28px rgba(80,170,220,0.20), 0 8px 28px rgba(0,0,0,0.55)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a84c] to-transparent opacity-80"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 80% 0%, rgba(80,170,220,0.10) 0%, transparent 60%)",
          }}
        />
        <CardContent className="relative p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#c9a84c]/50 bg-[#c9a84c]/15 shadow-[inset_0_0_10px_rgba(201,168,76,0.25)]">
                <CalendarDays className="h-5 w-5 text-[#f0d78c]" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c9a84c]/80">
                  Featured · Today's Objective
                </div>
                <h3 className="truncate text-lg font-bold tracking-tight text-[#f5e9c8]">
                  Daily Challenge
                </h3>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge
                variant="outline"
                className="border-orange-400/60 bg-orange-400/15 px-2 py-0.5 text-[11px] font-bold text-orange-200 shadow-[0_0_10px_-2px_rgba(251,146,60,0.4)]"
              >
                <Flame className="mr-1 h-3.5 w-3.5" />
                {state.dailyStreak}d streak
              </Badge>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                {state.dailyStreak > 0 ? "Keep it alive" : "Start a streak"}
              </span>
            </div>
          </div>

          {/* Today's Theme */}
          <div className="mt-3 rounded-md border border-[#c9a84c]/30 bg-[#c9a84c]/5 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#c9a84c]/90">
              <Target className="h-3 w-3" />
              Today's Theme
            </div>
            <div className="mt-0.5 text-sm font-bold text-[#f5e9c8]">{state.themeTitle}</div>
            <p className="text-[11px] leading-snug text-muted-foreground">{state.themeBlurb}</p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Remaining" value={`${state.remaining}/${state.target}`} />
            <Stat
              label="XP Reward"
              value={
                <span className="inline-flex items-center gap-1 text-base font-extrabold text-[#f0d78c]">
                  <Sparkles className="h-3.5 w-3.5" />+{state.xpBonus}
                </span>
              }
            />
            <Stat
              label="Status"
              value={
                completed ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <Check className="h-3 w-3" />
                    Done
                  </span>
                ) : (
                  "In progress"
                )
              }
            />
          </div>

          <div className="mt-3 space-y-1">
            <Progress value={pct} className="h-2" />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{state.answered} answered today</span>
              <span className="font-mono">{pct}%</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-snug text-muted-foreground">
              {completed
                ? "Daily complete — come back tomorrow to extend your streak."
                : `Answer ${state.remaining} more question${state.remaining === 1 ? "" : "s"} to claim today's XP bonus.`}
            </p>
            <Button
              size="sm"
              onClick={onPlay}
              disabled={disabled || completed}
              className="shrink-0 bg-gradient-to-r from-[#c9a84c] to-[#a8862f] font-bold text-[#1a1530] hover:from-[#d4b35c] hover:to-[#b8923f]"
            >
              {completed ? "Completed" : "Play Now"}
              {!completed && <ArrowRight className="ml-1 h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[#c9a84c]/20 bg-background/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold leading-none">{value}</div>
    </div>
  );
}