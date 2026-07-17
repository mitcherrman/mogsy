/**
 * Ranked placement card: the primary title is never ellipsized, the placement
 * badge reflows instead of squeezing the title, and all data survives the
 * compact mobile layout.
 */
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

// The hero contains a <Link> (View full profile), so every render needs a router.
function render(ui: React.ReactElement) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}


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
    // No placement/unranked messaging once placed.
    expect(screen.queryByText("Unranked")).toBeNull();
    expect(screen.queryByText(/establish your starting rank/)).toBeNull();
  });

  it("absorbs the compact progress strip + profile link (no separate card needed)", () => {
    render(
      <QuizRankedQueueCard
        progress={{ current_streak: 4, best_streak: 9, accuracy: 67.74, attempts: 42 }}
        ranked={PLACEMENT}
        onPlay={() => {}}
      />,
    );
    const strip = screen.getByTestId("hero-stat-strip");
    expect(strip.textContent).toContain("Current streak");
    expect(strip.textContent).toContain("Best streak");
    expect(strip.textContent).toContain("68%"); // rounded, never 67.74%
    expect(strip.textContent).not.toContain("67.74");
    expect(strip.textContent).toContain("42");
    expect(screen.getByRole("link", { name: /View full profile/ }).getAttribute("href")).toBe(
      "/profile",
    );
  });

  it("placed: shows rounded XP progress toward the next rank", () => {
    render(
      <QuizRankedQueueCard
        progress={{ rank_name: "Bronze", next_rank_name: "Silver", progress_percent: 41.9 }}
        ranked={{ ...PLACEMENT, isPlaced: true, placementMatchesRemaining: 0 }}
        onPlay={() => {}}
      />,
    );
    expect(screen.getByTestId("rank-progress").textContent).toContain("42% to Silver");
  });

  it("hero copy: communicates competitive 1v1 matches and mechanics", () => {
    render(<QuizRankedQueueCard progress={null} ranked={PLACEMENT} onPlay={() => {}} />);
    expect(screen.getByText("Ranked Quiz")).toBeTruthy();
    expect(
      screen.getByText("Face other players in synchronized 1v1 League knowledge matches."),
    ).toBeTruthy();
    expect(screen.getByText(/Shared questions · HP combat · XP and ranks/)).toBeTruthy();
  });

  it("unplaced: shows Unranked + placement explanation, never a provisional rank", () => {
    // Even when the progress endpoint carries a default Bronze rank object,
    // the unplaced hero must read Unranked with the unranked emblem — no
    // finalized-looking rank name or icon.
    render(
      <QuizRankedQueueCard
        progress={{ rank_name: "Bronze", rank_icon: "assets/ranks/bronze.png" }}
        ranked={{ ...PLACEMENT, placementMatchesRemaining: 3 }}
        onPlay={() => {}}
      />,
    );
    expect(screen.getByText("Unranked")).toBeTruthy();
    expect(
      screen.getByText("Complete your placement matches to establish your starting rank."),
    ).toBeTruthy();
    expect(screen.getByText(/Placement 2\/5/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Bronze" })).toBeNull();
    const img = screen.getByRole("img", { name: "Unranked" }) as HTMLImageElement;
    expect(img.src).toContain("unranked");
    expect(img.src).not.toContain("bronze");
  });
});
