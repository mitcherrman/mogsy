/**
 * Comparative (champion-vs-champion) question screen (Phase 4C2).
 *
 * The two-champion / non-combat sibling of `player/MasteryQuestionView` and
 * `AtomicRecallQuestionView`. Renders `question.comparisonSemantics` into
 * player-facing text (never `question.prompt`), shows both champions with no
 * combat-state panel (there is no `state`/`matchupIdentity` for this
 * interaction kind — a matchup candidate is stateless), and reuses the
 * existing `MasteryChoiceInput` + submit flow unchanged.
 *
 * The backend answer domain for a comparison is ALWAYS exactly three options
 * — champion A, champion B, and the composer's own tie token — regardless of
 * whether this particular comparison happens to be decisive or a true tie
 * (`mastery.manifest_session.adapter._answer_and_options`). So a Tie/Same
 * choice is offered unconditionally here; nothing about whether THIS
 * comparison is a tie is visible before submission, and nothing needs to be
 * inferred from rounded values to decide whether to show it.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MasteryPlayerQuestion } from "../contracts/playerQuestion";
import type { PlayerAnswer } from "../player/useMasteryFixtureSession";
import { MasteryChoiceInput, type ChoiceOption } from "../player/MasteryBooleanInput";
import { MasteryChampionPortrait } from "../player/MasteryChampionPortrait";
import { MasteryPatchBadge } from "../player/MasteryPatchBadge";
import { MasteryProgress } from "../player/MasteryProgress";
import { formatComparisonPrompt } from "./formatComparisonSemantics";

export class MasteryComparisonContractError extends Error {
  constructor(message: string) {
    super(`Mastery comparison: ${message}`);
    this.name = "MasteryComparisonContractError";
  }
}

/** The composer's own tie token (`mastery.matchup.contract.TieState.TIE.value`). */
export const COMPARISON_TIE_TOKEN = "tie";

export function ComparisonQuestionView({
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
  if (!question.comparisonSemantics) {
    throw new MasteryComparisonContractError(
      "comparison_left_right question is missing comparison_semantics",
    );
  }
  // A comparison is always presented as a 3-way single choice (A / B / tie) —
  // see the module docstring. A different answer_type means the payload does
  // not actually match this interaction kind's contract.
  if (question.answerType !== "single_choice") {
    throw new MasteryComparisonContractError(
      `unsupported answer_type "${question.answerType}" for comparison_left_right (single_choice only)`,
    );
  }
  const options = question.answerOptions;
  if (options.length !== 3 || options[2] !== COMPARISON_TIE_TOKEN) {
    throw new MasteryComparisonContractError(
      `comparison_left_right requires exactly [champion_a, champion_b, "${COMPARISON_TIE_TOKEN}"] answer_options`,
    );
  }

  const cs = question.comparisonSemantics;
  const [championAValue, championBValue, tieValue] = options;

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [question.sequenceIndex]);

  const [choice, setChoice] = useState<string | null>(null);
  const prompt = formatComparisonPrompt(cs);

  // Buttons show champion NAMES, never the raw option values (which are
  // champion ids / the tie token) — matching the task's display convention.
  const choiceOptions: ChoiceOption[] = [
    { value: championAValue, label: cs.championADisplay },
    { value: championBValue, label: cs.championBDisplay },
    { value: tieValue, label: "Tie / Same" },
  ];

  const canSubmit = !submitting && choice !== null;
  const doSubmit = () => {
    if (!canSubmit || choice === null) return;
    onSubmit(choice);
  };

  return (
    <section aria-label="Question" className="space-y-4" data-testid="mastery-comparison-question">
      <div className="space-y-3">
        <MasteryProgress index={question.sequenceIndex} total={total} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2" data-testid="mastery-comparison-header">
            <MasteryChampionPortrait
              championId={cs.championADisplay.toLowerCase()}
              displayName={cs.championADisplay}
              size={32}
            />
            <span className="text-sm font-semibold">
              {cs.championADisplay} vs {cs.championBDisplay}
            </span>
            <MasteryChampionPortrait
              championId={cs.championBDisplay.toLowerCase()}
              displayName={cs.championBDisplay}
              size={32}
            />
          </div>
          <div className="flex items-center gap-2">
            <MasteryPatchBadge patchDisplay={question.patchDisplay} />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Comparison
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

      <MasteryChoiceInput
        options={choiceOptions}
        value={choice}
        onSelect={setChoice}
        disabled={submitting}
        ariaLabel="Comparison choices"
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
