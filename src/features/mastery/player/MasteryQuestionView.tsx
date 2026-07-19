/**
 * Question screen (G5.2B). Renders ONLY the parsed player-question payload — no
 * reveal data is available in this render path. Collects a local, non-canonical
 * answer and hands it to the session on submit. Focus moves to the question
 * heading on mount (i.e. after each advance).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MasteryPlayerQuestion } from "../contracts/playerQuestion";
import type { PlayerAnswer } from "./useMasteryFixtureSession";
import { MasteryNumericInput, validateNumeric } from "./MasteryNumericInput";
import { MasteryChoiceInput, booleanOptions, type ChoiceOption } from "./MasteryBooleanInput";
import { MasteryChampionPortrait } from "./MasteryChampionPortrait";
import { MasteryPatchBadge } from "./MasteryPatchBadge";
import { MasteryProgress } from "./MasteryProgress";
import { MasteryStatePanel } from "./MasteryStatePanel";
import { championName } from "./playerFormat";

export function MasteryQuestionView({
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [question.sequenceIndex]);

  const [numeric, setNumeric] = useState("");
  const [choice, setChoice] = useState<string | null>(null);

  const choiceOptions: ChoiceOption[] = useMemo(() => {
    if (question.answerType === "boolean") return booleanOptions(question.answerOptions);
    if (question.answerType === "single_choice") {
      return question.answerOptions.map((label) => ({ value: label, label }));
    }
    return [];
  }, [question]);

  const canSubmit = (() => {
    if (submitting) return false;
    if (question.answerType === "numeric") {
      return question.inputConstraints ? validateNumeric(numeric, question.inputConstraints).valid : false;
    }
    return choice !== null;
  })();

  const doSubmit = () => {
    if (!canSubmit) return;
    if (question.answerType === "numeric" && question.inputConstraints) {
      const v = validateNumeric(numeric, question.inputConstraints);
      if (v.valid && v.value !== null) onSubmit(v.value);
    } else if (question.answerType === "boolean") {
      onSubmit(choice === "true");
    } else if (choice !== null) {
      onSubmit(choice);
    }
  };

  return (
    <section aria-label="Question" className="space-y-4">
      <div className="space-y-3">
        <MasteryProgress index={question.sequenceIndex} total={total} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2" data-testid="mastery-matchup-header">
            <MasteryChampionPortrait
              championId={question.matchupIdentity.championA}
              size={32}
            />
            <span className="text-sm font-semibold">
              {championName(question.matchupIdentity.championA)} vs{" "}
              {championName(question.matchupIdentity.championB)}
            </span>
            <MasteryChampionPortrait
              championId={question.matchupIdentity.championB}
              size={32}
            />
          </div>
          <div className="flex items-center gap-2">
            <MasteryPatchBadge patchDisplay={question.patchDisplay} />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Fixed scenario
            </span>
          </div>
        </div>
      </div>

      <MasteryStatePanel state={question.state} heading="Current state" />

      <h2
        ref={headingRef}
        tabIndex={-1}
        data-testid="mastery-question-heading"
        className="text-base font-semibold leading-snug outline-none"
      >
        {question.prompt}
      </h2>

      <div>
        {question.answerType === "numeric" && question.inputConstraints && (
          <MasteryNumericInput
            constraints={question.inputConstraints}
            value={numeric}
            onValueChange={setNumeric}
            onSubmitRequested={doSubmit}
            disabled={submitting}
          />
        )}
        {(question.answerType === "boolean" || question.answerType === "single_choice") && (
          <MasteryChoiceInput
            options={choiceOptions}
            value={choice}
            onSelect={setChoice}
            disabled={submitting}
            ariaLabel="Answer choices"
          />
        )}
      </div>

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
