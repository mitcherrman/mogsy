/**
 * Comparative (champion-vs-champion) reveal screen (Phase 4C2).
 *
 * The two-champion / non-combat sibling of `player/MasteryRevealView` and
 * `AtomicRecallRevealView`. Correctness comes ONLY from
 * `reveal.authoritativeCorrectness` — never computed here. The winning side
 * is read from `reveal.correctAnswer`/`correctAnswerDisplay`, which the
 * backend states verbatim (one of the two champion ids, or the composer's own
 * tie token) — never re-derived from a value comparison in this file. The
 * authoritative per-side values and delta are backend prose carried in
 * `reveal.explanation`, the same field and the same pass-through discipline
 * `AtomicRecallRevealView` already uses (e.g. "Ahri E: 12.0s. Syndra E:
 * 15.0s. Ahri wins by 3.0s."). There is no before/after champion-state panel
 * for this interaction kind — a matchup candidate models no combat state.
 */
import { useEffect, useRef } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MasteryPlayerQuestion } from "../contracts/playerQuestion";
import type { MasteryPlayerReveal } from "../contracts/playerReveal";
import type { PlayerAnswer } from "../player/useMasteryFixtureSession";
import { COMPARISON_TIE_TOKEN, MasteryComparisonContractError } from "./ComparisonQuestionView";

/**
 * Maps a raw wire answer value (a champion id, or the tie token) back to a
 * player-facing label using ONLY the question's own answer_options position
 * and comparisonSemantics display names — never a second champion lookup.
 */
function labelForAnswer(question: MasteryPlayerQuestion, raw: string): string {
  if (!question.comparisonSemantics) {
    throw new MasteryComparisonContractError(
      "comparison_left_right reveal is missing comparison_semantics on its question",
    );
  }
  const [championAValue, championBValue] = question.answerOptions;
  if (raw === COMPARISON_TIE_TOKEN) return "Tie / Same";
  if (raw === championAValue) return question.comparisonSemantics.championADisplay;
  if (raw === championBValue) return question.comparisonSemantics.championBDisplay;
  return raw;
}

function formatAnswer(question: MasteryPlayerQuestion, value: PlayerAnswer | string | number | boolean): string {
  return labelForAnswer(question, String(value));
}

export function ComparisonRevealView({
  question,
  reveal,
  submittedAnswer,
  isFinal,
  onNext,
}: {
  question: MasteryPlayerQuestion;
  reveal: MasteryPlayerReveal;
  submittedAnswer: PlayerAnswer | null;
  isFinal: boolean;
  onNext: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [reveal.sequenceIndex]);

  const correct = reveal.authoritativeCorrectness;
  const playerAnswer = submittedAnswer ?? reveal.playerAnswer;

  return (
    <section aria-label="Result" className="space-y-4" data-testid="mastery-comparison-reveal">
      <h2
        ref={headingRef}
        tabIndex={-1}
        data-testid="mastery-reveal-heading"
        className="text-base font-semibold outline-none"
      >
        Result
      </h2>

      <div
        role="status"
        aria-live="polite"
        data-testid="mastery-correctness"
        data-correct={correct ? "true" : "false"}
        className={`flex items-center gap-2 rounded-lg border p-3 ${
          correct
            ? "border-emerald-600/30 bg-emerald-500/10"
            : "border-destructive/30 bg-destructive/10"
        }`}
      >
        {correct ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        ) : (
          <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
        )}
        <span className="font-semibold">{correct ? "Correct" : "Incorrect"}</span>
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="font-medium">Your answer:</dt>
          <dd>{formatAnswer(question, playerAnswer)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Correct answer:</dt>
          <dd data-testid="mastery-correct-answer">
            {/* Winner/tie stated verbatim by the backend — never re-derived
                from comparing values here. */}
            {reveal.correctAnswerDisplay ?? formatAnswer(question, reveal.correctAnswer)}
          </dd>
        </div>
      </dl>

      {/* Authoritative per-side values and delta, straight from the backend
          payload — no client-side recomputation of either value. */}
      <p data-testid="mastery-explanation" className="text-sm">
        {reveal.explanation}
      </p>

      <Button onClick={onNext} data-testid="mastery-next-button" className="w-full sm:w-auto">
        {isFinal ? "View results" : "Next question"}
      </Button>
    </section>
  );
}
