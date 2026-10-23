/**
 * QRT2 Phase 2A — the verdict stamp says the shared words, once.
 *
 * What is proved here, and why it is its own file: the stamp is the dominant
 * answer-result surface of both Ranked and the hosted Daily, so its VOCABULARY
 * (one set of words across every surface), its NON-COLOUR cues (an icon per
 * verdict), its single announcement and its reduced-motion behaviour are the
 * contract the browser suite then measures on a real layout.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionResultOverlay } from "./QuestionResultOverlay";
import {
  VERDICT_HEADLINE, feedbackVerdictOfRound,
} from "@/lib/question-feedback/model";
import type { RankedResultFeedback, RoundVerdict } from "@/lib/ranked-core/flow/rankedFlow";

const feedback = (
  viewer: RoundVerdict, opponent: RoundVerdict | null = null,
): RankedResultFeedback => ({
  viewer: { kind: "round", id: "e1", verdict: viewer },
  opponent: opponent ? { kind: "round", id: "e2", verdict: opponent } : null,
});

afterEach(() => {
  document.documentElement.classList.remove("reduce-motion");
  vi.restoreAllMocks();
});

describe("the shared verdict vocabulary", () => {
  it("is CORRECT / INCORRECT / TIMED OUT, in sentence case at rest", () => {
    expect(VERDICT_HEADLINE).toEqual({
      correct: "Correct", incorrect: "Incorrect", timeout: "Timed out",
    });
  });

  it("maps the ranked flow's `timed_out` onto `timeout` and touches nothing else", () => {
    expect(feedbackVerdictOfRound("timed_out")).toBe("timeout");
    expect(feedbackVerdictOfRound("correct")).toBe("correct");
    expect(feedbackVerdictOfRound("incorrect")).toBe("incorrect");
  });
});

describe("the viewer's stamp", () => {
  it.each([
    ["correct", "CORRECT"],
    ["incorrect", "INCORRECT"],
    ["timed_out", "TIMED OUT"],
  ] as const)("says %s as %s, with the server's verdict on the node", (verdict, words) => {
    render(<QuestionResultOverlay feedback={feedback(verdict)} />);
    const stamp = screen.getByTestId("result-stamp-viewer");
    expect(stamp).toHaveTextContent(words);
    expect(stamp).toHaveAttribute("data-verdict", verdict);
  });

  it("a timeout is its own verdict, not an incorrect one", () => {
    const { unmount } = render(<QuestionResultOverlay feedback={feedback("timed_out")} />);
    const timeout = screen.getByTestId("result-stamp-viewer");
    expect(timeout).toHaveTextContent("TIMED OUT");
    expect(timeout).not.toHaveTextContent(/^INCORRECT/);
    expect(timeout).toHaveAttribute("data-timeout", "true");
    unmount();
    render(<QuestionResultOverlay feedback={feedback("incorrect")} />);
    expect(screen.getByTestId("result-stamp-viewer")).not.toHaveAttribute("data-timeout");
  });

  it("never relies on colour alone: every verdict carries an icon beside its words", () => {
    for (const verdict of ["correct", "incorrect", "timed_out"] as const) {
      const { unmount } = render(<QuestionResultOverlay feedback={feedback(verdict)} />);
      const stamp = screen.getByTestId("result-stamp-viewer");
      expect(stamp.querySelector("svg"), `${verdict} has no icon`).not.toBeNull();
      unmount();
    }
  });

  it("the three verdicts draw three different icons", () => {
    const icons = (["correct", "incorrect", "timed_out"] as const).map((verdict) => {
      const { unmount } = render(<QuestionResultOverlay feedback={feedback(verdict)} />);
      const cls = screen.getByTestId("result-stamp-viewer").querySelector("svg")!
        .getAttribute("class") ?? "";
      const markup = screen.getByTestId("result-stamp-viewer").querySelector("svg")!.innerHTML;
      unmount();
      return `${cls}|${markup}`;
    });
    expect(new Set(icons).size).toBe(3);
  });
});

describe("announcement and motion", () => {
  it("announces the result exactly once, in words, and hides the decoration", () => {
    render(<QuestionResultOverlay feedback={feedback("incorrect", "correct")} />);
    const live = screen.getAllByRole("status");
    expect(live).toHaveLength(1);
    expect(live[0]).toHaveTextContent("INCORRECT. OPPONENT CORRECT");
    // Both stamps are decoration of the same two facts.
    expect(screen.getByTestId("result-stamp-viewer")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("result-stamp-opponent")).toHaveAttribute("aria-hidden", "true");
  });

  it("reduced motion keeps every word and icon and only removes movement", () => {
    document.documentElement.classList.add("reduce-motion");
    render(<QuestionResultOverlay feedback={feedback("timed_out", "correct")} />);
    const overlay = screen.getByTestId("question-result-overlay");
    expect(overlay).toHaveAttribute("data-motion", "reduced");
    expect(overlay.className).toContain("ranked-result-overlay--still");
    expect(screen.getByTestId("result-stamp-viewer")).toHaveTextContent("TIMED OUT");
    expect(screen.getByTestId("result-stamp-viewer").querySelector("svg")).not.toBeNull();
    expect(screen.getByTestId("result-stamp-opponent")).toHaveTextContent("OPPONENT CORRECT");
  });

  it("draws nothing at all before there is a settlement", () => {
    const { container } = render(<QuestionResultOverlay feedback={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
