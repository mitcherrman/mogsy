/**
 * End-to-end atomic-recall flow test (Phase 4C1) — proves the dispatcher +
 * fixture session together render and grade a stateless one-champion recall
 * set through the SAME submit/reveal/next flow the legacy prototype uses.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AtomicRecallPrototype } from "./AtomicRecallPrototype";

afterEach(() => cleanup());

describe("AtomicRecallPrototype end-to-end", () => {
  it("starts straight into the question phase (no two-champion intro) and completes with an authoritative score", async () => {
    render(<AtomicRecallPrototype />);

    // Q1: ability cooldown recall — correct answer 8.4
    expect(await screen.findByTestId("mastery-atomic-recall-question")).toBeTruthy();
    fireEvent.change(screen.getByTestId("mastery-numeric-input"), { target: { value: "8.4" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-submit-button"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("mastery-correctness").getAttribute("data-correct")).toBe("true");
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-next-button"));
      await Promise.resolve();
    });

    // Q2: resource-cost recall — answer wrong on purpose
    expect(screen.getByTestId("mastery-atomic-recall-question")).toBeTruthy();
    fireEvent.change(screen.getByTestId("mastery-numeric-input"), { target: { value: "65" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-submit-button"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("mastery-correctness").getAttribute("data-correct")).toBe("false");
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-next-button"));
      await Promise.resolve();
    });

    // Q3: base stat recall
    fireEvent.change(screen.getByTestId("mastery-numeric-input"), { target: { value: "20.9" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-submit-button"));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-next-button"));
      await Promise.resolve();
    });

    // Q4: level stat recall — final step
    fireEvent.change(screen.getByTestId("mastery-numeric-input"), { target: { value: "1652.5" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-submit-button"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("mastery-next-button").textContent).toBe("View results");
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-next-button"));
      await Promise.resolve();
    });

    const summary = screen.getByTestId("mastery-correct-count").textContent ?? "";
    expect(summary).toContain("3");
    expect(summary).toContain("4");
    // No fake opponent panel ever appeared anywhere in the flow.
    expect(screen.queryByTestId("mastery-matchup-header")).toBeNull();
  });
});
