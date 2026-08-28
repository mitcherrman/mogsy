/**
 * Atomic recall question screen (Phase 4C1).
 *
 * The one-champion / non-combat sibling of `player/MasteryQuestionView`.
 * Renders `question.promptSemantics` into player-facing text (never
 * `question.prompt`), shows ONLY `championA` (no fake opponent panel — there
 * is no `championB`, no `state`, no `matchupIdentity` for this interaction
 * kind), and reuses the existing numeric input + submit flow unchanged.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MasteryPlayerQuestion } from "../contracts/playerQuestion";
import type { PlayerAnswer } from "../player/useMasteryFixtureSession";
import { MasteryNumericInput, validateNumeric } from "../player/MasteryNumericInput";
import { MasteryChampionPortrait } from "../player/MasteryChampionPortrait";
import { MasteryPatchBadge } from "../player/MasteryPatchBadge";
import { MasteryProgress } from "../player/MasteryProgress";
import { formatRecallPrompt } from "./formatPromptSemantics";

export class MasteryAtomicRecallContractError extends Error {
  constructor(message: string) {
    super(`Mastery atomic recall: ${message}`);
    this.name = "MasteryAtomicRecallContractError";
  }
}

export function AtomicRecallQuestionView({
  question,
  total,
  submitting,
  onSubmit,
}: {
  question: MasteryPlayerQuestion;
  total: number;
  submitting: boolean;
  onSubmit: (answer: PlayerAnswer) => void;
}) {
  if (!question.promptSemantics) {
    throw new MasteryAtomicRecallContractError("atomic_recall question is missing prompt_semantics");
  }
  // This slice's atomic recall candidates are all numeric (cooldown/cost/stat
  // recall). A future non-numeric atomic-recall question needs its own
  // renderer branch, not a silent fallback here.
  if (question.answerType !== "numeric" || !question.inputConstraints) {
    throw new MasteryAtomicRecallContractError(
      `unsupported answer_type "${question.answerType}" for atomic_recall (numeric only in this slice)`,
    );
  }

  const ps = question.promptSemantics;
  const constraints = question.inputConstraints;

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [question.sequenceIndex]);

  const [numeric, setNumeric] = useState("");
  const prompt = formatRecallPrompt(ps);

  const canSubmit = !submitting && validateNumeric(numeric, constraints).valid;
  const doSubmit = () => {
    if (submitting) return;
    const v = validateNumeric(numeric, constraints);
    if (v.valid && v.value !== null) onSubmit(v.value);
  };

  return (
    <section aria-label="Question" className="space-y-4" data-testid="mastery-atomic-recall-question">
      <div className="space-y-3">
        <MasteryProgress index={question.sequenceIndex} total={total} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2" data-testid="mastery-recall-champion-header">
            <MasteryChampionPortrait
              championId={ps.championDisplay.toLowerCase()}
              displayName={ps.championDisplay}
              size={32}
            />
            <span className="text-sm font-semibold">{ps.championDisplay}</span>
          </div>
          <div className="flex items-center gap-2">
            <MasteryPatchBadge patchDisplay={question.patchDisplay} />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Recall
            </span>
          </div>
        </div>
      </div>

      <h2
        ref={headingRef}
        tabIndex={-1}
        data-testid="mastery-question-heading"
        className="text-base font-semibold leading-snug outline-none"
      >
        {prompt}
      </h2>

      <MasteryNumericInput
        constraints={constraints}
        value={numeric}
        onValueChange={setNumeric}
        onSubmitRequested={doSubmit}
        disabled={submitting}
      />

      {question.hintAvailable && (
        <p className="text-xs text-muted-foreground">A hint is available for this question.</p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={doSubmit} disabled={!canSubmit} data-testid="mastery-submit-button">
          Submit answer
        </Button>
        {submitting && (
          <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
            Submitting your answer…
          </span>
        )}
      </div>
    </section>
  );
}
