/**
 * RE1 Phase 3B — Ranked tier presentation.
 *
 * The panel renders what the backend derived and nothing else: no threshold
 * is recomputed here, Academy crown art is never used, and no legacy League
 * tier name can appear.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RankedTierPanel } from "./RankedTierPanel";
import type { RankedProgressionView } from "@/lib/ranked-public/contracts";

function view(over: Partial<RankedProgressionView> = {}): RankedProgressionView {
  return {
    rating: 1200,
    tier: "gold",
    nextTier: "diamond",
    nextTierRating: 1300,
    ratingToNext: 100,
    progressPercent: 20,
    rated: true,
    matchesRated: 8,
    ...over,
  };
}

const TIER_CASES = [
  { tier: "bronze", rating: 1020, next: "silver", nextRating: 1075 },
  { tier: "silver", rating: 1100, next: "gold", nextRating: 1175 },
  { tier: "gold", rating: 1200, next: "diamond", nextRating: 1300 },
  { tier: "diamond", rating: 1350, next: "challenger", nextRating: 1450 },
] as const;

describe("emblem rendering", () => {
  it.each(TIER_CASES)("renders the Riot $tier emblem", ({ tier, rating, next, nextRating }) => {
    render(<RankedTierPanel progression={view({
      tier, rating, nextTier: next, nextTierRating: nextRating,
    })} />);
    const img = screen.getByTestId("ranked-tier-emblem") as HTMLImageElement;
    expect(img.getAttribute("data-tier")).toBe(tier);
    expect(img.src).toContain(`assets/ranks/large/${tier}.png`);
  });

  it("renders the challenger emblem at the max tier", () => {
    render(<RankedTierPanel progression={view({
      tier: "challenger", rating: 1500, nextTier: null,
      nextTierRating: null, ratingToNext: 0, progressPercent: 100,
    })} />);
    const img = screen.getByTestId("ranked-tier-emblem") as HTMLImageElement;
    expect(img.src).toContain("assets/ranks/large/challenger.png");
  });

  it("never renders an Academy crown in the Ranked path", () => {
    const { container } = render(<RankedTierPanel progression={view()} />);
    const srcs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src") ?? "");
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      expect(src).not.toContain("/images/ranked/crowns/");
      expect(src).not.toContain("crown");
    }
  });
});

describe("tier, rating and progress text", () => {
  it("names the tier as Mogzy competitive standing, not a Riot rank", () => {
    render(<RankedTierPanel progression={view()} />);
    expect(screen.getByTestId("ranked-tier-name").textContent).toBe("Ranked Gold");
    expect(screen.getByText(/Mogzy competitive rank/i)).toBeTruthy();
    expect(screen.queryByText(/solo queue/i)).toBeNull();
  });

  it("shows the numeric Ranked rating", () => {
    render(<RankedTierPanel progression={view({ rating: 1247 })} />);
    expect(screen.getByTestId("ranked-tier-rating").textContent).toContain("1247");
  });

  it("renders a progress bar carrying the server's percentage", () => {
    render(<RankedTierPanel progression={view({ progressPercent: 20 })} />);
    const bar = screen.getByTestId("ranked-tier-progress");
    expect(bar).toBeTruthy();
    // The value is rendered, not recomputed from rating vs thresholds.
    expect(bar.querySelector("[style]")?.getAttribute("style")).toContain("80");
  });

  it("names the next tier and the remaining rating", () => {
    render(<RankedTierPanel progression={view({ ratingToNext: 100, nextTier: "diamond" })} />);
    const next = screen.getByTestId("ranked-tier-next").textContent ?? "";
    expect(next).toContain("100");
    expect(next).toContain("Diamond");
    expect(screen.queryByTestId("ranked-tier-max")).toBeNull();
  });

  it("shows the Challenger max state instead of a next tier", () => {
    render(<RankedTierPanel progression={view({
      tier: "challenger", rating: 1700, nextTier: null,
      nextTierRating: null, ratingToNext: 0, progressPercent: 100,
    })} />);
    expect(screen.getByTestId("ranked-tier-name").textContent).toBe("Ranked Challenger");
    expect(screen.getByTestId("ranked-tier-max").textContent).toMatch(/highest/i);
    expect(screen.queryByTestId("ranked-tier-next")).toBeNull();
  });

  it("marks an account that has never been rated", () => {
    render(<RankedTierPanel progression={view({ rated: false, matchesRated: 0 })} />);
    expect(screen.getByTestId("ranked-tier-unrated")).toBeTruthy();
  });
});

describe("vocabulary", () => {
  it.each(["Iron", "Platinum", "Emerald", "Master", "Grandmaster"])(
    "never shows the legacy tier name %s", (legacy) => {
      for (const c of TIER_CASES) {
        const { container, unmount } = render(<RankedTierPanel progression={view({
          tier: c.tier, rating: c.rating, nextTier: c.next, nextTierRating: c.nextRating,
        })} />);
        expect(container.textContent).not.toContain(legacy);
        unmount();
      }
    });
});
