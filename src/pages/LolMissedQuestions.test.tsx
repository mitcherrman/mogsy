/**
 * Missed Question Bank states: Pro content, truthful Pro empty state,
 * Free paywall, no paywall flash while loading, and error handling that
 * never misrepresents a failure as non-Pro status.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LolMissedQuestions from "./LolMissedQuestions";
import type { MissedQuestionsResponse } from "@/lib/quiz/api";

const getMissedQuestions = vi.fn();

vi.mock("@/lib/quiz/api", () => ({
  quizApi: { getMissedQuestions: (...args: unknown[]) => getMissedQuestions(...args) },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: null, session: null }),
}));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: vi.fn().mockResolvedValue("token"),
}));

const PRO_DATA: MissedQuestionsResponse = {
  ok: true,
  is_pro: true,
  locked: false,
  total_count: 1,
  limit: 25,
  offset: 0,
  results: [
    {
      attempt_id: 11,
      question_id: 5,
      question_text: "Which item builds from B.F. Sword?",
      selected_answer: "Sunfire Aegis",
      correct_answer: "Infinity Edge",
      category: "Item Knowledge",
      difficulty: 2,
      missed_at: "2026-07-15 10:00:00",
      explanation: "Infinity Edge uses B.F. Sword.",
    },
  ],
};

const LOCKED: MissedQuestionsResponse = {
  ok: true,
  is_pro: false,
  locked: true,
  upsell_message: "Upgrade to Mogsy Pro to review every question you missed.",
  results: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <LolMissedQuestions />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getMissedQuestions.mockReset();
});
afterEach(cleanup);

describe("LolMissedQuestions", () => {
  it("does not flash the paywall while entitlement is loading", () => {
    getMissedQuestions.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.queryByText(/Upgrade to Mogsy Pro/)).toBeNull();
  });

  it("shows missed questions with no upgrade CTA for Pro users", async () => {
    getMissedQuestions.mockResolvedValue(PRO_DATA);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Which item builds from B.F. Sword?")).toBeTruthy(),
    );
    expect(screen.getByText(/Your answer: Sunfire Aegis/)).toBeTruthy();
    expect(screen.getByText(/Correct answer: Infinity Edge/)).toBeTruthy();
    expect(screen.queryByText(/Upgrade to Mogsy Pro/)).toBeNull();
  });

  it("shows a truthful empty state for Pro users with no misses", async () => {
    getMissedQuestions.mockResolvedValue({ ...PRO_DATA, results: [], total_count: 0 });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No missed questions — flawless so far!/)).toBeTruthy(),
    );
    expect(screen.queryByText(/Upgrade to Mogsy Pro/)).toBeNull();
  });

  it("shows the paywall for Free users, with the result-screen note", async () => {
    getMissedQuestions.mockResolvedValue(LOCKED);
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Upgrade to Mogsy Pro/ })).toBeTruthy(),
    );
    expect(
      screen.getByText(/Free players can review missed questions on each quiz’s results screen/),
    ).toBeTruthy();
  });

  it("shows an error, never the paywall, on server failure", async () => {
    getMissedQuestions.mockRejectedValue(new Error("Quiz API 500: Failed to load missed questions"));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Quiz API 500/)).toBeTruthy());
    expect(screen.queryByText(/Upgrade to Mogsy Pro/)).toBeNull();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
  });

  it("shows a session error, never the paywall, on 401", async () => {
    getMissedQuestions.mockRejectedValue(new Error("Quiz API 401: unauthorized"));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/couldn’t start a guest session/i)).toBeTruthy(),
    );
    expect(screen.queryByText(/Upgrade to Mogsy Pro/)).toBeNull();
  });

  it("treats an ok:false payload as an error, not the paywall or empty bank", async () => {
    getMissedQuestions.mockResolvedValue({ ok: false, error: "db", results: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText("Could not load missed questions.")).toBeTruthy());
    expect(screen.queryByText(/Upgrade to Mogsy Pro/)).toBeNull();
  });
});
