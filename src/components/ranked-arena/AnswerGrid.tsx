/**
 * Canonical arena answer grid (F1 Phase B): a thin controlled wrapper around
 * the production quiz grid (QuizAnswerOptions), which is already the mature,
 * reveal-safe answer surface. QuizAnswerOptions is reused UNCHANGED.
 *
 * Contract mapping:
 * - options come from QuestionView (stable ids = backend option indexes);
 * - selection is controlled by id and gated by InteractionPermissions
 *   (canSelectAnswer / canChangeAnswer) — no mode flags;
 * - pre-reveal there is NO correctness anywhere in props or DOM; reveal is
 *   opt-in via revealedCorrectOptionId, which controllers may only obtain
 *   from a resolved round;
 * - a disabled (locked) but unrevealed grid is achieved with a disabled
 *   fieldset so no reveal styling is implied.
 */
import QuizAnswerOptions from "@/components/quiz/QuizAnswerOptions";
import {
  AnswerOptionView,
  InteractionPermissions,
} from "@/lib/ranked-core/viewTypes";

export interface AnswerGridProps {
  options: AnswerOptionView[];
  selectedOptionId: string | null;
  permissions: InteractionPermissions;
  onSelectOption: (option: AnswerOptionView) => void;
  /**
   * Post-reveal only: the correct option's id from a resolved round. Never
   * pass this before the backend has revealed the round.
   */
  revealedCorrectOptionId?: string | null;
}

export function AnswerGrid({
  options,
  selectedOptionId,
  permissions,
  onSelectOption,
  revealedCorrectOptionId = null,
}: AnswerGridProps) {
  const selected = options.find((o) => o.id === selectedOptionId) ?? null;
  const revealed = options.find((o) => o.id === revealedCorrectOptionId) ?? null;
  const canPick =
    selectedOptionId === null ? permissions.canSelectAnswer : permissions.canChangeAnswer;
  const interactive = canPick && revealed === null;

  const handleSelect = (label: string) => {
    if (!interactive) return;
    const option = options.find((o) => o.label === label);
    if (option) onSelectOption(option);
  };

  return (
    <fieldset
      disabled={!interactive}
      data-testid="answer-grid"
      data-answers-state={revealed ? "revealed" : interactive ? "open" : "locked"}
      className="m-0 border-0 p-0"
    >
      <QuizAnswerOptions
        choices={options.map((o) => o.label)}
        selectedAnswer={selected?.label ?? null}
        answerResult={revealed ? { correct_answer: revealed.label } : null}
        onSelect={handleSelect}
      />
    </fieldset>
  );
}
