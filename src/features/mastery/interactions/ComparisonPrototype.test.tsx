/**
 * End-to-end comparison flow test (Phase 4C2) — proves the dispatcher +
 * fixture session together render and grade a stateless two-champion
 * comparative set through the SAME submit/reveal/next flow the legacy and
 * atomic-recall prototypes use, including a true tie.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ComparisonPrototype } from "./ComparisonPrototype";

afterEach(() => cleanup());

describe("ComparisonPrototype end-to-end", () => {
  it("starts straight into the question phase (no two-champion combat intro) and completes with an authoritative score, including a true tie", async () => {
    render(<ComparisonPrototype />);

    // Q1: decisive ability-cooldown comparison — Ahri wins
    expect(await screen.findByTestId("mastery-comparison-question")).toBeTruthy();
    fireEvent.click(screen.getByTestId("choice-ahri"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-submit-button"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("mastery-correctness").getAttribute("data-correct")).toBe("true");
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-next-button"));
      await Promise.resolve();
    });

    // Q2: decisive champion-stat comparison — answer wrong on purpose
    expect(screen.getByTestId("mastery-comparison-question")).toBeTruthy();
    fireEvent.click(screen.getByTestId("choice-ahri"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-submit-button"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("mastery-correctness").getAttribute("data-correct")).toBe("false");
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-next-button"));
      await Promise.resolve();
    });

    // Q3: a true tie — final step
    fireEvent.click(screen.getByTestId("choice-tie"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-submit-button"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("mastery-correctness").getAttribute("data-correct")).toBe("true");
    expect(screen.getByTestId("mastery-correct-answer").textContent).toContain("Tie / Same");
    expect(screen.getByTestId("mastery-next-button").textContent).toBe("View results");
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-next-button"));
      await Promise.resolve();
    });

    const summary = screen.getByTestId("mastery-correct-count").textContent ?? "";
    expect(summary).toContain("2");
    expect(summary).toContain("3");
    // No fake opponent/combat-state panel ever appeared anywhere in the flow.
    expect(screen.queryByTestId("mastery-matchup-header")).toBeNull();
  });
});
