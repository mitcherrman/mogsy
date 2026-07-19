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

/** Pure input-shape validation. Never determines correctness. */
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
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        Your answer{constraints.unit ? ` (${constraints.unit})` : ""}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        value={value}
        aria-describedby={showError ? `${id}-err` : undefined}
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
      {showError && (
        <p id={`${id}-err`} role="alert" className="text-xs text-destructive">
          {validation.message}
        </p>
      )}
    </div>
  );
}
