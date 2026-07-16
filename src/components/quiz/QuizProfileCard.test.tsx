/**
 * Rank-progress supporting copy: one concise summary line, no duplicated
 * rank/percent wording, calculation unchanged.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import QuizProfileCard from "./QuizProfileCard";
import type { QuizProgress } from "@/lib/quiz/api";

const PROGRESS: QuizProgress = {
  total_xp: 890,
  total_attempts: 31,
  correct_attempts: 21,
  accuracy: 67.74,
  current_streak: 8,
  best_streak: 8,
  xp: 890,
  progress_percent: 89.33,
  rank_name: "Bronze",
  next_rank_name: "Silver",
  xp_to_next: 120,
};

afterEach(cleanup);

describe("QuizProfileCard — rank progress copy", () => {
  it("shows one concise rounded summary instead of duplicated wording", () => {
    render(<QuizProfileCard progress={PROGRESS} achievements={[]} />);
    expect(screen.getByText("89% to Silver")).toBeTruthy();
    expect(screen.getByText(/120 XP/)).toBeTruthy();
    // Old duplicated variants are gone.
    expect(screen.queryByText(/Bronze → Silver/)).toBeNull();
    expect(screen.queryByText(/Next: Silver/)).toBeNull();
    expect(screen.queryByText("89.33%")).toBeNull();
  });

  it("keeps rank name, XP badge, and first-question prompt for empty progress", () => {
    render(
      <QuizProfileCard
        progress={{ total_attempts: 0, rank_name: "Unranked", progress_percent: 0 }}
        achievements={[]}
      />,
    );
    expect(screen.getByText("Unranked")).toBeTruthy();
    expect(screen.getByText("Play your first question to rank up")).toBeTruthy();
  });
});
