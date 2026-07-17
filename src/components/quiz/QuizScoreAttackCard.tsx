/**
 * Quiz-hub entry card for Daily Score Attack. Rendered only when the
 * backend reports the mode enabled; the legacy Daily Challenge card remains
 * the fallback. Pure projection consumer — every value shown comes from the
 * server /today payload; no browser date math, no localStorage authority.
 */

import { Flame, Timer, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { DsaToday } from "@/pages/dev/daily-score-attack/dailyScoreAttackTypes";

type Props = {
  today: DsaToday;
  /** Verified non-anonymous session present. */
  hasAccount: boolean;
  onPlay?: () => void;
};

export default function QuizScoreAttackCard({ today, hasAccount, onPlay }: Props) {
  const official = today.official_run;
  const terminal = official !== null && official.status !== "active";
  const active = official !== null && official.status === "active";
  const streak = today.daily_streak ?? 0;

  let statusLine: string;
  let cta: string;
  if (!hasAccount) {
    statusLine = "Sign in to play the official run — practice is open to everyone.";
    cta = "Play";
  } else if (active) {
    statusLine = "Official run in progress — the timer is still counting.";
    cta = "Resume run";
  } else if (terminal) {
    statusLine = `Today's official score: ${official!.score.toLocaleString()}`;
    cta = "View results & practice";
  } else {
    statusLine = "One official run per day. Make it count.";
    cta = "Play now";
  }

  return (
    <div
      data-testid="hub-score-attack-card"
      className="relative flex flex-col gap-2.5 overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-card to-card p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <Trophy className="h-4 w-4 text-amber-400" aria-hidden />
          Daily Score Attack
        </h3>
        {streak > 0 && (
          <span
            className="flex items-center gap-1 rounded-full border border-orange-500/50 px-2 py-0.5 text-xs font-semibold text-orange-400"
            data-testid="score-attack-streak"
          >
            <Flame className="h-3 w-3" aria-hidden />
            {streak} day{streak === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Timer className="h-3.5 w-3.5" aria-hidden />
        {today.question_count} questions · {today.run_duration_seconds}s global timer ·
        one official run per day (UTC)
      </p>
      <p className="text-sm" data-testid="score-attack-status">
        {statusLine}
      </p>
      {today.legacy_completed_today && !terminal && (
        <p className="text-xs text-muted-foreground" data-testid="score-attack-transition-note">
          You already finished today's Daily Challenge — this run still counts for
          score, but the daily bonus and streak were already earned.
        </p>
      )}
      <Button asChild className="min-h-11 w-full font-semibold" data-testid="score-attack-cta">
        <Link to="/quiz/daily" onClick={onPlay}>
          {cta}
        </Link>
      </Button>
    </div>
  );
}
