/**
 * Ranked placement card: the primary title is never ellipsized, the placement
 * badge reflows instead of squeezing the title, and all data survives the
 * compact mobile layout.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuizRankedQueueCard from "./QuizRankedQueueCard";
import type { RankedState } from "@/lib/quiz/featured-mock";

const PLACEMENT: RankedState = {
  placementMatchesRemaining: 5,
  isPlaced: false,
  estimatedGain: 25,
  estimatedLoss: 15,
};

afterEach(cleanup);

describe("QuizRankedQueueCard — placement state", () => {
  it("renders the full Placement Series title without truncation styling", () => {
    render(<QuizRankedQueueCard progress={null} ranked={PLACEMENT} onPlay={() => {}} />);
    const title = screen.getByRole("heading", { name: "Placement Series" });
    // The defect was `truncate` on the primary title ("Placeme..."); the badge
    // now wraps to its own row instead.
    expect(title.className).not.toContain("truncate");
    expect(title.parentElement!.parentElement!.className).toContain("flex-wrap");
  });

  it("keeps badge, remaining matches, XP values, and the Play action", () => {
    const onPlay = vi.fn();
    render(<QuizRankedQueueCard progress={null} ranked={PLACEMENT} onPlay={onPlay} />);
    expect(screen.getByText(/Placement 0\/5/)).toBeTruthy();
    expect(screen.getByText(/5 placement\s+matches remaining/)).toBeTruthy();
    expect(screen.getByText("+25")).toBeTruthy();
    expect(screen.getByText("−15")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Play Placement/ }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("shows the rank name and Queue Ranked once placed", () => {
    render(
      <QuizRankedQueueCard
        progress={{ rank_name: "Bronze" }}
        ranked={{ ...PLACEMENT, isPlaced: true, placementMatchesRemaining: 0 }}
        onPlay={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: "Bronze" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Queue Ranked/ })).toBeTruthy();
  });
});
