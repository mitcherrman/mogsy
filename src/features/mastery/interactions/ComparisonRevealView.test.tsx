/**
 * Comparison reveal renderer tests (Phase 4C2).
 *
 * Covers: correctness read only from `reveal.authoritativeCorrectness`,
 * authoritative winner/tie and per-side values + delta rendered straight from
 * backend reveal data, champion-name display (not raw wire values), no
 * before/after combat-state panel, and a true tie rendered distinctly (never
 * inferred from rounding — the tie fixture's reveal states `correct_answer:
 * "tie"` explicitly, and nothing here compares `value_a`/`value_b`).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseMasteryPlayerQuestion, parseMasteryPlayerReveal } from "../contracts/parsers";
import { comparisonQuestionEnvelopes, comparisonRevealEnvelopes } from "./comparisonFixtures";
import { ComparisonRevealView } from "./ComparisonRevealView";

afterEach(() => cleanup());

const questions = comparisonQuestionEnvelopes().map(parseMasteryPlayerQuestion);
const reveals = comparisonRevealEnvelopes().map(parseMasteryPlayerReveal);

describe("ComparisonRevealView", () => {
  it("shows Correct with the winning champion's display name, taken verbatim from the reveal", () => {
    render(
      <ComparisonRevealView
        question={questions[0]}
        reveal={reveals[0]}
        submittedAnswer="ahri"
        isFinal={false}
        onNext={vi.fn()}
      />,
    );
    const status = screen.getByTestId("mastery-correctness");
    expect(status.getAttribute("data-correct")).toBe("true");
    expect(status.textContent).toContain("Correct");
    // Champion display name, not the raw wire value ("ahri").
    expect(screen.getByTestId("mastery-correct-answer").textContent).toBe("Ahri");
  });

  it("shows Incorrect for a wrong pick — correctness read only from authoritativeCorrectness", () => {
    render(
      <ComparisonRevealView
        question={questions[1]}
        reveal={reveals[1]}
        submittedAnswer="ahri"
        isFinal={false}
        onNext={vi.fn()}
      />,
    );
    const status = screen.getByTestId("mastery-correctness");
    expect(status.getAttribute("data-correct")).toBe("false");
    expect(status.textContent).toContain("Incorrect");
    expect(screen.getByTestId("mastery-correct-answer").textContent).toContain("Syndra");
  });

  it("renders the authoritative per-side values and delta from backend reveal data (no client recomputation)", () => {
    render(
      <ComparisonRevealView
        question={questions[0]}
        reveal={reveals[0]}
        submittedAnswer="ahri"
        isFinal={false}
        onNext={vi.fn()}
      />,
    );
    const explanation = screen.getByTestId("mastery-explanation").textContent ?? "";
    expect(explanation).toContain("8.4s");
    expect(explanation).toContain("15.0s");
    expect(explanation).toContain("6.6s");
    expect(explanation).toBe(reveals[0].explanation);
  });

  it("renders a true tie distinctly, stated verbatim by the backend — never inferred from rounding", () => {
    render(
      <ComparisonRevealView
        question={questions[2]}
        reveal={reveals[2]}
        submittedAnswer="tie"
        isFinal={true}
        onNext={vi.fn()}
      />,
    );
    expect(reveals[2].correctAnswer).toBe("tie");
    const status = screen.getByTestId("mastery-correctness");
    expect(status.getAttribute("data-correct")).toBe("true");
    expect(screen.getByTestId("mastery-correct-answer").textContent).toContain("Tie / Same");
    expect(screen.getByTestId("mastery-explanation").textContent).toContain("Tied");
  });

  it("renders no Before/After state panels — there is no combat state for this interaction", () => {
    render(
      <ComparisonRevealView
        question={questions[0]}
        reveal={reveals[0]}
        submittedAnswer="ahri"
        isFinal={false}
        onNext={vi.fn()}
      />,
    );
    expect(screen.queryByText("Before")).toBeNull();
    expect(screen.queryByText("After")).toBeNull();
  });
});
