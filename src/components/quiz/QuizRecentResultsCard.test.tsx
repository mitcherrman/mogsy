/**
 * Recent Quiz Results card: honest labeling (session history, not ranked
 * matches), real data rendering, empty + sign-in states, and the real
 * history route.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuizRecentResultsCard from "./QuizRecentResultsCard";
import type { QuizHistoryResponse } from "@/lib/quiz/api";

const HISTORY: QuizHistoryResponse = {
  ok: true,
  is_pro: false,
  total_count: 9,
  limited: false,
  free_limit: 10,
  upsell_message: null,
  results: [
    { session_id: 4, date: "2026-07-16", completed_at: "2026-07-16 10:00:00", mode: "standard", category: "Item Knowledge", score: 9, total_questions: 10, accuracy: 90 },
    { session_id: 3, date: "2026-07-15", completed_at: "2026-07-15 10:00:00", mode: "daily", category: null, score: 3, total_questions: 5, accuracy: 60 },
    { session_id: 2, date: "2026-07-14", completed_at: "2026-07-14 10:00:00", mode: "standard", category: "Champion Basics", score: 1, total_questions: 10, accuracy: 10 },
    { session_id: 1, date: "2026-07-13", completed_at: "2026-07-13 10:00:00", mode: "standard", category: "Old", score: 5, total_questions: 10, accuracy: 50 },
  ],
};

function renderCard(props: Parameters<typeof QuizRecentResultsCard>[0]) {
  return render(
    <MemoryRouter>
      <QuizRecentResultsCard {...props} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("QuizRecentResultsCard", () => {
  it("is labeled as quiz results (not ranked matches) and shows the last 3 rows", () => {
    const { container } = renderCard({ history: HISTORY });
    expect(screen.getByText("Recent Quiz Results")).toBeTruthy();
    expect(screen.queryByText(/Ranked matches/i)).toBeNull();
    const rows = container.querySelectorAll('[data-testid="history-row"]');
    expect(rows.length).toBe(3); // capped at 3, 4 provided
    expect(rows[0].textContent).toContain("Item Knowledge");
    expect(rows[0].textContent).toContain("9/10");
    expect(rows[1].textContent).toContain("Daily");
    expect(screen.queryByText("Old")).toBeNull();
  });

  it("applies win-like green for high accuracy and muted red for low", () => {
    const { container } = renderCard({ history: HISTORY });
    const badges = container.querySelectorAll('[data-testid="history-row"] .shrink-0');
    const first = container.querySelectorAll('[data-testid="history-row"]')[0]
      .querySelector("[class*='emerald']");
    const third = container.querySelectorAll('[data-testid="history-row"]')[2]
      .querySelector("[class*='rose']");
    expect(first).not.toBeNull();
    expect(third).not.toBeNull();
    expect(badges.length).toBeGreaterThan(0);
  });

  it("summarizes sessions and rounded accuracy", () => {
    renderCard({ history: HISTORY });
    expect(screen.getByText("9")).toBeTruthy(); // total sessions
    // avg of shown rows (90+60+10)/3 = 53%
    expect(screen.getByText("53%")).toBeTruthy();
    expect(screen.getAllByText("90%").length).toBeGreaterThan(0); // best (badge + cell)
  });

  it("links to the real history route", () => {
    renderCard({ history: HISTORY });
    const link = screen.getByRole("link", { name: /View full history/ });
    expect(link.getAttribute("href")).toBe("/lol/history");
  });

  it("shows the honest empty state with a Play Ranked action", () => {
    const onPlayRanked = vi.fn();
    renderCard({ history: { ...HISTORY, results: [], total_count: 0 }, onPlayRanked });
    expect(screen.getByText("No quiz results yet")).toBeTruthy();
    expect(screen.getByText("Play your first quiz to begin your history.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Play Ranked/ }));
    expect(onPlayRanked).toHaveBeenCalledTimes(1);
  });

  it("shows the sign-in state for auth-shaped errors", () => {
    renderCard({ history: null, error: "Quiz API 401: unauthorized" });
    expect(screen.getByText("Sign in to save and review your quiz history.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Sign in/ }).getAttribute("href")).toBe("/auth");
  });

  it("renders a skeleton while loading", () => {
    const { container } = renderCard({ history: null, loading: true });
    expect(container.querySelector('[data-testid="history-skeleton"]')).not.toBeNull();
  });
});
