/**
 * Production /quiz/daily surface: shares the core implementation with the
 * dev route, drops the prototype banner, and mounts ads only on the entry
 * and settled-results surfaces — never during active gameplay.
 */
import { fireEvent, render, screen } from "@testing-library/react";
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
}));
const trackMock = vi.hoisted(() => vi.fn());

vi.mock("./dev/daily-score-attack/dailyScoreAttackClient", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("./dev/daily-score-attack/dailyScoreAttackClient")
  >();
  return { ...original, ...clientMocks };
});

vi.mock("@/components/ads/AdSlot", () => ({
  default: ({ placement }: { placement: string }) => (
    <div data-testid={`ad-${placement}`} />
  ),
}));

vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: trackMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { is_anonymous: false } } },
      }),
    },
  },
}));

import QuizDailyScoreAttack from "./QuizDailyScoreAttack";
import { DsaApiError } from "./dev/daily-score-attack/dailyScoreAttackClient";
import {
  activeRunFixture,
  historyFixture,
  resolutionFixture,
  resultsFixture,
  terminalRunFixture,
  todayFixture,
} from "./dev/daily-score-attack/testFixtures";

beforeEach(() => {
  vi.clearAllMocks();
  clientMocks.fetchToday.mockResolvedValue(todayFixture);
  clientMocks.fetchHistory.mockResolvedValue(historyFixture);
  // Default: no resumable practice run on initial load.
  clientMocks.fetchCurrentRun.mockRejectedValue(new DsaApiError("NO_RUN", 404, "none"));
});

describe("QuizDailyScoreAttack (production)", () => {
  it("shows no prototype banner and an entry ad", async () => {
    render(<QuizDailyScoreAttack />);
    await screen.findByTestId("dsa-start-official");
    expect(screen.queryByText(/dev prototype/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("ad-daily_score_attack_entry")).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("dsa_entry_viewed", expect.anything());
  });

  it("renders no ad in countdown, active question, or reveal", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(activeRunFixture());
    clientMocks.submitAnswer.mockResolvedValue(resolutionFixture());
    render(<QuizDailyScoreAttack />);
    fireEvent.click(await screen.findByTestId("dsa-start-official"));
    // countdown
    await screen.findByTestId("dsa-countdown");
    expect(screen.queryByTestId(/^ad-/)).not.toBeInTheDocument();
    // active question
    await screen.findByTestId("dsa-question-text", {}, { timeout: 6000 });
    expect(screen.queryByTestId(/^ad-/)).not.toBeInTheDocument();
    // reveal
    fireEvent.click(screen.getAllByRole("radio")[0]);
    await screen.findByTestId("dsa-reveal");
    expect(screen.queryByTestId(/^ad-/)).not.toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("dsa_official_started");
    expect(trackMock).toHaveBeenCalledWith("dsa_answer_resolved", {
      sequence: 1,
      is_correct: true,
      official: true,
    });
  });

  it("mounts the results ad only after results settle", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(terminalRunFixture({ resumed: true }));
    clientMocks.fetchResults.mockResolvedValue(resultsFixture());
    render(<QuizDailyScoreAttack />);
    fireEvent.click(await screen.findByTestId("dsa-start-official"));
    await screen.findByTestId("dsa-final-score", {}, { timeout: 6000 });
    expect(screen.getByTestId("ad-daily_score_attack_results")).toBeInTheDocument();
    expect(screen.queryByTestId("ad-daily_score_attack_entry")).not.toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("dsa_results_viewed", { official: true });
    expect(trackMock).toHaveBeenCalledWith("dsa_official_resumed");
  });

  it("sends no question or answer content in analytics payloads", async () => {
    clientMocks.startOfficialRun.mockResolvedValue(activeRunFixture());
    clientMocks.submitAnswer.mockResolvedValue(resolutionFixture());
    render(<QuizDailyScoreAttack />);
    fireEvent.click(await screen.findByTestId("dsa-start-official"));
    await screen.findByTestId("dsa-question-text", {}, { timeout: 6000 });
    fireEvent.click(screen.getAllByRole("radio")[0]);
    await screen.findByTestId("dsa-reveal");
    const serialized = JSON.stringify(trackMock.mock.calls);
    expect(serialized).not.toMatch(/Ability Power|Deathcap|question_text|choices/);
  });
});
