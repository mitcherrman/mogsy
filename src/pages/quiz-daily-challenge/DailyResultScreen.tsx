/**
 * The finished day (DC1 Phase 5).
 *
 * The question it answers is HOW WELL DID I DO TODAY — never "you got them all
 * right eventually", which is true of every completed run by design and
 * therefore says nothing. So the grade and the first-attempt figures lead, and
 * the fact that every card ended solved is left implicit.
 *
 * Every number is READ from the backend's `result` and `summary`. Nothing is
 * recomputed here — a grade the player was shown this morning must not move
 * because a threshold was retuned this afternoon, and the only way to
 * guarantee that on the client is to never derive it.
 */

import { Link } from "react-router-dom";
import { Award, Flame, Sparkles, Target, Timer, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DcResult, DcSummary } from "@/lib/daily-challenge/contracts";

const GRADE_TONE: Record<string, string> = {
  S: "from-amber-300 to-amber-500 text-amber-950",
  A: "from-emerald-300 to-emerald-500 text-emerald-950",
  B: "from-sky-300 to-sky-500 text-sky-950",
  C: "from-slate-300 to-slate-400 text-slate-900",
  D: "from-stone-400 to-stone-500 text-stone-900",
};

function Stat({
  label, value, hint, testId, Icon,
}: {
  label: string; value: string; hint?: string; testId: string; Icon: typeof Target;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase
                    tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
        {label}
      </p>
      <p data-testid={testId} className="mt-1 text-lg font-bold tabular-nums leading-none">
        {value}
      </p>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function DailyResultScreen({
  result, summary, score, maxScore, challengeDate, homeHref = "/quiz",
}: {
  result: DcResult;
  summary: DcSummary;
  score: number;
  maxScore: number;
  challengeDate: string;
  homeHref?: string;
}) {
  const { rewards } = result;
  const accuracy = summary.firstAttemptAccuracyBp === null
    ? "—" : `${(summary.firstAttemptAccuracyBp / 100).toFixed(0)}%`;

  return (
    <section
      aria-label="Daily Challenge result"
      data-testid="dc-result"
      className="ranked-panel ranked-folio mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-6"
    >
      <header className="flex items-center gap-4">
        <div
          data-testid="dc-result-grade"
          data-grade={result.grade ?? "none"}
          aria-label={`Grade ${result.grade ?? "unavailable"}`}
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-lg
                      bg-gradient-to-br text-3xl font-black shadow-lg ${
            GRADE_TONE[result.grade ?? "D"] ?? GRADE_TONE.D}`}
        >
          {result.grade ?? "—"}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Daily Challenge · <time dateTime={challengeDate}>{challengeDate}</time>
          </p>
          <h1 className="text-xl font-bold leading-tight">Challenge complete</h1>
          <p data-testid="dc-result-score" className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">
              {score} / {maxScore}
            </span>
            {" · "}
            <span data-testid="dc-result-percent" className="tabular-nums">
              {result.scorePercent}%
            </span>
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          label="First try"
          value={`${summary.firstAttemptCorrectCount}/${summary.cardCount}`}
          hint={`${summary.firstAttemptMissCount} missed for score`}
          testId="dc-result-first-try"
          Icon={Target}
        />
        <Stat label="Accuracy" value={accuracy} testId="dc-result-accuracy" Icon={Sparkles} />
        {summary.reflexCardCount > 0 && (
          <Stat
            label="Meta Reflex"
            value={`${summary.reflexFirstAttemptCorrect}/${summary.reflexCardCount}`}
            hint={summary.perfectReflexBlocks > 0 ? "Perfect block" : undefined}
            testId="dc-result-reflex"
            Icon={Zap}
          />
        )}
        {summary.timeoutCount > 0 && (
          <Stat
            label="Timed out"
            value={String(summary.timeoutCount)}
            testId="dc-result-timeouts"
            Icon={Timer}
          />
        )}
      </div>

      {summary.perfectReflexBlocks > 0 && (
        <p
          data-testid="dc-result-perfect-reflex"
          className="flex items-center gap-1.5 rounded-md border border-amber-400/30
                     bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200"
        >
          <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Perfect Meta Reflex block — every card on the first try.
        </p>
      )}

      <div className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase
                      tracking-wider text-muted-foreground">
          <Award className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
          Rewards
        </p>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">XP from answers</dt>
            <dd data-testid="dc-result-xp-answers" className="font-medium tabular-nums">
              {rewards.xpFromAnswers}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Completion bonus</dt>
            <dd data-testid="dc-result-xp-bonus" className="font-medium tabular-nums">
              {rewards.completionBonusXp}
            </dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-white/10 pt-1">
            <dt className="font-semibold">Total XP</dt>
            <dd data-testid="dc-result-xp-total" className="font-bold tabular-nums">
              {rewards.totalXp}
            </dd>
          </div>
        </dl>
        <p
          data-testid="dc-result-streak"
          className="flex items-center gap-1.5 border-t border-white/10 pt-2 text-xs"
        >
          <Flame className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden="true" />
          <span className="font-semibold tabular-nums">
            {rewards.streakAfter === 1 ? "1 day" : `${rewards.streakAfter} days`}
          </span>
          <span className="text-muted-foreground">daily streak</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to={homeHref} data-testid="dc-result-home">Back to Leaguecraft</Link>
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        A new challenge is composed each day. Come back tomorrow.
      </p>
    </section>
  );
}
