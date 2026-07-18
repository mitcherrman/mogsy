import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  fetchToday: vi.fn(),
  startOfficialRun: vi.fn(),
  startPracticeRun: vi.fn(),
  fetchCurrentRun: vi.fn(),
  submitAnswer: vi.fn(),
  finalizeRun: vi.fn(),
  fetchResults: vi.fn(),
  fetchHistory: vi.fn(),
  fetchQuestionImageObjectUrl: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({
  user: { is_anonymous: false } as { is_anonymous: boolean } | null,
}));

vi.mock("./dailyScoreAttackClient", async (importOriginal) => {
  const original = await importOriginal<typeof import("./dailyScoreAttackClient")>();
  return { ...original, ...clientMocks };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: sessionMock.user ? { user: sessionMock.user } : null },
      }),
    },
  },
}));

import DailyScoreAttackPage from "./DailyScoreAttackPage";
import { DsaApiError } from "./dailyScoreAttackClient";
import {
  activeRunFixture,
  historyFixture,
  resolutionFixture,
  resultsFixture,
  terminalRunFixture,
  todayFixture,
} from "./testFixtures";

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.user = { is_anonymous: false };
  clientMocks.fetchToday.mockResolvedValue(todayFixture);
  clientMocks.fetchHistory.mockResolvedValue(historyFixture);
  // Default: no resumable practice run on initial load.
  clientMocks.fetchCurrentRun.mockRejectedValue(new DsaApiError("NO_RUN", 404, "none"));
});

async function startIntoQuestion() {
  render(<DailyScoreAttackPage />);
  fireEvent.click(await screen.findByTestId("dsa-start-official"));
  expect(await screen.findByTestId("dsa-countdown")).toBeInTheDocument();
  // Countdown is cosmetic and precedes the creation request.
  expect(clientMocks.startOfficialRun).not.toHaveBeenCalled();
  return screen.findByTestId("dsa-question-text", {}, { timeout: 6000 });
}

describe("DailyScoreAttackPage", () => {
  it("shows unavailable when the feature is disabled", async () => {
    clientMocks.fetchToday.mockResolvedValue({ ...todayFixture, enabled: false });
    render(<DailyScoreAttackPage />);
    expect(await screen.findByTestId("dsa-unavailable")).toBeInTheDocument();
  });

  it("gates signed-out users away from official play but offers practice", async () => {
    sessionMock.user = null;
    render(<DailyScoreAttackPage />);
    expect(await screen.findByTestId("dsa-signin-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("dsa-start-official")).not.toBeInTheDocument();
    expect(screen.getByTestId("dsa-start-practice")).toBeInTheDocument();
  });

  it("plays a question with server-authoritative reveal", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(activeRunFixture());
    clientMocks.submitAnswer.mockResolvedValue(resolutionFixture());
    await startIntoQuestion();

    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(4);
    expect(screen.getByTestId("dsa-timer")).toBeInTheDocument();
    expect(screen.getByTestId("dsa-score")).toHaveTextContent("0");

    fireEvent.click(options[0]);
    const reveal = await screen.findByTestId("dsa-reveal");
    expect(reveal).toHaveTextContent("Correct!");
    expect(screen.getByTestId("dsa-reveal-score")).toHaveTextContent("+200");
    expect(clientMocks.submitAnswer).toHaveBeenCalledWith("run-1", 1, 0);
    // No opponent-style combat UI anywhere in the game surface. (The reveal now
    // holds the answered question, whose quiz text legitimately contains words
    // like "Ability"/"class" — so this guards the combat-panel tokens only.)
    expect(screen.queryByText(/\bHP\b|opponent|\bMMR\b/i)).not.toBeInTheDocument();
  });

  it("renders question media from an opaque blob URL, never the raw path", async () => {
    const withImage = activeRunFixture();
    withImage.question = {
      ...withImage.question!,
      has_image: true,
      image_url: "/api/daily-score-attack/runs/run-1/questions/1/image",
    };
    clientMocks.startOfficialRun.mockResolvedValue(withImage);
    clientMocks.fetchQuestionImageObjectUrl.mockResolvedValue("blob:mock-object-url");
    await startIntoQuestion();

    const img = await screen.findByTestId("dsa-question-media");
    expect(img).toHaveAttribute("src", "blob:mock-object-url");
    expect(img).toHaveAttribute("alt", "Question image");
    // The fetch used the opaque endpoint; the DOM src is a blob (no champion name).
    expect(clientMocks.fetchQuestionImageObjectUrl).toHaveBeenCalledWith(
      "/api/daily-score-attack/runs/run-1/questions/1/image",
      expect.anything(),
    );
    expect(document.body.innerHTML).not.toMatch(/champions\/|Aatrox|\.png/i);
  });

  it("degrades gracefully when question media fails to load", async () => {
    const withImage = activeRunFixture();
    withImage.question = {
      ...withImage.question!,
      has_image: true,
      image_url: "/api/daily-score-attack/runs/run-1/questions/1/image",
    };
    clientMocks.startOfficialRun.mockResolvedValue(withImage);
    clientMocks.fetchQuestionImageObjectUrl.mockRejectedValue(new Error("media 500"));
    await startIntoQuestion();

    expect(await screen.findByTestId("dsa-question-media-error")).toHaveTextContent(
      "Question image unavailable",
    );
    // The question and answer grid remain usable despite the media failure.
    expect(screen.getByTestId("dsa-question-text")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("locks controls while submitting and shows no local correctness", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(activeRunFixture());
    let releaseSubmit: (value: unknown) => void = () => {};
    clientMocks.submitAnswer.mockImplementation(
      () => new Promise((resolve) => { releaseSubmit = resolve; }),
    );
    await startIntoQuestion();
    fireEvent.click(screen.getAllByRole("radio")[1]);
    await waitFor(() => {
      for (const option of screen.getAllByRole("radio")) expect(option).toBeDisabled();
    });
    expect(screen.queryByTestId("dsa-reveal")).not.toBeInTheDocument();
    releaseSubmit(resolutionFixture({ is_correct: false, awarded_score: 0, combo_after: 0 }));
    expect(await screen.findByTestId("dsa-reveal")).toHaveTextContent("Incorrect");
  });

  it("renders official results with rewards and history", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(terminalRunFixture({ resumed: true }));
    clientMocks.fetchResults.mockResolvedValue(resultsFixture());
    render(<DailyScoreAttackPage />);
    fireEvent.click(await screen.findByTestId("dsa-start-official"));
    expect(await screen.findByTestId("dsa-final-score", {}, { timeout: 6000 })).toHaveTextContent(
      "200",
    );
    expect(screen.getByTestId("dsa-results-badge")).toHaveTextContent(/official/i);
    expect(screen.getByTestId("dsa-rewards")).toHaveTextContent("+250 XP awarded");
    expect(screen.getByTestId("dsa-history")).toBeInTheDocument();
    expect(screen.getByTestId("dsa-accuracy")).toHaveTextContent("100%");
  });

  it("results survive a history failure", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(terminalRunFixture());
    clientMocks.fetchResults.mockResolvedValue(resultsFixture());
    clientMocks.fetchHistory.mockRejectedValue(new Error("offline"));
    render(<DailyScoreAttackPage />);
    fireEvent.click(await screen.findByTestId("dsa-start-official"));
    expect(await screen.findByTestId("dsa-final-score", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.queryByTestId("dsa-history")).not.toBeInTheDocument();
  });

  it("labels practice results and their non-reward status", async () => {
    sessionMock.user = { is_anonymous: true };
    clientMocks.startPracticeRun.mockResolvedValue(
      terminalRunFixture({ official: false, resumed: false }),
    );
    clientMocks.fetchResults.mockResolvedValue(resultsFixture({ official: false }));
    render(<DailyScoreAttackPage />);
    fireEvent.click(await screen.findByTestId("dsa-start-practice"));
    expect(await screen.findByTestId("dsa-practice-note", {}, { timeout: 6000 })).toHaveTextContent(
      "No XP",
    );
    expect(screen.getByTestId("dsa-results-badge")).toHaveTextContent(/practice/i);
  });
});

// The player-facing Time Trial reveal must hold the resolved question for exactly
// TIME_TRIAL_RESULT_HOLD_MS (900 ms) before advancing, while the authoritative
// 90s run timer keeps counting. These drive the page on fake timers to prove the
// precise hold boundary and its cancellation guarantees.
describe("Time Trial 900ms result hold", () => {
  const HOLD_MS = 900;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // Advance fake timers and flush the resolved microtasks (network mocks) inside act.
  async function tick(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  // Drive from mount through the cosmetic countdown into the first active question.
  async function driveToQuestion(startTestId: string) {
    render(<DailyScoreAttackPage />);
    await tick(0); // flush metadata/session/current-run load
    fireEvent.click(screen.getByTestId(startTestId));
    await tick(2400); // 3 cosmetic countdown ticks at 800ms
    await tick(0); // flush the run-creation request
    expect(screen.getByTestId("dsa-question-text")).toHaveTextContent(
      "Which item grants Ability Power?",
    );
  }

  async function submitFirstAnswer() {
    fireEvent.click(screen.getAllByRole("radio")[0]);
    await tick(0); // flush submitAnswer → RESOLUTION_RECEIVED
    expect(screen.getByTestId("dsa-reveal")).toBeInTheDocument();
  }

  // The correct-choice button carries data-choice-state="correct".
  function correctChoice(): Element | null {
    return document.querySelector('[data-choice-state="correct"]');
  }
  function choiceTexts(): string[] {
    // Strip the sr-only " (correct answer)" suffix the correct choice carries.
    return screen
      .getAllByRole("radio")
      .map((el) => (el.textContent ?? "").replace(" (correct answer)", ""));
  }

  it("holds the answered question and correct answer visible for 900ms (official)", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(activeRunFixture());
    clientMocks.submitAnswer.mockResolvedValue(resolutionFixture()); // correct, index 0
    await driveToQuestion("dsa-start-official");
    // Sanity: choose the (correct) first answer of the answered question.
    await submitFirstAnswer();

    // Immediately after resolution the ANSWERED question stays rendered with its
    // ORIGINAL choices, correct/incorrect styling shows, the server-indicated
    // correct answer is highlighted, controls lock, and the NEXT question's text
    // and choices are NOT rendered.
    expect(screen.getByTestId("dsa-reveal")).toHaveTextContent("Correct!");
    expect(screen.getByTestId("dsa-question-text")).toHaveTextContent(
      "Which item grants Ability Power?",
    );
    expect(choiceTexts()).toEqual([
      "Rabadon's Deathcap",
      "Infinity Edge",
      "Warmog's Armor",
      "Trinity Force",
    ]);
    expect(correctChoice()).toHaveTextContent("Rabadon's Deathcap");
    for (const option of screen.getAllByRole("radio")) expect(option).toBeDisabled();
    expect(screen.queryByText("Which item grants Attack Damage?")).not.toBeInTheDocument();
    expect(screen.queryByText(/Rod of Ages/)).not.toBeInTheDocument();

    // At 899ms the answered question and its correct highlight remain, controls
    // stay locked, and the next question is still not rendered.
    await tick(HOLD_MS - 1);
    expect(screen.getByTestId("dsa-question-text")).toHaveTextContent(
      "Which item grants Ability Power?",
    );
    expect(correctChoice()).toHaveTextContent("Rabadon's Deathcap");
    for (const option of screen.getAllByRole("radio")) expect(option).toBeDisabled();
    expect(screen.queryByText("Which item grants Attack Damage?")).not.toBeInTheDocument();

    // At/after 900ms the next authoritative question appears exactly once
    // (+50ms transition settle); the reveal clears and controls unlock.
    await tick(1);
    await tick(50);
    expect(screen.queryByTestId("dsa-reveal")).not.toBeInTheDocument();
    expect(screen.getByTestId("dsa-question-text")).toHaveTextContent(
      "Which item grants Attack Damage?",
    );
    expect(choiceTexts()).toEqual([
      "Rod of Ages",
      "Infinity Edge",
      "Sunfire Aegis",
      "Rylai's",
    ]);
    for (const option of screen.getAllByRole("radio")) expect(option).not.toBeDisabled();
  });

  it("highlights the server correct answer and marks the wrong selection during the hold", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(activeRunFixture());
    // Wrong pick at index 1; server says correct is index 0.
    clientMocks.submitAnswer.mockResolvedValue(
      resolutionFixture({ is_correct: false, selected_index: 1, correct_index: 0, awarded_score: 0, combo_after: 0 }),
    );
    await driveToQuestion("dsa-start-official");
    fireEvent.click(screen.getAllByRole("radio")[1]);
    await tick(0);

    expect(screen.getByTestId("dsa-reveal")).toHaveTextContent("Incorrect");
    const options = screen.getAllByRole("radio");
    expect(options[0]).toHaveAttribute("data-choice-state", "correct"); // server correct
    expect(options[0]).toHaveTextContent("Rabadon's Deathcap");
    expect(options[1]).toHaveAttribute("data-choice-state", "incorrect-selected"); // my pick
    // Highlight persists across the hold.
    await tick(HOLD_MS - 1);
    expect(screen.getAllByRole("radio")[0]).toHaveAttribute("data-choice-state", "correct");
  });

  it("uses the same 900ms answered-question hold for practice runs", async () => {
    sessionMock.user = { is_anonymous: true };
    clientMocks.startPracticeRun.mockResolvedValue(activeRunFixture({ official: false }));
    // Default resolution advances the run to the distinct next question (seq 2).
    clientMocks.submitAnswer.mockResolvedValue(resolutionFixture());
    await driveToQuestion("dsa-start-practice");
    await submitFirstAnswer();

    await tick(HOLD_MS - 1);
    expect(screen.getByTestId("dsa-reveal")).toBeInTheDocument();
    expect(screen.getByTestId("dsa-question-text")).toHaveTextContent(
      "Which item grants Ability Power?",
    );
    expect(correctChoice()).toHaveTextContent("Rabadon's Deathcap");
    await tick(1 + 50);
    expect(screen.queryByTestId("dsa-reveal")).not.toBeInTheDocument();
    expect(screen.getByTestId("dsa-question-text")).toHaveTextContent(
      "Which item grants Attack Damage?",
    );
  });

  it("shows the answered question's media during the hold, then the next question's", async () => {
    const answeredImg = "/api/daily-score-attack/runs/run-1/questions/1/image";
    const nextImg = "/api/daily-score-attack/runs/run-1/questions/2/image";
    const answeredRun = activeRunFixture();
    answeredRun.question = { ...answeredRun.question!, has_image: true, image_url: answeredImg };
    const nextRun = activeRunFixture({ sequence: 2 });
    nextRun.question = {
      sequence: 2,
      question_id: 102,
      question_text: "Which item grants Attack Damage?",
      choices: ["Rod of Ages", "Infinity Edge", "Sunfire Aegis", "Rylai's"],
      difficulty_label: "medium",
      category: "Items",
      has_image: true,
      image_url: nextImg,
    };
    clientMocks.startOfficialRun.mockResolvedValue(answeredRun);
    clientMocks.submitAnswer.mockResolvedValue(resolutionFixture({ run: nextRun }));
    // Distinct blob per source path; track revokes.
    clientMocks.fetchQuestionImageObjectUrl.mockImplementation((url: string) =>
      Promise.resolve(`blob:${url}`),
    );
    if (typeof URL.revokeObjectURL !== "function") {
      (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    }
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    await driveToQuestion("dsa-start-official");
    await tick(0); // flush the active question's media fetch
    expect(screen.getByTestId("dsa-question-media")).toHaveAttribute("src", `blob:${answeredImg}`);

    await submitFirstAnswer();
    // During the hold the ANSWERED image is still shown; the next image has not
    // been requested and the answered blob has not been revoked yet.
    await tick(HOLD_MS - 1);
    expect(screen.getByTestId("dsa-question-media")).toHaveAttribute("src", `blob:${answeredImg}`);
    expect(clientMocks.fetchQuestionImageObjectUrl).not.toHaveBeenCalledWith(
      nextImg,
      expect.anything(),
    );
    expect(revokeSpy).not.toHaveBeenCalledWith(`blob:${answeredImg}`);

    // After the hold the next question's media loads and the stale answered blob
    // is revoked.
    await tick(1 + 50);
    await tick(0); // flush next media fetch
    expect(clientMocks.fetchQuestionImageObjectUrl).toHaveBeenCalledWith(nextImg, expect.anything());
    expect(screen.getByTestId("dsa-question-media")).toHaveAttribute("src", `blob:${nextImg}`);
    expect(revokeSpy).toHaveBeenCalledWith(`blob:${answeredImg}`);
    revokeSpy.mockRestore();
  });

  it("keeps the authoritative timer counting down during the hold", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(activeRunFixture());
    // Next-question projection starts just below a whole second so a sub-900ms
    // advance crosses a second boundary in the display.
    clientMocks.submitAnswer.mockResolvedValue(
      resolutionFixture({
        run: activeRunFixture({
          sequence: 2,
          remaining_ms: 89_600,
          question: {
            sequence: 2,
            question_id: 102,
            question_text: "Which item grants Attack Damage?",
            choices: ["Rod of Ages", "Infinity Edge", "Sunfire Aegis", "Rylai's"],
            difficulty_label: "medium",
            category: "Items",
            has_image: false,
            image_url: null,
          },
        }),
      }),
    );
    await driveToQuestion("dsa-start-official");
    await submitFirstAnswer();

    const timer = screen.getByTestId("dsa-timer");
    expect(timer).toHaveTextContent("1:30"); // ceil(89.6s)
    await tick(800); // still within the 900ms hold; timer ticks at 250ms cadence
    expect(screen.getByTestId("dsa-reveal")).toBeInTheDocument(); // hold ongoing
    expect(screen.getByTestId("dsa-timer")).toHaveTextContent("1:29"); // ceil(88.85s)
  });

  it("lets run completion during the hold win over advancing", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(activeRunFixture());
    clientMocks.submitAnswer.mockResolvedValue(
      resolutionFixture({ run: terminalRunFixture() }),
    );
    clientMocks.fetchResults.mockResolvedValue(resultsFixture());
    await driveToQuestion("dsa-start-official");
    await submitFirstAnswer();

    await tick(HOLD_MS + 50);
    await tick(0); // flush terminal results + history load
    await tick(0);
    // Terminal state wins: the run does not advance to another active question,
    // and the server results are shown instead.
    expect(screen.queryByTestId("dsa-reveal")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByTestId("dsa-final-score")).toBeInTheDocument();
  });

  it("clears the hold timer on unmount without advancing", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(activeRunFixture());
    clientMocks.submitAnswer.mockResolvedValue(resolutionFixture());

    const { unmount } = render(<DailyScoreAttackPage />);
    await tick(0);
    fireEvent.click(screen.getByTestId("dsa-start-official"));
    await tick(2400);
    await tick(0);
    fireEvent.click(screen.getAllByRole("radio")[0]);
    await tick(0);
    expect(screen.getByTestId("dsa-reveal")).toBeInTheDocument();

    // Unmount mid-hold, then advance well past the hold. The reveal effect's
    // cleanup must clear the pending timer so nothing renders afterward and no
    // stale advance occurs (advancing must not throw).
    unmount();
    await tick(HOLD_MS + 200);

    expect(screen.queryByTestId("dsa-reveal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dsa-question-text")).not.toBeInTheDocument();
  });
});
