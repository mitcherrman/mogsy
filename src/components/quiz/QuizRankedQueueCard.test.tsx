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
import type { RankedProgressionView } from "@/lib/ranked-public/contracts";
import type { RankTier } from "@/lib/progression/tiers";

const PLACEMENT: RankedState = {
  placementMatchesRemaining: 5,
  isPlaced: false,
  estimatedGain: 25,
  estimatedLoss: 15,
};

const PLACED: RankedState = { ...PLACEMENT, isPlaced: true, placementMatchesRemaining: 0 };

/** A Ranked progression view as the backend hands it over. Every figure here
 *  is server-computed; the card re-derives none of it. */
function progression(over: Partial<RankedProgressionView> = {}): RankedProgressionView {
  return {
    rating: 1120,
    tier: "silver",
    nextTier: "gold",
    nextTierRating: 1175,
    ratingToNext: 55,
    progressPercent: 45,
    rated: true,
    matchesRated: 8,
    ...over,
  };
}

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
    fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("shows the competitive tier, and the same one-word PLAY action, once placed", () => {
    render(
      <QuizRankedQueueCard
        progress={{ rank_name: "Bronze" }}
        ranked={PLACED}
        onPlay={() => {}}
        rankedProgression={progression({ tier: "gold" })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Ranked Gold" })).toBeTruthy();
    // LC1: the action is always "PLAY" — placed or not. The placement /
    // ranked distinction is carried by the identity and status blocks around
    // it, not by the button label.
    expect(screen.getByRole("button", { name: /^Play$/ })).toBeTruthy();
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

  it("placed: progress is rating toward the next TIER, not XP toward the next quiz rank", () => {
    render(
      <QuizRankedQueueCard
        // Legacy fields present and deliberately contradictory — none may show.
        progress={{ rank_name: "Bronze", next_rank_name: "Emerald", progress_percent: 41.9 }}
        ranked={PLACED}
        onPlay={() => {}}
        rankedProgression={progression()}
      />,
    );
    const bar = screen.getByTestId("rank-progress");
    expect(bar.textContent).toContain("55 rating to Gold");
    expect(bar.textContent).not.toContain("Emerald");
    expect(bar.textContent).not.toContain("42%");
  });

  it("hero copy: communicates competitive 1v1 matches in a single line", () => {
    render(<QuizRankedQueueCard progress={null} ranked={PLACEMENT} onPlay={() => {}} />);
    expect(screen.getByText("Ranked Quiz")).toBeTruthy();
    expect(
      screen.getByText("Face other players in synchronized 1v1 League knowledge matches."),
    ).toBeTruthy();
    // The "Shared questions · HP combat · XP and ranks" micro-line was dropped
    // when the hero was condensed: it restated the sentence above it and cost a
    // row of height in the Ranked-first hub.
    expect(screen.queryByText(/Shared questions · HP combat · XP and ranks/)).toBeNull();
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

/**
 * RE1 Phase 4B — the hub's competitive identity is the Ranked five-tier
 * standing, never the Academy/quiz XP ladder that used to feed this block.
 */
describe("QuizRankedQueueCard — RE1 Ranked identity", () => {
  it("names the tier from ranked_tier, ignoring the legacy quiz rank entirely", () => {
    render(
      <QuizRankedQueueCard
        progress={{ rank_name: "Platinum", next_rank_name: "Emerald", rank_icon: "assets/ranks/platinum.png" }}
        ranked={PLACED}
        onPlay={() => {}}
        rankedProgression={progression({ tier: "bronze", nextTier: "silver" })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Ranked Bronze" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Platinum/ })).toBeNull();
  });

  it.each([
    ["bronze", "Ranked Bronze"],
    ["silver", "Ranked Silver"],
    ["gold", "Ranked Gold"],
    ["diamond", "Ranked Diamond"],
    ["challenger", "Ranked Challenger"],
  ] as [RankTier, string][])(
    "renders the Riot ranked emblem for %s",
    (tier, heading) => {
      render(
        <QuizRankedQueueCard
          progress={null}
          ranked={PLACED}
          onPlay={() => {}}
          rankedProgression={progression({
            tier,
            nextTier: tier === "challenger" ? null : "gold",
            nextTierRating: tier === "challenger" ? null : 1175,
          })}
        />,
      );
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
      const img = screen.getByRole("img", { name: `${heading.replace("Ranked ", "")} ranked emblem` }) as HTMLImageElement;
      // Riot ranked emblem family, addressed by the canonical tier — not a crown.
      expect(img.getAttribute("data-tier")).toBe(tier);
      expect(img.src).toContain(tier);
      expect(img.src).not.toContain("crown");
      cleanup();
    },
  );

  it("renders the numeric Ranked rating in the compact identity slot", () => {
    render(
      <QuizRankedQueueCard
        progress={null}
        ranked={PLACED}
        onPlay={() => {}}
        rankedProgression={progression({ rating: 1287 })}
      />,
    );
    expect(screen.getByTestId("hub-ranked-rating").textContent).toContain("1287 Ranked rating");
  });

  it("states the Challenger max instead of a next tier", () => {
    render(
      <QuizRankedQueueCard
        progress={null}
        ranked={PLACED}
        onPlay={() => {}}
        rankedProgression={progression({
          tier: "challenger",
          nextTier: null,
          nextTierRating: null,
          ratingToNext: 0,
          progressPercent: 100,
          rating: 1502,
        })}
      />,
    );
    expect(screen.getByTestId("rank-progress").textContent).toContain(
      "Challenger — the highest Ranked tier.",
    );
  });

  it.each(["Iron", "Platinum", "Emerald", "Master", "Grandmaster"])(
    "never surfaces the legacy tier %s as the competitive rank",
    (legacy) => {
      const { container } = render(
        <QuizRankedQueueCard
          progress={{ rank_name: legacy, next_rank_name: legacy, rank: { rank_name: legacy } }}
          ranked={PLACED}
          onPlay={() => {}}
          rankedProgression={progression()}
        />,
      );
      expect(container.textContent).not.toContain(legacy);
      cleanup();
    },
  );

  it("falls back to a NEUTRAL unranked identity when progression is unavailable", () => {
    // Older backend / signed out / failed request / invalid payload all arrive
    // here as null. The Academy rank must not stand in for a Ranked tier.
    const { container } = render(
      <QuizRankedQueueCard
        progress={{ rank_name: "Platinum", next_rank_name: "Emerald", rank_icon: "assets/ranks/platinum.png", progress_percent: 88 }}
        ranked={PLACED}
        onPlay={() => {}}
        rankedProgression={null}
      />,
    );
    expect(screen.getByRole("heading", { name: "Unranked" })).toBeTruthy();
    expect(container.textContent).not.toContain("Platinum");
    expect(container.textContent).not.toContain("Emerald");
    expect(screen.queryByTestId("hub-ranked-rating")).toBeNull();
    expect(screen.queryByTestId("rank-progress")).toBeNull();
    // Still fully usable: the one action is present.
    expect(screen.getByRole("button", { name: /^Play$/ })).toBeTruthy();
    const img = screen.getByRole("img", { name: "Unranked" }) as HTMLImageElement;
    expect(img.src).toContain("unranked");
  });

  it("keeps the LC1 hero structure intact around the corrected identity", () => {
    render(
      <QuizRankedQueueCard
        progress={{ current_streak: 3, best_streak: 7, accuracy: 61, attempts: 20 }}
        ranked={PLACED}
        onPlay={() => {}}
        rankedProgression={progression()}
      />,
    );
    expect(screen.getByTestId("ranked-hero")).toBeTruthy();
    expect(screen.getByTestId("hero-stat-strip")).toBeTruthy();
    expect(screen.getByText("Ranked Quiz")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Play$/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /View full profile/ })).toBeTruthy();
    expect(screen.getByText("+25")).toBeTruthy();
  });

  it("unplaced players keep LC1 placement honesty even with a live rating", () => {
    render(
      <QuizRankedQueueCard
        progress={null}
        ranked={{ ...PLACEMENT, placementMatchesRemaining: 3 }}
        onPlay={() => {}}
        rankedProgression={progression({ tier: "diamond" })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Placement Series" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Ranked Diamond/ })).toBeNull();
    expect(screen.queryByTestId("hub-ranked-rating")).toBeNull();
    const img = screen.getByRole("img", { name: "Unranked" }) as HTMLImageElement;
    expect(img.src).toContain("unranked");
  });
});
