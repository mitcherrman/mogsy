/**
 * The concise factual reveal that sits BELOW the answer choices.
 *
 * It never replaces the question and never takes the screen over: the prompt
 * and the (now locked, now coloured) choices stay exactly where they were, and
 * this adds one short line of backend-authored fact underneath them. The green
 * and red live on the choices themselves — a giant "Correct!" banner would say
 * nothing the outlines have not already said, and would push the question out
 * of view on a phone.
 *
 * Every value here is passed through verbatim from the server payload. Nothing
 * is re-rounded, re-derived, re-compared or re-graded: a comparison's two
 * underlying values arrive as the backend's own frozen explanation prose, and
 * a rounded numeric question's precise canonical value arrives as the
 * backend's own explanation under the existing Mastery numeric policy. Where
 * the payload states no such detail, none is shown — never invented.
 */
export function MasteryInlineReveal({
  correct,
  answerLabel,
  explanation,
}: {
  /** Server-authoritative correctness. Never computed here. */
  readonly correct: boolean;
  /** The correct answer, already formatted by the backend. */
  readonly answerLabel: string | null;
  /** The backend's concise explanation, if the payload carries one. */
  readonly explanation: string | null;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="mastery-inline-reveal"
      data-correct={correct ? "true" : "false"}
      className="space-y-1 rounded-md border-l-2 border-l-muted-foreground/30 bg-muted/40 px-3 py-2 text-sm"
    >
      {answerLabel !== null && (
        <p>
          <span className="font-medium">
            {correct ? "Correct" : "Answer"}:{" "}
          </span>
          <span data-testid="mastery-reveal-answer" className="tabular-nums">
            {answerLabel}
          </span>
        </p>
      )}
      {explanation && (
        <p data-testid="mastery-reveal-explanation" className="text-muted-foreground">
          {explanation}
        </p>
      )}
    </div>
  );
}
