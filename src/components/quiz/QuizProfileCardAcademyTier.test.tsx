/**
 * RE1 Phase 2 — the Academy five-tier migration on its one proving surface.
 *
 * Two properties, and the second matters more than the first: the card must
 * render the Mogzy crown and Academy identity for every canonical tier, AND
 * it must be byte-for-byte its pre-RE1 self whenever the new field is absent
 * or not canonical. The backend field is typed `unknown` on the wire, so the
 * junk cases below are reachable, not hypothetical.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import QuizProfileCard from "./QuizProfileCard";
import { RANK_TIERS } from "@/lib/progression/tiers";
import { resolveCrownArt } from "@/lib/ranked/crowns";
import type { QuizProgress } from "@/lib/quiz/api";

/** Legacy fields exactly as the backend still sends them, alongside the new one. */
const BASE: QuizProgress = {
  total_xp: 2500,
  total_attempts: 40,
  correct_attempts: 25,
  accuracy: 62.5,
  current_streak: 3,
  best_streak: 9,
  rank_name: "Platinum",
  rank_icon: "assets/ranks/platinum.png",
  next_rank_name: "Diamond",
  progress_percent: 50,
  xp_to_next: 500,
};

afterEach(cleanup);

const EXPECTED_LABEL: Record<string, string> = {
  bronze: "Academy Bronze",
  silver: "Academy Silver",
  gold: "Academy Gold",
  diamond: "Academy Diamond",
  challenger: "Academy Challenger",
};

describe("QuizProfileCard — Academy five-tier crown", () => {
  it.each(RANK_TIERS)("renders the %s Mogzy crown and Academy identity", (tier) => {
    render(<QuizProfileCard progress={{ ...BASE, academy_tier: tier }} achievements={[]} />);

    // Academy naming, never bare competitive-sounding rank language.
    expect(screen.getByText(EXPECTED_LABEL[tier])).toBeTruthy();

    const crown = screen.getByAltText(`${EXPECTED_LABEL[tier]} crown`) as HTMLImageElement;
    // The crown comes from the separate crown namespace, not legacy rank art.
    expect(crown.getAttribute("src")).toBe(resolveCrownArt(tier));
    expect(crown.getAttribute("src")).toContain("/images/ranked/crowns/");
    expect(crown.getAttribute("src")).not.toContain("assets/ranks/");

    // The legacy crest is no longer the primary crest on this surface.
    expect(screen.queryByAltText("Platinum rank")).toBeNull();
  });

  it("keeps the track-neutral stats rendering beside the new crown", () => {
    render(<QuizProfileCard progress={{ ...BASE, academy_tier: "gold" }} achievements={[]} />);
    expect(screen.getByText("2,500 XP")).toBeTruthy();
    expect(screen.getByText("62.50%")).toBeTruthy();
  });

  it("suppresses the legacy next-rank copy when only the tier is present", () => {
    // Phase 2B supersedes Phase 2 here. With a tier but no interval block,
    // the card is on the Academy path and must NOT borrow legacy next-rank
    // wording — "Academy Gold" above "50% to Diamond" (a LEGACY Diamond,
    // three tiers off the Academy ladder) is exactly the contradiction this
    // phase removes. It shows the tier alone until the interval arrives.
    render(<QuizProfileCard progress={{ ...BASE, academy_tier: "gold" }} achievements={[]} />);
    expect(screen.queryByText(/to Diamond/)).toBeNull();
    expect(screen.queryByText("left")).toBeNull();
    // The title is not echoed back as the summary line either.
    expect(screen.getAllByText("Academy Gold")).toHaveLength(1);
  });
});

describe("QuizProfileCard — fallback to legacy rendering", () => {
  it("renders the legacy rank name and crest when the field is absent", () => {
    render(<QuizProfileCard progress={BASE} achievements={[]} />);
    expect(screen.getByText("Platinum")).toBeTruthy();
    expect(screen.getByAltText("Platinum rank")).toBeTruthy();
    expect(screen.queryByText(/^Academy /)).toBeNull();
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["a legacy League tier", "platinum"],
    ["an unranked token", "Unranked"],
    ["a number", 3],
    ["an object", { tier: "gold" }],
  ])("falls back to legacy rendering for %s", (_label, value) => {
    render(<QuizProfileCard progress={{ ...BASE, academy_tier: value }} achievements={[]} />);
    expect(screen.getByText("Platinum")).toBeTruthy();
    expect(screen.getByAltText("Platinum rank")).toBeTruthy();
    expect(screen.queryByText(/^Academy /)).toBeNull();
  });

  it("parses tier tokens case-insensitively, as the wire contract is untrusted", () => {
    render(<QuizProfileCard progress={{ ...BASE, academy_tier: "  GOLD " }} achievements={[]} />);
    expect(screen.getByText("Academy Gold")).toBeTruthy();
  });

  it("still shows the pre-RE1 empty state when there is no progress at all", () => {
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
