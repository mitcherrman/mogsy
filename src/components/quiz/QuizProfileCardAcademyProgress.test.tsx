/**
 * RE1 Phase 2B — the Academy path owns the WHOLE rank presentation.
 *
 * Phase 2 migrated the crown and title but left the bar and next-rank label on
 * the legacy 11-tier ladder, so a player could read "Academy Gold" directly
 * above "50% to Platinum". The assertions that matter here are the negative
 * ones: no legacy tier name may appear anywhere in the Academy presentation.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import QuizProfileCard from "./QuizProfileCard";
import { resolveCrownArt } from "@/lib/ranked/crowns";
import type { QuizProgress } from "@/lib/quiz/api";

/** Every legacy 11-tier name that must never leak into the Academy path. */
const LEGACY_TIER_NAMES = [
  "Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald",
  "Diamond", "Master", "Grandmaster", "Challenger", "Unranked",
];

/**
 * Legacy fields are always present on the wire and always contradict the
 * Academy ones — that is the point. 2500 XP is legacy Platinum, Academy Gold.
 */
const LEGACY: QuizProgress = {
  total_attempts: 40,
  correct_attempts: 25,
  accuracy: 62.5,
  current_streak: 3,
  best_streak: 9,
  rank_name: "Platinum",
  rank_icon: "assets/ranks/platinum.png",
  next_rank_name: "Emerald",
  next_rank_icon: "assets/ranks/emerald.png",
  progress_percent: 88,
  xp_to_next: 400,
};

/** The backend read model, exactly as routes/quiz.py serves it. */
function academy(
  total_xp: number,
  tier: string,
  next_tier: string | null,
  current: number,
  next: number | null,
  percent: number,
): QuizProgress {
  return {
    ...LEGACY,
    total_xp,
    academy_tier: tier,
    academy_next_tier: next_tier,
    academy_current_tier_xp: current,
    academy_next_tier_xp: next,
    academy_xp_to_next: next === null ? 0 : next - total_xp,
    academy_progress_percent: percent,
  };
}

afterEach(cleanup);

/** Every rendered string on the card, for whole-surface leak assertions. */
function surfaceText() {
  return document.body.textContent ?? "";
}

describe("QuizProfileCard — Academy five-tier progression", () => {
  it.each([
    [250, "bronze", "silver", 0, 500, 50, "Academy Bronze", "50% to Academy Silver"],
    [500, "silver", "gold", 500, 1500, 0, "Academy Silver", "0% to Academy Gold"],
    [1000, "silver", "gold", 500, 1500, 50, "Academy Silver", "50% to Academy Gold"],
    [2250, "gold", "diamond", 1500, 3000, 50, "Academy Gold", "50% to Academy Diamond"],
    [4500, "diamond", "challenger", 3000, 6000, 50, "Academy Diamond", "50% to Academy Challenger"],
  ])(
    "%i XP renders %s at the approved percentage",
    (xp, tier, nextTier, current, next, percent, title, summary) => {
      render(
        <QuizProfileCard
          progress={academy(xp, tier, nextTier, current, next, percent)}
          achievements={[]}
        />,
      );

      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(summary)).toBeTruthy();

      // The bar itself carries the Academy percentage, not the legacy 88.
      const bar = document.querySelector('[role="progressbar"]');
      expect(bar?.getAttribute("aria-valuenow") ?? bar?.textContent).not.toBe("88");
    },
  );

  it("never renders a legacy tier name anywhere in the Academy presentation", () => {
    render(<QuizProfileCard progress={academy(2250, "gold", "diamond", 1500, 3000, 50)} achievements={[]} />);
    const text = surfaceText();

    // The contradiction this phase exists to remove.
    expect(text).not.toContain("Platinum");
    expect(text).not.toContain("Emerald");
    // Bare tier words only ever appear inside "Academy <Tier>".
    for (const legacy of LEGACY_TIER_NAMES) {
      const bare = new RegExp(`(?<!Academy )\\b${legacy}\\b`);
      expect(bare.test(text)).toBe(false);
    }
    // And no legacy crest image survives either.
    expect(screen.queryByAltText("Platinum rank")).toBeNull();
    expect(screen.queryByAltText("Emerald rank")).toBeNull();
    expect(document.body.innerHTML).not.toContain("assets/ranks/");
  });

  it("previews the next tier with its Mogzy crown, not a legacy crest", () => {
    render(<QuizProfileCard progress={academy(2250, "gold", "diamond", 1500, 3000, 50)} achievements={[]} />);
    const nextCrown = screen.getByAltText("Academy Diamond crown") as HTMLImageElement;
    expect(nextCrown.getAttribute("src")).toBe(resolveCrownArt("diamond"));
  });

  it("shows XP remaining from the Academy interval, not the legacy ladder", () => {
    render(<QuizProfileCard progress={academy(2250, "gold", "diamond", 1500, 3000, 50)} achievements={[]} />);
    // 3000 - 2250 = 750, not the legacy 400.
    expect(screen.getByText("left").parentElement?.textContent).toContain("750 XP");
    expect(surfaceText()).not.toContain("400 XP");
  });
});

describe("QuizProfileCard — Challenger is the max tier", () => {
  const MAX = academy(7500, "challenger", null, 6000, null, 100);

  it("states max tier reached instead of a next-tier percentage", () => {
    render(<QuizProfileCard progress={MAX} achievements={[]} />);
    expect(screen.getByText("Academy Challenger — max tier reached")).toBeTruthy();
    expect(screen.queryByText(/% to /)).toBeNull();
  });

  it("offers no next-tier preview and nothing left to earn", () => {
    render(<QuizProfileCard progress={MAX} achievements={[]} />);
    expect(screen.queryByText("left")).toBeNull();
    expect(document.querySelectorAll('img[alt$="crown"]').length).toBe(1);
  });

  it("renders the Challenger crown as the current tier", () => {
    render(<QuizProfileCard progress={MAX} achievements={[]} />);
    const crown = screen.getByAltText("Academy Challenger crown") as HTMLImageElement;
    expect(crown.getAttribute("src")).toBe(resolveCrownArt("challenger"));
  });
});

describe("QuizProfileCard — legacy fallback is preserved exactly", () => {
  it("renders the full legacy presentation when no Academy block is sent", () => {
    render(<QuizProfileCard progress={{ ...LEGACY, total_xp: 2500 }} achievements={[]} />);
    expect(screen.getByText("Platinum")).toBeTruthy();
    expect(screen.getByAltText("Platinum rank")).toBeTruthy();
    expect(screen.getByText("88% to Emerald")).toBeTruthy();
    expect(screen.getByText("left").parentElement?.textContent).toContain("400 XP");
    expect(screen.queryByText(/^Academy /)).toBeNull();
  });

  it.each([
    ["a legacy tier token", { academy_tier: "platinum" }],
    ["a numeric tier", { academy_tier: 7 }],
    ["a null tier", { academy_tier: null }],
  ])("falls back to legacy rendering for %s", (_label, override) => {
    render(
      <QuizProfileCard
        progress={{ ...LEGACY, total_xp: 2500, ...override } as QuizProgress}
        achievements={[]}
      />,
    );
    expect(screen.getByText("Platinum")).toBeTruthy();
    expect(screen.getByText("88% to Emerald")).toBeTruthy();
  });

  it("shows the tier alone — never legacy copy — when the interval is incoherent", () => {
    // Tier is canonical so the crown and title migrate, but the interval is
    // inverted. The card must degrade to the Academy title WITHOUT borrowing
    // the legacy ladder's percentage or next-rank name.
    render(
      <QuizProfileCard
        progress={{ ...academy(2250, "gold", "diamond", 1500, 3000, 50), academy_next_tier_xp: 100 }}
        achievements={[]}
      />,
    );
    expect(screen.getByText("Academy Gold")).toBeTruthy();
    expect(screen.queryByText(/Emerald/)).toBeNull();
    expect(screen.queryByText(/88%/)).toBeNull();
  });
});
