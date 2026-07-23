/**
 * Accessible numeric answer input (G5.2B).
 *
 * Validation here is INPUT-SHAPE ONLY (blank/non-finite/min/max/step/integer):
 * it decides whether a value may be SUBMITTED, never whether it is CORRECT. No
 * answer is computed. The parsed numeric value is handed back verbatim for the
 * reveal to echo.
 */
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NumericInputConstraints } from "../contracts/playerQuestion";

export interface NumericValidation {
  readonly valid: boolean;
  readonly value: number | null;
  readonly message: string | null;
}

/**
 * Pure input-shape validation. Never determines correctness.
 *
 * Note this deliberately does NOT reject extra decimal places: the backend
 * accepts any answer that rounds to the displayed value, so truncating or
 * blocking a more precise entry here would reject answers the grader calls
 * correct. The value is always submitted verbatim.
 */
export function validateNumeric(raw: string, c: NumericInputConstraints): NumericValidation {
  const trimmed = raw.trim();
  if (trimmed === "") return { valid: false, value: null, message: "Enter a value." };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { valid: false, value: null, message: "Enter a finite number." };
  if (c.integerOnly && !Number.isInteger(n)) return { valid: false, value: null, message: "Enter a whole number." };
  if (c.min !== null && n < c.min) return { valid: false, value: null, message: `Must be at least ${c.min}.` };
  if (c.max !== null && n > c.max) return { valid: false, value: null, message: `Must be at most ${c.max}.` };
  return { valid: true, value: n, message: null };
}

export function MasteryNumericInput({
  constraints,
  value,
  onValueChange,
  onSubmitRequested,
  disabled,
}: {
  constraints: NumericInputConstraints;
  value: string;
  onValueChange: (next: string) => void;
  onSubmitRequested?: () => void;
  disabled?: boolean;
}) {
  const id = useId();
  const validation = validateNumeric(value, constraints);
  const showError = value.trim() !== "" && !validation.valid;
  const hint = constraints.precisionInstruction;
  const hintId = `${id}-hint`;
  // Whole-number questions get a numeric keypad; decimals need the decimal key.
  const inputMode = constraints.integerOnly ? "numeric" : "decimal";
  const describedBy = [showError ? `${id}-err` : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        Your answer{constraints.unit ? ` (${constraints.unit})` : ""}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        disabled={disabled}
        value={value}
        step={constraints.step ?? undefined}
        aria-describedby={describedBy || undefined}
        aria-invalid={showError || undefined}
        data-testid="mastery-numeric-input"
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && validation.valid && !disabled) {
            e.preventDefault();
            onSubmitRequested?.();
          }
        }}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground"
           data-testid="mastery-precision-hint">
          {hint}
        </p>
      )}
      {showError && (
        <p id={`${id}-err`} role="alert" className="text-xs text-destructive">
          {validation.message}
        </p>
      )}
    </div>
  );
}
