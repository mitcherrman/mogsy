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
 *   fieldset so no reveal styling is implied;
 * - optional canonical option media (RA6) is forwarded POSITIONALLY. It is
 *   backend-resolved from the option text alone and is all-or-nothing per
 *   question, so it carries no correctness and needs no gating here.
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
  /** Compact surfaces opt into a 2-up desktop grid when labels allow it. */
  wideTwoColumn?: boolean;
  /**
   * RG3 — options the player struck out on THIS still-unresolved card (the
   * Daily Challenge retry mechanic). Ids, matching `options[].id`.
   *
   * Pre-reveal by nature and safe by construction: every entry is an option the
   * player themselves chose and was told was wrong. It carries no claim about
   * the remaining options, and it does not open the reveal — a grid with
   * eliminations and no `revealedCorrectOptionId` stays `open`, because the
   * card genuinely is.
   */
  eliminatedOptionIds?: readonly string[];
}

export function AnswerGrid({
  options,
  selectedOptionId,
  permissions,
  onSelectOption,
  revealedCorrectOptionId = null,
  wideTwoColumn = false,
  eliminatedOptionIds = [],
}: AnswerGridProps) {
  const selected = options.find((o) => o.id === selectedOptionId) ?? null;
  const revealed = options.find((o) => o.id === revealedCorrectOptionId) ?? null;
  const eliminatedSet = new Set(eliminatedOptionIds);
  const eliminatedIndexes = options
    .filter((o) => eliminatedSet.has(o.id))
    .map((o) => o.index);
  // A card with eliminations is still being played, so permission alone
  // decides interactivity here; which INDIVIDUAL tablets are unavailable is
  // the grid's business and is handled per option below.
  const canPick =
    selectedOptionId === null ? permissions.canSelectAnswer : permissions.canChangeAnswer;
  const interactive = canPick && revealed === null;

  const handleSelect = (label: string, index: number) => {
    if (!interactive) return;
    // POSITION FIRST. A label does not identify a choice when two options
    // share one — an image-only or recognition choice set — and the grid
    // speaks in ids, so it has to land on the right option before it can
    // check whether that option was retired.
    const option = options[index] ?? options.find((o) => o.label === label);
    // Refused here as well as disabled in the DOM: a struck-out option must
    // never reach a controller, because the backend rejects it outright
    // (`OPTION_ELIMINATED`) and a client that sent one would turn a stale
    // render into an error the player did not cause.
    if (option && !eliminatedSet.has(option.id)) onSelectOption(option);
  };

  return (
    <fieldset
      disabled={!interactive}
      data-testid="answer-grid"
      data-answers-state={revealed ? "revealed" : interactive ? "open" : "locked"}
      data-eliminated-count={eliminatedIndexes.length}
      className="m-0 border-0 p-0"
    >
      <QuizAnswerOptions
        choices={options.map((o) => o.label)}
        selectedAnswer={selected?.label ?? null}
        answerResult={revealed ? { correct_answer: revealed.label } : null}
        onSelect={handleSelect}
        columns={wideTwoColumn ? "wide-2" : "auto"}
        optionMedia={
          options.some((o) => o.media) ? options.map((o) => o.media ?? null) : undefined
        }
        eliminatedIndexes={eliminatedIndexes}
      />
    </fieldset>
  );
}
