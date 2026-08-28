import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseMasteryPlayerQuestion, parseMasteryPlayerReveal } from "../contracts/parsers";
import { atomicRecallQuestionEnvelopes, atomicRecallRevealEnvelopes } from "./atomicRecallFixtures";
import { AtomicRecallRevealView } from "./AtomicRecallRevealView";

afterEach(() => cleanup());

const questions = atomicRecallQuestionEnvelopes().map(parseMasteryPlayerQuestion);
const reveals = atomicRecallRevealEnvelopes().map(parseMasteryPlayerReveal);

describe("AtomicRecallRevealView", () => {
  it("shows Correct with the unit-suffixed answer, taken verbatim from the reveal", () => {
    render(
      <AtomicRecallRevealView
        question={questions[0]}
        reveal={reveals[0]}
        submittedAnswer={8.4}
        isFinal={false}
        onNext={vi.fn()}
      />,
    );
    const status = screen.getByTestId("mastery-correctness");
    expect(status.getAttribute("data-correct")).toBe("true");
    expect(status.textContent).toContain("Correct");
    expect(screen.getByTestId("mastery-correct-answer").textContent).toContain("8.4");
    expect(screen.getByTestId("mastery-correct-answer").textContent).toContain("seconds");
  });

  it("shows Incorrect for a wrong answer — correctness read only from authoritativeCorrectness", () => {
    render(
      <AtomicRecallRevealView
        question={questions[1]}
        reveal={reveals[1]}
        submittedAnswer={65}
        isFinal={false}
        onNext={vi.fn()}
      />,
    );
    const status = screen.getByTestId("mastery-correctness");
    expect(status.getAttribute("data-correct")).toBe("false");
    expect(status.textContent).toContain("Incorrect");
    expect(screen.getByTestId("mastery-correct-answer").textContent).toContain("60");
  });

  it("renders no Before/After state panels — there is no combat state for this interaction", () => {
    render(
      <AtomicRecallRevealView
        question={questions[0]}
        reveal={reveals[0]}
        submittedAnswer={8.4}
        isFinal={false}
        onNext={vi.fn()}
      />,
    );
    expect(screen.queryByText("Before")).toBeNull();
    expect(screen.queryByText("After")).toBeNull();
  });

  it("shows the backend explanation and does not itself compute correctness", () => {
    render(
      <AtomicRecallRevealView
        question={questions[2]}
        reveal={reveals[2]}
        submittedAnswer={20.9}
        isFinal={false}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mastery-explanation").textContent).toBe(reveals[2].explanation);
  });
});
