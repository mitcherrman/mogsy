/**
 * Quiz History page states: loading, populated, true empty, auth failure,
 * server error, non-ok payload, and the Free-limit upsell. A backend or
 * auth failure must never render as "No completed quizzes yet."
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LolHistory from "./LolHistory";
import type { QuizHistoryResponse } from "@/lib/quiz/api";

const getHistory = vi.fn();

vi.mock("@/lib/quiz/api", () => ({
  quizApi: { getHistory: (...args: unknown[]) => getHistory(...args) },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: null, session: null }),
}));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: vi.fn().mockResolvedValue("token"),
}));

const HISTORY: QuizHistoryResponse = {
  ok: true,
  is_pro: false,
  total_count: 2,
  limited: false,
  free_limit: 10,
  upsell_message: null,
  results: [
    { session_id: 2, date: "2026-07-16 10:00:00", completed_at: "2026-07-16 10:00:00", mode: "standard", category: "Item Knowledge", score: 9, total_questions: 10, accuracy: 90, duration_seconds: 120 },
    { session_id: 1, date: "2026-07-15 10:00:00", completed_at: "2026-07-15 10:00:00", mode: "daily", category: null, score: 3, total_questions: 5, accuracy: 60, duration_seconds: 60 },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <LolHistory />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getHistory.mockReset();
});
afterEach(cleanup);

describe("LolHistory", () => {
  it("shows skeletons while loading", () => {
    getHistory.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelectorAll(".rounded-xl").length).toBeGreaterThan(0);
    expect(screen.queryByText("No completed quizzes yet.")).toBeNull();
  });

  it("renders completed sessions", async () => {
    getHistory.mockResolvedValue(HISTORY);
    renderPage();
    await waitFor(() => expect(screen.getByText("9/10")).toBeTruthy());
    expect(screen.getByText("Daily Challenge")).toBeTruthy();
    expect(screen.getByText("Item Knowledge")).toBeTruthy();
    expect(screen.queryByText("No completed quizzes yet.")).toBeNull();
  });

  it("shows the true empty state only on a genuine ok+empty response", async () => {
    getHistory.mockResolvedValue({ ...HISTORY, results: [], total_count: 0 });
    renderPage();
    await waitFor(() => expect(screen.getByText("No completed quizzes yet.")).toBeTruthy());
    expect(screen.getByRole("link", { name: /Play a quiz/ }).getAttribute("href")).toBe("/quiz");
  });

  it("shows a session error, not the empty state, on 401", async () => {
    getHistory.mockRejectedValue(new Error("Quiz API 401: unauthorized"));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/couldn’t start a guest session/i)).toBeTruthy(),
    );
    expect(screen.queryByText("No completed quizzes yet.")).toBeNull();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
  });

  it("shows a retryable error, not the empty state, on server error", async () => {
    getHistory.mockRejectedValue(new Error("Quiz API 500: Failed to load quiz history"));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Quiz API 500/)).toBeTruthy());
    expect(screen.queryByText("No completed quizzes yet.")).toBeNull();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
  });

  it("treats an ok:false payload as an error, not empty history", async () => {
    getHistory.mockResolvedValue({ ok: false, error: "db", results: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText("Could not load quiz history.")).toBeTruthy());
    expect(screen.queryByText("No completed quizzes yet.")).toBeNull();
  });

  it("shows the Free-limit upsell when the backend flags history as limited", async () => {
    getHistory.mockResolvedValue({
      ...HISTORY,
      limited: true,
      total_count: 14,
      upsell_message: "Free accounts save your last 10 results.",
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Free accounts save your last 10 results/)).toBeTruthy(),
    );
    expect(screen.getByRole("link", { name: /Unlock Full History/ }).getAttribute("href")).toBe("/lol/pro");
  });
});
