import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { JourneyWorkbenchSheet } from "./JourneyWorkbenchSheet";

const tap = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

describe("JourneyWorkbenchSheet (JX2)", () => {
  it("shows the formula notecard above the calculator", () => {
    render(<JourneyWorkbenchSheet open onOpenChange={() => {}} />);
    const sheet = screen.getByTestId("journey-workbench-sheet");
    const card = within(sheet).getByTestId("journey-formula-card");
    const calc = within(sheet).getByTestId("journey-calculator");
    expect(card.compareDocumentPosition(calc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.querySelectorAll("[data-formula]")).toHaveLength(3);
  });

  it("computes, backspaces and clears", () => {
    render(<JourneyWorkbenchSheet open onOpenChange={() => {}} />);
    const display = screen.getByTestId("journey-calculator-display");
    ["1", "2", "Multiply", "Open parenthesis", "3", "Add", "4", "Close parenthesis"].forEach(tap);
    expect(display).toHaveTextContent("12×(3+4)");
    tap("Equals");
    expect(display).toHaveTextContent("84");
    tap("Backspace");
    expect(display).toHaveTextContent("8");
    tap("Clear");
    expect(display).toHaveTextContent("0");
  });

  it("flags an incomplete expression instead of guessing", () => {
    render(<JourneyWorkbenchSheet open onOpenChange={() => {}} />);
    ["5", "Divide", "0", "Equals"].forEach(tap);
    expect(screen.getByTestId("journey-calculator-display")).toHaveTextContent("5÷0");
  });
});
