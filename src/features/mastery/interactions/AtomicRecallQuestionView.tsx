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
import { MasteryChoiceInput, type ChoiceOption } from "../player/MasteryBooleanInput";
import { MasteryChampionPortrait } from "../player/MasteryChampionPortrait";
import { MasteryPatchBadge } from "../player/MasteryPatchBadge";
import { MasteryProgress } from "../player/MasteryProgress";
import { formatRecallPrompt } from "./formatPromptSemantics";
import { MasteryInlineReveal } from "./MasteryInlineReveal";
import type { MasteryQuestionReveal } from "./revealState";

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
  reveal = null,
}: {
  question: MasteryPlayerQuestion;
  total: number;
  submitting: boolean;
  onSubmit: (answer: PlayerAnswer) => void;
  /**
   * In-place reveal for THIS question, once the server has graded it. The
   * question stays on screen; the input locks, the options take their green /
   * red / muted tones, and the factual line appears beneath them. `null` (the
   * default) is the ordinary answerable state, so every existing caller is
   * unchanged.
   */
  reveal?: MasteryQuestionReveal | null;
}) {
  if (!question.promptSemantics) {
    throw new MasteryAtomicRecallContractError("atomic_recall question is missing prompt_semantics");
  }
  // Generated atomic recall is served as SINGLE CHOICE: the backend
  // (mastery/choices) turns each candidate's canonical value into a clean
  // option label plus plausible same-domain distractors, because typing
  // `57.855000000000004` is a precision puzzle, not a recall question. The
  // free-entry numeric branch is kept for any atomic-recall payload that still
  // arrives that way — neither is a fallback for the other, and any OTHER
  // answer type is still refused rather than rendered blank.
  if (question.answerType !== "numeric" && question.answerType !== "single_choice") {
    throw new MasteryAtomicRecallContractError(
      `unsupported answer_type "${question.answerType}" for atomic_recall`,
    );
  }
  if (question.answerType === "numeric" && !question.inputConstraints) {
    throw new MasteryAtomicRecallContractError(
      "numeric atomic_recall question is missing input_constraints",
    );
  }
  if (question.answerType === "single_choice" && question.answerOptions.length < 2) {
    throw new MasteryAtomicRecallContractError(
      `single_choice atomic_recall needs at least two options, got ${question.answerOptions.length}`,
    );
  }
  // The option labels ARE the wire values here (backend-formatted numbers), so
  // nothing is reformatted, re-rounded, sorted or re-labelled locally — doing
  // any of that would be client-side truth.
  const choiceOptions: ChoiceOption[] =
    question.answerType === "single_choice"
      ? question.answerOptions.map((o) => ({ value: o, label: o }))
      : [];

  const ps = question.promptSemantics;
  const constraints = question.inputConstraints;

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [question.sequenceIndex]);

  const revealing = reveal !== null;
  const [numeric, setNumeric] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const prompt = formatRecallPrompt(ps);

  const isChoice = question.answerType === "single_choice";
  const canSubmit = submitting
    ? false
    : isChoice
      ? choice !== null
      : !!constraints && validateNumeric(numeric, constraints).valid;
  const doSubmit = () => {
    if (submitting) return;
    if (isChoice) {
      if (choice !== null) onSubmit(choice);
      return;
    }
    if (!constraints) return;
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

      {isChoice ? (
        <MasteryChoiceInput
          options={choiceOptions}
          value={choice}
          onSelect={setChoice}
          disabled={submitting}
          reveal={reveal}
          ariaLabel="Answer choices"
        />
      ) : (
        <MasteryNumericInput
          constraints={constraints!}
          value={revealing ? String(reveal.selectedValue ?? numeric) : numeric}
          onValueChange={setNumeric}
          onSubmitRequested={doSubmit}
          disabled={submitting || revealing}
        />
      )}

      {question.hintAvailable && !revealing && (
        <p className="text-xs text-muted-foreground">A hint is available for this question.</p>
      )}

      {revealing ? (
        // The reveal replaces the submit control, not the question: there is
        // no Next button because advancing is automatic.
        <MasteryInlineReveal
          correct={reveal.correct}
          answerLabel={reveal.answerLabel}
          explanation={reveal.explanation}
        />
      ) : (
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
      )}
    </section>
  );
}
