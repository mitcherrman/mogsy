/**
 * Boolean / single-choice answer input (G5.2B).
 *
 * Renders explicit choices with radio-group semantics (keyboard-operable via the
 * Radix RadioGroup). For a boolean question the two labels are the backend's
 * [false_label, true_label] pair; selection maps by that explicit contract
 * position, NOT by inferring meaning from ordering. Correctness is never derived
 * here — only a selection is captured.
 *
 * REVEAL STATE. This is the one component every modern Mastery question routes
 * its choices through — atomic recall, comparison, and the Ranked slice
 * adapter alike — so the reveal is taught here once instead of being
 * reimplemented per renderer. Passing `reveal` paints each option by
 * `choiceTone` and locks the group; the reveal is a SERVER-GRADED result being
 * described, and this component still derives no correctness of its own. Not
 * passing it leaves every existing caller byte-identical.
 */
import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  CHOICE_TONE_CLASS,
  choiceTone,
  type MasteryChoiceReveal,
} from "../interactions/revealState";

export interface ChoiceOption {
  /** Stable value passed back on selection. */
  readonly value: string;
  readonly label: string;
}

export function MasteryChoiceInput({
  options,
  value,
  onSelect,
  disabled,
  reveal = null,
  ariaLabel = "Answer choices",
}: {
  options: readonly ChoiceOption[];
  value: string | null;
  onSelect: (value: string) => void;
  disabled?: boolean;
  /** Server-graded reveal for this group, or null while it is answerable. */
  reveal?: MasteryChoiceReveal | null;
  ariaLabel?: string;
}) {
  const groupId = useId();
  const revealing = reveal !== null;
  // During a reveal the group shows the player's OWN submitted answer as the
  // selection, so a correct pick stays visibly chosen and a wrong one stays
  // pointed at. It is read from the reveal rather than from local state so a
  // reload lands on the same picture.
  const shown = revealing ? (reveal.selectedValue ?? value) : value;
  return (
    <RadioGroup
      aria-label={ariaLabel}
      value={shown ?? undefined}
      onValueChange={onSelect}
      // Input LOCKS the moment a reveal exists: an answer is already recorded,
      // and the server would refuse a second one anyway.
      disabled={disabled || revealing}
      data-testid="mastery-choice-input"
      data-revealing={revealing ? "true" : undefined}
      className="gap-2"
    >
      {options.map((opt, i) => {
        const itemId = `${groupId}-${i}`;
        const tone = choiceTone(opt.value, reveal);
        return (
          <div
            key={opt.value}
            data-testid={`mastery-choice-row-${opt.value}`}
            data-tone={tone}
            className={`flex items-center gap-2 rounded-md border p-2.5 transition-colors ${CHOICE_TONE_CLASS[tone]}`}
          >
            <RadioGroupItem value={opt.value} id={itemId} data-testid={`choice-${opt.value}`} />
            <Label htmlFor={itemId} className="flex-1 cursor-pointer text-sm">
              {opt.label}
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}

/** Build the [false,true] choice options for a boolean question. */
export function booleanOptions(answerOptions: readonly string[]): ChoiceOption[] {
  const [falseLabel, trueLabel] =
    answerOptions.length === 2 ? answerOptions : (["No", "Yes"] as const);
  return [
    { value: "false", label: falseLabel },
    { value: "true", label: trueLabel },
  ];
}
