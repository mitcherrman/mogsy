/**
 * Modern Mastery per-question reveal — the shared state, the shared choice
 * component, and the auto-advance timer.
 *
 * The end-to-end behaviour is proved in `generatedPlaytestWalkthrough` against
 * real captured backend payloads; this file pins the pieces those walkthroughs
 * rest on, including the three timer hazards (one timer per reveal, cleanup on
 * unmount, and a stale timer never advancing a newer question) which are hard
 * to observe from a full-flow test.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MasteryChoiceInput } from "../player/MasteryBooleanInput";
import { AtomicRecallQuestionView } from "./AtomicRecallQuestionView";
import { ComparisonQuestionView } from "./ComparisonQuestionView";
import { parseMasteryPlayerQuestion } from "../contracts/parsers";
import { atomicRecallQuestionEnvelopes } from "./atomicRecallFixtures";
import { comparisonQuestionEnvelopes } from "./comparisonFixtures";
import {
  MASTERY_REVEAL_DURATION_MS,
  choiceTone,
  revealDurationMs,
  useRevealAutoAdvance,
} from "./revealState";

const OPTIONS = [
  { value: "9", label: "9" },
  { value: "12", label: "12" },
  { value: "6", label: "6" },
];

afterEach(cleanup);

// ------------------------------------------------------------------ tones

describe("choiceTone — the whole styling rule", () => {
  it("is neutral for every option while the question is answerable", () => {
    for (const o of OPTIONS) expect(choiceTone(o.value, null)).toBe("neutral");
  });

  it("paints the correct option green whether or not it was chosen", () => {
    const chosen = { correctValue: "9", selectedValue: "9" };
    const missed = { correctValue: "9", selectedValue: "12" };
    expect(choiceTone("9", chosen)).toBe("correct");
    expect(choiceTone("9", missed)).toBe("correct");
  });

  it("paints the chosen wrong option red", () => {
    expect(choiceTone("12", { correctValue: "9", selectedValue: "12" }))
      .toBe("chosen-wrong");
  });

  it("de-emphasises every untouched option", () => {
    expect(choiceTone("6", { correctValue: "9", selectedValue: "12" }))
      .toBe("muted");
  });

  it("still names the correct option when the player answered nothing", () => {
    expect(choiceTone("9", { correctValue: "9", selectedValue: null }))
      .toBe("correct");
    expect(choiceTone("12", { correctValue: "9", selectedValue: null }))
      .toBe("muted");
  });
});

describe("revealDurationMs", () => {
  it("defaults to the one shared duration", () => {
    expect(MASTERY_REVEAL_DURATION_MS).toBe(1750);
    expect(revealDurationMs(null)).toBe(MASTERY_REVEAL_DURATION_MS);
    expect(revealDurationMs(undefined)).toBe(MASTERY_REVEAL_DURATION_MS);
  });

  it("prefers the server's frozen window where one exists", () => {
    // It is the number the backend's deadline compensation was computed
    // against, so the client must not pause for a different one.
    expect(revealDurationMs(2500)).toBe(2500);
  });
});

// ------------------------------------------------------- MasteryChoiceInput

describe("MasteryChoiceInput — reveal state", () => {
  function renderChoices(reveal: unknown) {
    return render(
      <MasteryChoiceInput
        options={OPTIONS}
        value={null}
        onSelect={vi.fn()}
        reveal={reveal as never}
      />,
    );
  }

  it("is unchanged when no reveal is passed", () => {
    renderChoices(null);
    expect(screen.getByTestId("mastery-choice-input"))
      .not.toHaveAttribute("data-revealing");
    for (const o of OPTIONS) {
      expect(screen.getByTestId(`mastery-choice-row-${o.value}`))
        .toHaveAttribute("data-tone", "neutral");
    }
  });

  it("outlines the correct option green and mutes the rest", () => {
    renderChoices({ correctValue: "9", selectedValue: "9" });
    expect(screen.getByTestId("mastery-choice-row-9"))
      .toHaveAttribute("data-tone", "correct");
    expect(screen.getByTestId("mastery-choice-row-12"))
      .toHaveAttribute("data-tone", "muted");
  });

  it("outlines a wrong pick red AND the right answer green at once", () => {
    renderChoices({ correctValue: "9", selectedValue: "12" });
    expect(screen.getByTestId("mastery-choice-row-12"))
      .toHaveAttribute("data-tone", "chosen-wrong");
    expect(screen.getByTestId("mastery-choice-row-9"))
      .toHaveAttribute("data-tone", "correct");
    expect(screen.getByTestId("mastery-choice-row-6"))
      .toHaveAttribute("data-tone", "muted");
  });

  it("locks the input for the duration of the reveal", () => {
    renderChoices({ correctValue: "9", selectedValue: "12" });
    expect(screen.getByTestId("mastery-choice-input"))
      .toHaveAttribute("data-revealing", "true");
    expect(screen.getByTestId("choice-9")).toBeDisabled();
  });
});

// ------------------------------------------------------- question renderers

describe("modern question views render their own reveal in place", () => {
  const reveal = {
    correct: true,
    correctValue: "12",
    selectedValue: "12",
    answerLabel: "12 seconds",
    explanation: "Ahri W has a 12 second cooldown at rank 1.",
  };

  it("keeps the atomic recall question on screen and drops the submit button", () => {
    const parsed = atomicRecallQuestionEnvelopes().map(parseMasteryPlayerQuestion);
    const question = parsed.find((q) => q.answerType === "single_choice")
      ?? parsed[0];
    render(
      <AtomicRecallQuestionView
        question={question}
        total={4}
        submitting={false}
        onSubmit={vi.fn()}
        reveal={{ ...reveal, correctValue: question.answerOptions[0] ?? "12",
                  selectedValue: question.answerOptions[0] ?? "12" }}
      />,
    );
    expect(screen.getByTestId("mastery-atomic-recall-question")).toBeTruthy();
    expect(screen.getByTestId("mastery-question-heading")).toBeTruthy();
    expect(screen.queryByTestId("mastery-submit-button")).toBeNull();
    expect(screen.queryByTestId("mastery-next-button")).toBeNull();
    const panel = screen.getByTestId("mastery-inline-reveal");
    expect(panel).toHaveAttribute("data-correct", "true");
    expect(screen.getByTestId("mastery-reveal-explanation").textContent)
      .toBe(reveal.explanation);
  });

  it("marks an incorrect comparison reveal without taking the screen over", () => {
    const question = comparisonQuestionEnvelopes()
      .map(parseMasteryPlayerQuestion)[0];
    const [a, b] = question.answerOptions;
    render(
      <ComparisonQuestionView
        question={question}
        total={3}
        submitting={false}
        onSubmit={vi.fn()}
        reveal={{
          correct: false, correctValue: a, selectedValue: b,
          answerLabel: null,
          explanation: "Ahri W: 9 seconds. Syndra W: 12 seconds.",
        }}
      />,
    );
    // The question is still there — no full-screen takeover.
    expect(screen.getByTestId("mastery-comparison-question")).toBeTruthy();
    expect(screen.getByTestId("mastery-inline-reveal"))
      .toHaveAttribute("data-correct", "false");
    expect(screen.getByTestId(`mastery-choice-row-${b}`))
      .toHaveAttribute("data-tone", "chosen-wrong");
    expect(screen.getByTestId(`mastery-choice-row-${a}`))
      .toHaveAttribute("data-tone", "correct");
    expect(screen.queryByTestId("mastery-next-button")).toBeNull();
  });
});

// ------------------------------------------------------------ auto-advance

describe("useRevealAutoAdvance", () => {
  function Harness({ revealKey, onElapsed }: {
    revealKey: string | number | null;
    onElapsed: () => void;
  }) {
    useRevealAutoAdvance(revealKey, onElapsed);
    return <div data-testid="harness" />;
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once, after the reveal duration", () => {
    const onElapsed = vi.fn();
    render(<Harness revealKey={0} onElapsed={onElapsed} />);
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS - 1); });
    expect(onElapsed).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it("does not arm at all while there is no reveal", () => {
    const onElapsed = vi.fn();
    render(<Harness revealKey={null} onElapsed={onElapsed} />);
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS * 3); });
    expect(onElapsed).not.toHaveBeenCalled();
  });

  it("cannot schedule a second advance for the same reveal", () => {
    const onElapsed = vi.fn();
    const { rerender } = render(<Harness revealKey={2} onElapsed={onElapsed} />);
    // A duplicate poll / duplicate state update re-renders with the same key.
    rerender(<Harness revealKey={2} onElapsed={onElapsed} />);
    rerender(<Harness revealKey={2} onElapsed={onElapsed} />);
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS * 3); });
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it("cleans its timer up on unmount", () => {
    const onElapsed = vi.fn();
    const { unmount } = render(<Harness revealKey={0} onElapsed={onElapsed} />);
    unmount();
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS * 2); });
    expect(onElapsed).not.toHaveBeenCalled();
  });

  it("a stale timer cannot advance a newer question", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness revealKey={0} onElapsed={first} />);
    // The question changes before the first reveal's timer could fire.
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS - 10); });
    rerender(<Harness revealKey={1} onElapsed={second} />);
    act(() => { vi.advanceTimersByTime(20); });
    // The old timer was cleared, so neither callback has fired yet.
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS); });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
