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
 *
 * (A Journey child's structured Combat working is drawn by the Journey stage's
 * own reveal layer — `JourneyStageQuestion` — not here.)
 */
import { VERDICT_HEADLINE, type FeedbackVerdict } from "@/lib/question-feedback/model";
import { VERDICT_TONE } from "@/components/question-feedback/VerdictLine";

export function MasteryInlineReveal({
  correct,
  answerLabel,
  explanation,
  timedOut = false,
}: {
  /** Server-authoritative correctness. Never computed here. */
  readonly correct: boolean;
  /** QRT2 — the server's expiry flag; absent where the wire does not carry it. */
  readonly timedOut?: boolean;
  /** The correct answer, already formatted by the backend. */
  readonly answerLabel: string | null;
  /** The backend's concise explanation, if the payload carries one. */
  readonly explanation: string | null;
}) {
  const verdict: FeedbackVerdict = timedOut ? "timeout" : correct ? "correct" : "incorrect";
  const tone = VERDICT_TONE[verdict];
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="mastery-inline-reveal"
      data-correct={correct ? "true" : "false"}
      className="space-y-1 rounded-md border-l-2 border-l-muted-foreground/30 bg-muted/40 px-3 py-2 text-sm"
    >
      {/* QRT2 — the verdict, in the arena stamp's words and with an icon, on
          the same row as the answer (a phone's card gains no line). The three
          verdicts differ in words AND glyph, never in colour alone. */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span data-testid="mastery-verdict" data-verdict={verdict}
          className={`inline-flex items-center gap-1 font-black uppercase tracking-[0.08em] ${tone.text}`}>
          <tone.Icon aria-hidden className="h-4 w-4 shrink-0" />
          {VERDICT_HEADLINE[verdict]}
        </span>
        {answerLabel !== null && (
          <span>
            <span className="font-medium">Answer: </span>
            <span data-testid="mastery-reveal-answer" className="tabular-nums">
              {answerLabel}
            </span>
          </span>
        )}
      </p>
      {explanation && (
        <p data-testid="mastery-reveal-explanation" className="text-muted-foreground">
          {explanation}
        </p>
      )}
    </div>
  );
}
