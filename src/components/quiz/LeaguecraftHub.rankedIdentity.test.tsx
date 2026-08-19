/**
 * RE1 Phase 4B — the LC1 Leaguecraft hub forwards the RANKED five-tier
 * standing to its hero, and the legacy Academy/quiz rank cannot reach the
 * competitive identity through that path.
 *
 * These assertions run against the real LC1 hub composition (not the hero in
 * isolation), so they also pin that the correction did not disturb the LC1
 * section order or the hub's fetch-nothing contract.
 */
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import LeaguecraftHub from "./LeaguecraftHub";
import type { RankedState } from "@/lib/quiz/featured-mock";
import type { RankedProgressionView } from "@/lib/ranked-public/contracts";

afterEach(cleanup);

const PLACED: RankedState = {
  placementMatchesRemaining: 0,
  isPlaced: true,
  estimatedGain: 25,
  estimatedLoss: 15,
};

const PROGRESSION: RankedProgressionView = {
  rating: 1320,
  tier: "diamond",
  nextTier: "challenger",
  nextTierRating: 1450,
  ratingToNext: 130,
  progressPercent: 13,
  rated: true,
  matchesRated: 40,
};

function renderHub(over: Partial<React.ComponentProps<typeof LeaguecraftHub>> = {}) {
  return rtlRender(
    <MemoryRouter>
      <LeaguecraftHub
        // Legacy Academy ladder values, deliberately loud and contradictory.
        progress={{ rank_name: "Grandmaster", next_rank_name: "Iron", progress_percent: 99 }}
        ranked={PLACED}
        onPlayRanked={() => {}}
        sets={[]}
        setsLoading={false}
        onSelectSet={() => {}}
        onRefreshSets={() => {}}
        history={null}
        historyLoading={false}
        historyError={null}
        rankedProgression={PROGRESSION}
        {...over}
      />
    </MemoryRouter>,
  );
}

describe("LeaguecraftHub — Ranked identity (RE1 Phase 4B)", () => {
  it("shows the Ranked tier and rating from ranked_tier, not the quiz rank", () => {
    const { container } = renderHub();
    expect(screen.getByRole("heading", { name: "Ranked Diamond" })).toBeTruthy();
    expect(screen.getByTestId("hub-ranked-rating").textContent).toContain("1320 Ranked rating");
    expect(screen.getByTestId("rank-progress").textContent).toContain("130 rating to Challenger");
    // The Academy ladder never reaches the competitive identity.
    expect(container.textContent).not.toContain("Grandmaster");
    expect(container.textContent).not.toContain("Iron");
  });

  it("stays usable and neutral when Ranked progression is unavailable", () => {
    const { container } = renderHub({ rankedProgression: null });
    expect(screen.getByRole("heading", { name: "Unranked" })).toBeTruthy();
    expect(screen.queryByTestId("hub-ranked-rating")).toBeNull();
    expect(container.textContent).not.toContain("Grandmaster");
    expect(screen.getByRole("button", { name: /^Play$/ })).toBeTruthy();
  });

  it("preserves the LC1 hub structure and section order", () => {
    const { container } = renderHub();
    const ranked = container.querySelector('[data-testid="hub-ranked-section"]')!;
    const recent = container.querySelector('[data-testid="hub-recent-section"]')!;
    const practice = container.querySelector('[data-testid="hub-practice-section"]')!;
    for (const el of [ranked, recent, practice]) expect(el).not.toBeNull();
    // Ranked hero first, then the secondary row — the LC1 hierarchy.
    expect(ranked.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recent.compareDocumentPosition(practice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ranked.querySelector('[data-testid="ranked-hero"]')).not.toBeNull();
    expect(screen.getByTestId("hero-stat-strip")).toBeTruthy();
  });
});
