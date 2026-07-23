/**
 * Numeric precision contract, client side (J3).
 *
 * The backend decides correctness; the UI's job is to never contradict it —
 * never ask for precision the grader rejects, never truncate what the player
 * typed, and never re-round the revealed answer.
 */
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MasteryNumericInput, validateNumeric } from "./MasteryNumericInput";
import type { NumericInputConstraints } from "../contracts/playerQuestion";

afterEach(cleanup);

const DECIMAL_3: NumericInputConstraints = {
  unit: "damage",
  min: 0,
  max: null,
  step: 0.001,
  integerOnly: false,
  decimalPlaces: 3,
  roundingMode: "ROUND_HALF_UP",
  precisionInstruction: "Round to 3 decimal places.",
  precisionContractVersion: "mastery-precision-1.0.0",
};

const INTEGER: NumericInputConstraints = {
  unit: "casts",
  min: 0,
  max: null,
  step: 1,
  integerOnly: true,
  decimalPlaces: 0,
  roundingMode: "ROUND_HALF_UP",
  precisionInstruction: null,
  precisionContractVersion: "mastery-precision-1.0.0",
};

/** A response predating the precision contract: the fields arrive absent. */
const LEGACY: NumericInputConstraints = {
  unit: "damage",
  min: 0,
  max: null,
  step: null,
  integerOnly: false,
  decimalPlaces: null,
  roundingMode: null,
  precisionInstruction: null,
  precisionContractVersion: null,
};

describe("validateNumeric", () => {
  it("accepts the answer at the displayed precision", () => {
    expect(validateNumeric("105.714", DECIMAL_3)).toMatchObject({
      valid: true,
      value: 105.714,
    });
  });

  it("does not reject extra decimal places the grader would accept", () => {
    // The backend accepts anything that rounds to the displayed value, so the
    // UI must not block a more precise entry.
    expect(validateNumeric("105.71428571428571", DECIMAL_3)).toMatchObject({
      valid: true,
      value: 105.71428571428571,
    });
  });

  it("still rejects blank, non-numeric and non-finite input", () => {
    expect(validateNumeric("", DECIMAL_3).valid).toBe(false);
    expect(validateNumeric("abc", DECIMAL_3).valid).toBe(false);
    expect(validateNumeric("Infinity", DECIMAL_3).valid).toBe(false);
    expect(validateNumeric("NaN", DECIMAL_3).valid).toBe(false);
  });

  it("enforces whole numbers only where the contract says integer-only", () => {
    expect(validateNumeric("7", INTEGER).valid).toBe(true);
    expect(validateNumeric("7.5", INTEGER)).toMatchObject({
      valid: false,
      message: "Enter a whole number.",
    });
  });

  it("accepts negative entry when no minimum is set", () => {
    const noMin = { ...DECIMAL_3, min: null };
    expect(validateNumeric("-12.5", noMin)).toMatchObject({ valid: true, value: -12.5 });
    // ...and still respects a minimum when one is set.
    expect(validateNumeric("-12.5", DECIMAL_3).valid).toBe(false);
  });
});

describe("MasteryNumericInput", () => {
  it("shows the precision instruction for a decimal question", () => {
    render(
      <MasteryNumericInput constraints={DECIMAL_3} value="" onValueChange={() => {}} />,
    );
    expect(screen.getByTestId("mastery-precision-hint")).toHaveTextContent(
      "Round to 3 decimal places.",
    );
  });

  it("shows no instruction on a whole-number question", () => {
    render(<MasteryNumericInput constraints={INTEGER} value="" onValueChange={() => {}} />);
    expect(screen.queryByTestId("mastery-precision-hint")).toBeNull();
  });

  it("uses the contract's step and a decimal keyboard for decimals", () => {
    render(
      <MasteryNumericInput constraints={DECIMAL_3} value="" onValueChange={() => {}} />,
    );
    const input = screen.getByTestId("mastery-numeric-input");
    expect(input).toHaveAttribute("step", "0.001");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });

  it("uses a numeric keypad for whole-number questions", () => {
    render(<MasteryNumericInput constraints={INTEGER} value="" onValueChange={() => {}} />);
    const input = screen.getByTestId("mastery-numeric-input");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("step", "1");
  });

  it("associates the instruction with the input for screen readers", () => {
    render(
      <MasteryNumericInput constraints={DECIMAL_3} value="" onValueChange={() => {}} />,
    );
    const input = screen.getByTestId("mastery-numeric-input");
    const hintId = screen.getByTestId("mastery-precision-hint").getAttribute("id");
    expect(input.getAttribute("aria-describedby")).toContain(hintId);
  });

  it("submits what the player typed without truncating it", () => {
    const onValueChange = vi.fn();
    const onSubmitRequested = vi.fn();
    render(
      <MasteryNumericInput
        constraints={DECIMAL_3}
        value="105.71428"
        onValueChange={onValueChange}
        onSubmitRequested={onSubmitRequested}
      />,
    );
    const input = screen.getByTestId("mastery-numeric-input");
    expect(input).toHaveValue("105.71428");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmitRequested).toHaveBeenCalled();
  });

  it("renders safely when the backend omits precision fields", () => {
    render(<MasteryNumericInput constraints={LEGACY} value="" onValueChange={() => {}} />);
    const input = screen.getByTestId("mastery-numeric-input");
    expect(input).not.toHaveAttribute("step");
    expect(screen.queryByTestId("mastery-precision-hint")).toBeNull();
  });
});

describe("reveal shows the graded value", () => {
  async function fixtureData(): Promise<Record<string, unknown>> {
    const mod = await import("../__fixtures__/player_reveals.json");
    const envelopes = mod.default as ReadonlyArray<{ data: unknown }>;
    return JSON.parse(JSON.stringify(envelopes[0].data));
  }

  it("parses correct_answer_display and keeps the exact value separate", async () => {
    const { readPlayerReveal } = await import("../contracts/playerReveal");
    const data = await fixtureData();
    data.correct_answer = 105.714;
    data.correct_answer_display = "105.714";
    const reveal = readPlayerReveal(data, "reveal");
    expect(reveal.correctAnswer).toBe(105.714);
    expect(reveal.correctAnswerDisplay).toBe("105.714");
  });

  it("tolerates a reveal with no display field (pre-contract response)", async () => {
    const { readPlayerReveal } = await import("../contracts/playerReveal");
    const data = await fixtureData();
    delete data.correct_answer_display;
    const reveal = readPlayerReveal(data, "reveal");
    expect(reveal.correctAnswerDisplay).toBeNull();
  });
});
