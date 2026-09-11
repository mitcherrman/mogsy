/**
 * RP1 Step 4 — HOW THE MATCH FINISHED, in one line.
 *
 * A ten-module match ends on a scoreline, so the terminal frame states it the
 * way a scoreboard does: two names, two numbers, and the result word already
 * shouted above it by `MatchOverFrame`. Everything here is read from the
 * backend's own result row — `scoring.final_scores` for the numbers, `outcome`
 * for the word — and nothing is summed, compared or replayed from the match
 * this client just watched.
 *
 * It lives in Ranked's page directory and reaches the frame through the
 * `scoreline` SLOT, so no Ranked vocabulary ("rating", "modules") enters the
 * shared arena.
 */
import type { MatchResult } from "@/components/ranked-arena/MatchOverFrame";

export interface RankedScorelineProps {
  /** The viewer's final score, from `result.scoring.final_scores`. */
  you: number;
  /** The opponent's, from the same map; null when there is no opponent entry. */
  opponent: number | null;
  /** The backend's outcome, for emphasis only — never derived from the two. */
  result: MatchResult;
  /** `modules_played`, or null when the result did not state one. */
  modulesPlayed: number | null;
  /**
   * The viewer's applied rating movement, or null.
   *
   * Null covers three real states and this component distinguishes none of
   * them, because all three mean the same thing on screen: an unrated match, a
   * rating not yet applied, and a backend that did not say. NOTHING is
   * fabricated here — no zero, no "pending", no placeholder row.
   */
  ratingDelta: number | null;
}

/**
 * Does the backend's own outcome disagree with its own scoreline?
 *
 * A DISPLAY ASSERTION and never a decision: the winner is the result row's and
 * stays the result row's whatever this returns. It exists so that two
 * authorities drifting apart is visible in development and caught by a test,
 * rather than becoming a second winner rule living quietly in a component.
 */
export function scorelineDisagreesWithOutcome(
  { you, opponent, result }:
  { you: number; opponent: number | null; result: MatchResult },
): boolean {
  if (opponent === null) return false;
  if (result === "draw") return you !== opponent;
  if (result === "victory") return you <= opponent;
  return you >= opponent;
}

/** One side of the scoreline. */
function Side({ label, score, emphasis }:
{ label: string; score: number | null; emphasis: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span
        data-testid={`final-score-${label.toLowerCase()}`}
        className={`text-5xl font-black leading-none tabular-nums sm:text-6xl ${
          emphasis ? "text-[#f5e6b8]" : "text-slate-300/80"}`}
      >
        {score ?? "—"}
      </span>
    </div>
  );
}

export function RankedScoreline({
  you, opponent, result, modulesPlayed, ratingDelta,
}: RankedScorelineProps) {
  // Emphasis follows the BACKEND's result, not the numbers: a draw emphasises
  // neither, and a decisive match emphasises the side the result row named.
  const youWon = result === "victory";
  const theyWon = result === "defeat";
  const disagrees = scorelineDisagreesWithOutcome({ you, opponent, result });
  return (
    <section aria-label="Final score"
      data-testid="ranked-final-scoreline"
      className="ranked-panel px-4 py-4">
      <div className="flex items-center justify-center gap-3 sm:gap-6">
        <Side label="You" score={you} emphasis={youWon || result === "draw"} />
        <span aria-hidden className="shrink-0 text-2xl font-black text-muted-foreground/50">—</span>
        <Side label="Opponent" score={opponent} emphasis={theyWon || result === "draw"} />
      </div>
      {/* The two quiet facts, on one row, and each present only when the
          backend actually stated it. An unrated match simply has no rating
          chip — it does not have an empty one. */}
      {(ratingDelta !== null || modulesPlayed !== null) && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {ratingDelta !== null && (
            <span data-testid="ranked-rating-delta"
              className={`text-xs font-black uppercase tracking-[0.14em] tabular-nums ${
                ratingDelta > 0 ? "text-emerald-300"
                  : ratingDelta < 0 ? "text-[#e2757b]" : "text-muted-foreground"}`}>
              {ratingDelta > 0 ? `+${ratingDelta}` : `${ratingDelta}`} Rating
            </span>
          )}
          {ratingDelta !== null && modulesPlayed !== null && (
            <span aria-hidden className="text-muted-foreground/40">·</span>
          )}
          {modulesPlayed !== null && (
            <span data-testid="ranked-modules-played"
              className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {modulesPlayed} modules complete
            </span>
          )}
        </div>
      )}
      {/* Development only. Two backend authorities — the outcome and the
          scoreline — describing different matches is a backend defect, and it
          must be LOUD here rather than silently resolved by this component
          preferring one of them. Production renders the result row's word and
          the result row's numbers, exactly as sent. */}
      {disagrees && import.meta.env.DEV && (
        <p data-testid="ranked-scoreline-disagreement"
          className="mt-2 text-center text-[11px] font-bold text-[#e2757b]">
          Contract check: the result says {result} but the scoreline reads {you}
          {" – "}{opponent}. The backend's outcome is authoritative and is what
          is shown.
        </p>
      )}
    </section>
  );
}
