/**
 * RFX1 Phase 2B3 visual implementation — THE FINAL ROUND BEAT.
 *
 * A MEDIUM beat: a compact academy plate over a dimmed arena, deliberately
 * short of the intro's and the outro's fuller composition. No mascots — that
 * is the rule that separates the two intensities without any other cue.
 *
 * WHAT IT REPLACES. The 2B3 placeholder was a 167x67 px `bg-card/90` box in
 * `font-mono`, centred over the answer tablets with no scrim behind it: at
 * 1440x900 it occupied 0.86% of the viewport and read as a developer tooltip.
 * The plate below is ~4x the area, carries a scrim, and sits ABOVE the
 * tablets rather than on them.
 *
 * THE SCORE IS THE POINT. `FINAL ROUND` alone is a fact the round timeline
 * already shows; `FINAL ROUND / 24 - 22` is a situation. Both numbers are the
 * arena's own settled cumulative totals, passed in — this component computes
 * nothing, compares nothing and never decides who is ahead.
 *
 * It is OMITTED, not zeroed, when the match has no score to show: an hp match
 * carries no score on its combatants at all, and printing `0 - 0` there would
 * be an invented fact. The plate then carries the title alone.
 *
 * NOTHING HERE HOLDS ANYTHING. The beat's duration, its replay protection and
 * its substitution for the ordinary module title all live in
 * `useSpecialTransition` and `QuizRankedMatch`. This draws.
 */
export interface RankedFinalRoundWarningProps {
  /** The beat's identity, for the React key and for measurement. */
  id: string;
  /** Its configured visible duration, published for tests and the browser. */
  visibleMs: number;
  /** The viewer's settled cumulative score, or null on a match without one. */
  viewerScore?: number | null;
  opponentScore?: number | null;
  /** OS `prefers-reduced-motion` or Settings -> Reduce Motion. */
  reducedMotion?: boolean;
}

export function RankedFinalRoundWarning({
  id, visibleMs, viewerScore = null, opponentScore = null, reducedMotion = false,
}: RankedFinalRoundWarningProps) {
  const hasScore = typeof viewerScore === "number" && typeof opponentScore === "number";
  return (
    <section
      data-testid="ranked-final-round-warning"
      data-warning-id={id}
      data-warning-ms={String(visibleMs)}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      aria-live="polite"
      className="ranked-beat ranked-beat--medium ranked-final-round">
      <span aria-hidden className="ranked-beat__scrim" />
      {/* The plate: a straight-sided crop of the navy banner cloth the arena
          rails already draw, with the gold hairline top and bottom. No corner
          radius — the cloth's own silhouette is straight through this band,
          and a rounded card would read as another panel. */}
      <div className="ranked-final-round__plate">
        <span aria-hidden className="ranked-beat__rule ranked-beat__rule--top" />
        <p className="ranked-title ranked-beat__title ranked-final-round__title">
          Final Round
        </p>
        {hasScore && (
          <p className="ranked-final-round__score" data-testid="final-round-score">
            <span data-testid="final-round-score-viewer">{viewerScore}</span>
            <span aria-hidden className="ranked-beat__dash">&mdash;</span>
            <span data-testid="final-round-score-opponent">{opponentScore}</span>
          </p>
        )}
        <span aria-hidden className="ranked-beat__rule ranked-beat__rule--bottom" />
      </div>
    </section>
  );
}
