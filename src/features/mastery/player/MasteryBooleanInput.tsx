/**
 * Boolean / single-choice answer input (G5.2B).
 *
 * Renders explicit choices with radio-group semantics (keyboard-operable via the
 * Radix RadioGroup). For a boolean question the two labels are the backend's
 * [false_label, true_label] pair; selection maps by that explicit contract
 * position, NOT by inferring meaning from ordering. Correctness is never derived
 * here — only a selection is captured.
 */
import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

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
  ariaLabel = "Answer choices",
}: {
  options: readonly ChoiceOption[];
  value: string | null;
  onSelect: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const groupId = useId();
  return (
    <RadioGroup
      aria-label={ariaLabel}
      value={value ?? undefined}
      onValueChange={onSelect}
      disabled={disabled}
      data-testid="mastery-choice-input"
      className="gap-2"
    >
      {options.map((opt, i) => {
        const itemId = `${groupId}-${i}`;
        return (
          <div
            key={opt.value}
            className="flex items-center gap-2 rounded-md border border-border p-2.5"
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
