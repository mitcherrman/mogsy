/**
 * PM1 — Practice presented in the canonical Ranked arena.
 * PM2 — the phone one-screen frame, the one-line chrome, and no Next.
 *
 * The page keeps every behaviour; these fence the PRESENTATION contract:
 * the run renders through `CanonicalArena`'s real question stage and answer
 * grid, answering goes through Practice's own submission by label, the reveal
 * is the backend's, and no Ranked-only furniture (opponent, clock, rating,
 * matchmaking) reaches the screen.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getExistingBackendAuthToken: async () => null,
  ensureBackendAuthToken: async () => null,
}));

import {
  ReportableQuestionProvider,
  useReportableQuestion,
} from "@/lib/feedback/reportable-question";
import type { QuizAnswerResult, QuizQuestion } from "@/lib/quiz/api";
import { UNVERIFIED_ANSWER } from "@/lib/quiz/practiceArena";
import PracticeArena, { type PracticeArenaProps } from "./PracticeArena";

afterEach(cleanup);

const TEXT_Q: QuizQuestion = {
  id: 41,
  category: "Summoner Spell Cooldowns",
  question_text: "What is the base cooldown of Flash, in seconds, before any reductions are applied?",
  format: "multiple_choice",
  choices: ["300", "240", "180", "360"],
  difficulty: 2,
};
const ITEM_Q: QuizQuestion = {
  id: 42,
  category: "Item Components",
  question_text: "Which component builds into this item?",
  format: "multiple_choice",
  choices: ["Long Sword", "Pickaxe"],
  image_path: "assets/items/3031.png",
  metadata: { item_name: "Infinity Edge" },
};
const PICTURE_Q: QuizQuestion = {
  id: 43,
  category: "Champion Recognition",
  question_text: "Which of these is Ahri?",
  format: "multiple_choice",
  choices: [
    { label: "Ahri", image_path: "assets/champions/Ahri/icon.png" },
    { label: "Lux", image_path: "assets/champions/Lux/icon.png" },
  ] as unknown as string[],
};

let lastSnapshot: unknown = "unset";
function SnapshotProbe() {
  lastSnapshot = useReportableQuestion();
  return null;
}

function renderArena(over: Partial<PracticeArenaProps> = {}) {
  const props: PracticeArenaProps = {
    phase: "active",
    questions: [TEXT_Q, ITEM_Q],
    currentIndex: 0,
    selectedAnswer: null,
    answerResult: null,
    outcomes: [],
    score: 0,
    subject: "Summoner Spells",
    subjectIcon: null,
    runKind: "fresh",
    sessionXp: null,
    progression: null,
    fillBlankValue: "",
    onFillBlankChange: vi.fn(),
    onSelectAnswer: vi.fn(),
    runKey: "1",
    onAdvance: vi.fn(),
    onRetryAnswer: vi.fn(),
    onSkip: vi.fn(),
    onRetry: vi.fn(),
    ...over,
  };
  const utils = render(
    <MemoryRouter>
      <ReportableQuestionProvider>
        <PracticeArena {...props} />
        <SnapshotProbe />
      </ReportableQuestionProvider>
    </MemoryRouter>,
  );
  return { ...utils, props };
}

describe("PracticeArena — Practice in the canonical arena", () => {
  it("renders the run on the canonical Ranked question stage, with the full prompt", () => {
    renderArena();
    const stage = screen.getByTestId("ranked-question");
    expect(stage.className).toContain("ranked-question-stage");
    expect(stage.closest(".ranked-academy")).not.toBeNull();
    expect(within(stage).getByTestId("scenario-surface")).toBeTruthy();
    expect(within(stage).getByRole("heading", { name: TEXT_Q.question_text! })).toBeTruthy();
    expect(screen.getByTestId("answer-grid").getAttribute("data-answers-state")).toBe("open");
    expect(screen.getByTestId("ranked-header-title").textContent).toContain("Question 1 / 2");
  });

  it("submits through Practice's own handler, by the served label", () => {
    const { props } = renderArena();
    fireEvent.click(screen.getByRole("button", { name: /240/ }));
    expect(props.onSelectAnswer).toHaveBeenCalledWith("240");
  });

  it("locks the grid while the grade is in flight", () => {
    renderArena({ selectedAnswer: "240" });
    expect(screen.getByTestId("answer-grid").getAttribute("data-answers-state")).toBe("locked");
    expect(screen.getByText("Checking your answer…")).toBeTruthy();
  });

  it("shows the backend's reveal: tablets, verdict, explanation and XP — and no Next", () => {
    const result: QuizAnswerResult = {
      is_correct: false, correct_answer: "300", explanation: "Flash is on a 300 second cooldown.", xp_earned: 3,
    };
    renderArena({
      selectedAnswer: "240", answerResult: result, outcomes: [{ position: 0, isCorrect: false }],
    });
    const grid = screen.getByTestId("answer-grid");
    expect(grid.getAttribute("data-answers-state")).toBe("revealed");
    expect(grid.querySelector('[data-choice-state="correct"]')?.textContent).toContain("300");
    expect(grid.querySelector('[data-choice-state="incorrect-selected"]')?.textContent).toContain("240");
    const footer = document.querySelector<HTMLElement>("[data-practice-reveal-footer]")!;
    expect(within(footer).getByText("Incorrect")).toBeTruthy();
    // The revealed grid marks the right tablet; the box does not repeat it.
    expect(within(footer).queryByText(/Correct answer/)).toBeNull();
    expect(screen.getByTestId("practice-explanation").textContent).toBe(result.explanation);
    expect(screen.getByTestId("practice-xp-earned").textContent).toContain("+3 XP");
    expect(screen.getByTestId("central-result").getAttribute("aria-label")).toBe("INCORRECT, +3 XP");
    expect(footer.getAttribute("data-auto-advance")).toBe("pending");
    expect(screen.getByTestId("practice-advance-meter")).toBeTruthy();
    expect(screen.queryByTestId("practice-next")).toBeNull();
    expect(screen.queryByRole("button", { name: /Next question|See results/ })).toBeNull();
  });

  it("has no See results button on the last question either", () => {
    renderArena({
      currentIndex: 1, selectedAnswer: "Long Sword",
      answerResult: { is_correct: true, correct_answer: "Long Sword", explanation: "" },
    });
    expect(screen.queryByRole("button", { name: /See results|Next question/ })).toBeNull();
    expect(within(document.querySelector<HTMLElement>("[data-practice-reveal-footer]")!).getByText("Correct!")).toBeTruthy();
  });

  it("never shows a verdict for an answer the backend could not verify, and offers Try again / Skip", () => {
    const { props } = renderArena({ selectedAnswer: "240", answerResult: UNVERIFIED_ANSWER,
      submitFailure: { kind: "not-sent", retryable: true } });
    const footer = document.querySelector<HTMLElement>("[data-practice-reveal-footer]")!;
    expect(footer.getAttribute("data-verdict-tone")).toBe("neutral");
    expect(footer.getAttribute("data-auto-advance")).toBe("held");
    expect(within(footer).getByText("Answer not verified")).toBeTruthy();
    expect(within(footer).queryByText(/Incorrect|Correct!/)).toBeNull();
    expect(screen.getByTestId("answer-grid").querySelector('[data-choice-state="correct"]')).toBeNull();
    expect(screen.queryByTestId("central-result")).toBeNull();
    expect(screen.queryByTestId("practice-advance-meter")).toBeNull();
    fireEvent.click(screen.getByTestId("practice-retry-answer"));
    expect(props.onRetryAnswer).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Skip question/ }));
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    expect(props.onAdvance).not.toHaveBeenCalled();
  });

  it("draws the question's own art in the stage's media region", () => {
    renderArena({ currentIndex: 1 });
    const media = screen.getByTestId("practice-question-media");
    expect(media.closest('[data-surface-region="media"]')).not.toBeNull();
    expect(media.getAttribute("data-visual-kind")).toBe("item");
    expect(within(media).getByRole("img", { name: "Infinity Edge" })).toBeTruthy();
  });

  it("draws picture choices as pictures through the canonical grid", () => {
    renderArena({ questions: [PICTURE_Q], currentIndex: 0 });
    const grid = screen.getByTestId("answer-grid");
    expect(within(grid).getByRole("img", { name: "Ahri" })).toBeTruthy();
    expect(within(grid).getByRole("img", { name: "Lux" })).toBeTruthy();
    // The choices ARE the pictures, so the stage draws no second picture.
    expect(screen.queryByTestId("practice-question-media")).toBeNull();
  });

  it("puts the subject and the run on the flanks, and no opponent, clock or rating", () => {
    renderArena({ score: 1, outcomes: [{ position: 0, isCorrect: true }], currentIndex: 1, sessionXp: 5 });
    expect(screen.getByTestId("practice-subject-name").textContent).toBe("Summoner Spells");
    expect(screen.getByTestId("practice-session-xp").textContent).toContain("+5");
    expect(screen.getByTestId("pro-play-session-panel")).toBeTruthy();
    expect(screen.queryByTestId("timer-value")).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/opponent|forfeit|matchmaking|\bLP\b|victory|defeat/i);
    expect(screen.queryByTestId("ranked-abilities")).toBeNull();
  });

  it("leaves report publication to the page (the arena publishes nothing)", () => {
    renderArena();
    expect(lastSnapshot).toBeNull();
  });

  it("renders loading and error states inside the arena frame", () => {
    const { unmount } = renderArena({ phase: "loading-questions", questions: [] });
    expect(screen.getByTestId("practice-loading").closest(".ranked-academy")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Summoner Spells");
    unmount();
    const { props } = renderArena({ phase: "error", questions: [], errorMessage: "No practice questions available." });
    expect(screen.getByRole("alert").textContent).toBe("No practice questions available.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });
});
