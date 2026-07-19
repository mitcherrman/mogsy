/**
 * Completion summary (G5.2B). The correct-count is presentation over the
 * accumulated authoritative reveal results — NOT canonical scoring. Focus moves
 * to the heading on mount.
 */
import { useEffect, useRef } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MasteryStateView } from "../contracts/stateView";
import type { MasteryResultRow } from "./useMasteryFixtureSession";
import { MasteryStatePanel } from "./MasteryStatePanel";

/** Steps eligible for future standalone Ranked capsules per the audited artifact. */
const RANKED_ELIGIBLE_COUNT = 4;

export function MasteryCompletion({
  results,
  finalState,
  onRestart,
}: {
  results: readonly MasteryResultRow[];
  finalState: MasteryStateView | null;
  onRestart: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const correctCount = results.filter((r) => r.correct).length;

  return (
    <section aria-label="Mastery Set complete" className="space-y-4">
      <h2
        ref={headingRef}
        tabIndex={-1}
        data-testid="mastery-completion-heading"
        className="text-lg font-bold outline-none"
      >
        Mastery Set complete
      </h2>

      <p data-testid="mastery-correct-count" className="text-sm">
        You answered <strong>{correctCount}</strong> of <strong>{results.length}</strong> questions
        correctly.
      </p>

      <ol className="space-y-1.5" data-testid="mastery-summary-list">
        {results.map((r) => (
          <li key={r.sequenceIndex} className="flex items-start gap-2 text-sm">
            {r.correct ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            )}
            <span>
              <span className="sr-only">{r.correct ? "Correct. " : "Incorrect. "}</span>
              Q{r.sequenceIndex + 1}: your answer {String(r.playerAnswer)}
            </span>
          </li>
        ))}
      </ol>

      {finalState && <MasteryStatePanel state={finalState} heading="Final state" />}

      <p className="text-xs text-muted-foreground">
        {RANKED_ELIGIBLE_COUNT} of these questions are eligible for future standalone Ranked use.
      </p>

      <Button onClick={onRestart} variant="outline" data-testid="mastery-restart-button">
        Restart the Mastery Set
      </Button>
    </section>
  );
}
