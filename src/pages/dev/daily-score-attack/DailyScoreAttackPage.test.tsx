import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    // No opponent-style UI anywhere in the game surface.
    expect(screen.queryByText(/\bHP\b|opponent|MMR|class|ability/i)).not.toBeInTheDocument();
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
