/**
 * PM2 — one-screen mobile Practice: the auto-advance and the one-line chrome.
 *
 * The reveal advances by itself, exactly once, after its hold; never while the
 * grade is pending or after a failed submit; never for a reveal that is no
 * longer on stage; and holds still while the player is reading it, a dialog or
 * dock panel is open, or the tab is hidden.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getExistingBackendAuthToken: async () => null,
  ensureBackendAuthToken: async () => null,
}));

import { ReportableQuestionProvider } from "@/lib/feedback/reportable-question";
import type { QuizAnswerResult, QuizQuestion } from "@/lib/quiz/api";
import { UNVERIFIED_ANSWER, practiceRevealHoldMs } from "@/lib/quiz/practiceArena";
import { REVEAL_HOLD_MS } from "@/lib/ranked-core/pacing";
import PracticeArena, { type PracticeArenaProps } from "./PracticeArena";

const Q1: QuizQuestion = {
  id: 51, category: "Objectives", question_text: "How much gold does the first tower plate grant?",
  format: "multiple_choice", choices: ["120", "160", "200", "250"],
};
const Q2: QuizQuestion = {
  id: 52, category: "Objectives", question_text: "When does Baron Nashor first spawn?",
  format: "multiple_choice", choices: ["15:00", "20:00", "25:00"],
};
const GRADED: QuizAnswerResult = { is_correct: true, correct_answer: "160", explanation: "", xp_earned: 4 };
const EXPLAINED: QuizAnswerResult = {
  is_correct: false, correct_answer: "160",
  explanation: "Each outer tower plate is worth 160 gold until plating falls at 14:00.",
};

function props(over: Partial<PracticeArenaProps> = {}): PracticeArenaProps {
  return {
    phase: "active", questions: [Q1, Q2], currentIndex: 0, selectedAnswer: null, answerResult: null,
    outcomes: [], score: 0, subject: "Objectives", subjectIcon: null, runKind: "fresh",
    sessionXp: null, progression: null, fillBlankValue: "", onFillBlankChange: vi.fn(),
    onSelectAnswer: vi.fn(), runKey: "1", onAdvance: vi.fn(), onRetryAnswer: vi.fn(),
    onSkip: vi.fn(), onRetry: vi.fn(),
    ...over,
  };
}

function tree(p: PracticeArenaProps) {
  return (
    <MemoryRouter>
      <ReportableQuestionProvider>
        <PracticeArena {...p} />
      </ReportableQuestionProvider>
    </MemoryRouter>
  );
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.querySelectorAll("[data-test-overlay]").forEach((el) => el.remove());
});

describe("PM2 — the reveal advances by itself", () => {
  it("advances exactly once, after the hold, for a graded answer", () => {
    const p = props({ selectedAnswer: "160", answerResult: GRADED });
    const { rerender } = render(tree(p));
    const hold = practiceRevealHoldMs(GRADED)!;
    expect(hold).toBe(REVEAL_HOLD_MS);
    act(() => { vi.advanceTimersByTime(hold - 1); });
    expect(p.onAdvance).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(p.onAdvance).toHaveBeenCalledTimes(1);
    // Re-renders of the same reveal (a progress refresh, a parent tick) never re-arm it.
    rerender(tree({ ...p, sessionXp: 4 }));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(p.onAdvance).toHaveBeenCalledTimes(1);
  });

  it("holds longer when there is an explanation to read", () => {
    const p = props({ selectedAnswer: "120", answerResult: EXPLAINED });
    render(tree(p));
    const hold = practiceRevealHoldMs(EXPLAINED)!;
    expect(hold).toBeGreaterThan(REVEAL_HOLD_MS);
    act(() => { vi.advanceTimersByTime(REVEAL_HOLD_MS + 100); });
    expect(p.onAdvance).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(hold); });
    expect(p.onAdvance).toHaveBeenCalledTimes(1);
  });

  it("never advances while the grade is in flight", () => {
    const p = props({ selectedAnswer: "160" });
    render(tree(p));
    expect(screen.getByTestId("practice-checking")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(p.onAdvance).not.toHaveBeenCalled();
  });

  it("never advances after a failed submit", () => {
    const p = props({ selectedAnswer: "160", answerResult: UNVERIFIED_ANSWER });
    render(tree(p));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(p.onAdvance).not.toHaveBeenCalled();
    expect(screen.getByTestId("practice-retry-answer")).toBeTruthy();
  });

  it("drops a pending advance when the reveal leaves the stage (new question, replay, unmount)", () => {
    const p = props({ selectedAnswer: "160", answerResult: GRADED });
    const { rerender, unmount } = render(tree(p));
    act(() => { vi.advanceTimersByTime(REVEAL_HOLD_MS / 2); });
    // A replay (new run) puts question 1 back on stage, unanswered.
    rerender(tree({ ...p, runKey: "2", selectedAnswer: null, answerResult: null }));
    act(() => { vi.advanceTimersByTime(REVEAL_HOLD_MS * 4); });
    expect(p.onAdvance).not.toHaveBeenCalled();
    // The new run's reveal gets its own full hold, and fires once.
    rerender(tree({ ...p, runKey: "2" }));
    act(() => { vi.advanceTimersByTime(REVEAL_HOLD_MS - 1); });
    expect(p.onAdvance).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(p.onAdvance).toHaveBeenCalledTimes(1);
    // Unmounting mid-hold of yet another reveal fires nothing.
    rerender(tree({ ...p, runKey: "2", currentIndex: 1, selectedAnswer: "20:00",
      answerResult: { ...GRADED, correct_answer: "20:00" } }));
    unmount();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(p.onAdvance).toHaveBeenCalledTimes(1);
  });

  it("pauses while the reveal is pressed, and resumes with only the time that was left", () => {
    const p = props({ selectedAnswer: "160", answerResult: GRADED });
    render(tree(p));
    const footer = document.querySelector<HTMLElement>("[data-practice-reveal-footer]")!;
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { fireEvent.pointerDown(footer); });
    expect(footer.getAttribute("data-advance-paused")).toBe("true");
    expect(screen.getByTestId("practice-advance-meter").getAttribute("data-paused")).toBe("true");
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(p.onAdvance).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new Event("pointerup")); });
    act(() => { vi.advanceTimersByTime(REVEAL_HOLD_MS - 1000 - 1); });
    expect(p.onAdvance).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(p.onAdvance).toHaveBeenCalledTimes(1);
  });

  it("holds while a dialog (the leave confirmation) or a dock panel is open", async () => {
    const p = props({ selectedAnswer: "160", answerResult: GRADED });
    render(tree(p));
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("data-test-overlay", "");
    await act(async () => { document.body.appendChild(dialog); });
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(p.onAdvance).not.toHaveBeenCalled();
    await act(async () => { dialog.remove(); });
    // A Report panel portalled into the dock's panel column holds it the same way.
    const panels = document.createElement("div");
    panels.setAttribute("data-testid", "mogzy-dock-panels-left");
    panels.setAttribute("data-test-overlay", "");
    document.body.appendChild(panels);
    await act(async () => { panels.appendChild(document.createElement("section")); });
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(p.onAdvance).not.toHaveBeenCalled();
    await act(async () => { panels.replaceChildren(); });
    act(() => { vi.advanceTimersByTime(REVEAL_HOLD_MS); });
    expect(p.onAdvance).toHaveBeenCalledTimes(1);
  });

  it("holds while the tab is hidden", () => {
    const p = props({ selectedAnswer: "160", answerResult: GRADED });
    render(tree(p));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(p.onAdvance).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    act(() => { vi.advanceTimersByTime(REVEAL_HOLD_MS); });
    expect(p.onAdvance).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });
});

describe("PM2 — the one-line chrome and the phone frame", () => {
  it("draws PRACTICE, the position and mogzy.lol on one header row with a way back", () => {
    render(tree(props({ currentIndex: 1 })));
    const chrome = screen.getByTestId("practice-chrome");
    expect(chrome.tagName).toBe("HEADER");
    expect(chrome.className).toContain("!flex-nowrap");
    expect(within(chrome).getByRole("heading", { level: 1 }).textContent).toBe("Practice");
    expect(within(chrome).getByTestId("practice-brand").textContent).toBe("mogzy.lol");
    expect(within(chrome).getByTestId("practice-position").textContent).toContain("2 / 2");
    const back = within(chrome).getByRole("link", { name: "Back to League hub" });
    expect(back.getAttribute("href")).toBe("/lol");
    // Exactly one way back now (the subject panel no longer carries a second).
    expect(screen.getAllByRole("link", { name: "Back to League hub" })).toHaveLength(1);
  });

  it("asks the arena for the phone one-screen frame (data-phone-arena)", () => {
    render(tree(props()));
    expect(screen.getByTestId("ranked-match").getAttribute("data-phone-arena")).toBe("true");
    expect(screen.getByTestId("practice-arena").closest(".ranked-academy")).toBeNull();
    expect(document.querySelector('.ranked-academy[data-phone-arena="true"]')).not.toBeNull();
    // Not the stacked-panel frame PM1 used on phones.
    expect(document.querySelector('[data-phone-stacked="true"]')).toBeNull();
  });

  it("holds the reveal box from the first frame of a question", () => {
    render(tree(props()));
    expect(document.querySelector("[data-practice-hud-reserve]")?.className).toContain("practice-reveal-slot");
  });

  it("tiers a long explanation's type instead of growing the box", () => {
    const long = "x".repeat(200);
    render(tree(props({ selectedAnswer: "120", answerResult: { ...EXPLAINED, explanation: long } })));
    expect(screen.getByTestId("practice-explanation").getAttribute("data-explanation-density")).toBe("long");
    expect(document.querySelector("[data-practice-reveal-footer]")?.className).toContain("practice-reveal-slot");
  });
});
