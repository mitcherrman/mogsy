import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import QuizScoreAttackCard from "./QuizScoreAttackCard";
import type { DsaToday } from "@/pages/dev/daily-score-attack/dailyScoreAttackTypes";

const baseToday: DsaToday = {
  schema_version: "daily_score_attack.today.v1",
  enabled: true,
  challenge_date: "2026-07-17",
  challenge_version: 1,
  rules_version: 1,
  question_count: 30,
  run_duration_seconds: 90,
  seconds_until_reset: 3600,
  official_run: null,
  auth_required_for_official: true,
  practice_available: true,
  legacy_completed_today: false,
  daily_streak: 0,
};

function renderCard(today: Partial<DsaToday>, hasAccount = true) {
  return render(
    <MemoryRouter>
      <QuizScoreAttackCard today={{ ...baseToday, ...today }} hasAccount={hasAccount} />
    </MemoryRouter>,
  );
}

describe("QuizScoreAttackCard", () => {
  it("shows the available state with a play CTA to /quiz/daily", () => {
    renderCard({});
    expect(screen.getByTestId("hub-score-attack-card")).toHaveTextContent("Daily Score Attack");
    expect(screen.getByTestId("score-attack-status")).toHaveTextContent("One official run per day");
    const link = screen.getByTestId("score-attack-cta").querySelector("a") ?? screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/quiz/daily");
    expect(screen.getByRole("link")).toHaveTextContent("Play now");
  });

  it("shows resume state for an active official run", () => {
    renderCard({
      official_run: { run_id: "r", status: "active", score: 0, completed_at: null },
    });
    expect(screen.getByRole("link")).toHaveTextContent("Resume run");
  });

  it("shows the official score for a terminal run", () => {
    renderCard({
      official_run: { run_id: "r", status: "expired", score: 1234, completed_at: "x" },
    });
    expect(screen.getByTestId("score-attack-status")).toHaveTextContent("1,234");
    expect(screen.getByRole("link")).toHaveTextContent("View results & practice");
  });

  it("shows sign-in guidance for anonymous sessions", () => {
    renderCard({}, false);
    expect(screen.getByTestId("score-attack-status")).toHaveTextContent("Sign in");
  });

  it("shows streak and legacy transition note", () => {
    renderCard({ daily_streak: 4, legacy_completed_today: true });
    expect(screen.getByTestId("score-attack-streak")).toHaveTextContent("4 days");
    expect(screen.getByTestId("score-attack-transition-note")).toHaveTextContent(
      "already earned",
    );
  });

  it("never links to the dev route or shows leaderboard/percentile", () => {
    renderCard({});
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toContain("/dev/");
    }
    expect(screen.queryByText(/leaderboard|percentile|rank/i)).not.toBeInTheDocument();
  });
});
