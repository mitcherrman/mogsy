/**
 * RE1 Phase 3B — the Ranked progression contract.
 *
 * The client adopts the backend's derived numbers and validates only that
 * they are the shape and vocabulary it can render.
 */

import { describe, expect, it } from "vitest";
import { readRankedProgression } from "./contracts";

const BODY = {
  schema_version: "ranked_duel.progression.v1",
  policy_version: "elo.v1",
  rated: true,
  matches_rated: 8,
  rating: 1200,
  ranked_tier: "gold",
  ranked_next_tier: "diamond",
  ranked_next_tier_rating: 1300,
  ranked_rating_to_next: 100,
  ranked_progress_percent: 20,
};

it("maps every contract field", () => {
  expect(readRankedProgression(BODY)).toEqual({
    rating: 1200, tier: "gold", nextTier: "diamond", nextTierRating: 1300,
    ratingToNext: 100, progressPercent: 20, rated: true, matchesRated: 8,
  });
});

it("accepts the Challenger max state", () => {
  const view = readRankedProgression({
    ...BODY, rating: 1500, ranked_tier: "challenger", ranked_next_tier: null,
    ranked_next_tier_rating: null, ranked_rating_to_next: 0,
    ranked_progress_percent: 100,
  });
  expect(view.tier).toBe("challenger");
  expect(view.nextTier).toBeNull();
  expect(view.nextTierRating).toBeNull();
});

describe("vocabulary", () => {
  it.each(["iron", "platinum", "emerald", "master", "grandmaster", "unranked"])(
    "rejects the legacy tier %s", (legacy) => {
      expect(() => readRankedProgression({ ...BODY, ranked_tier: legacy })).toThrow();
      expect(() => readRankedProgression({ ...BODY, ranked_next_tier: legacy })).toThrow();
    });

  it.each(["bronze", "silver", "gold", "diamond", "challenger"])(
    "accepts the canonical tier %s", (tier) => {
      expect(readRankedProgression({ ...BODY, ranked_tier: tier }).tier).toBe(tier);
    });
});

it("rejects a non-numeric rating", () => {
  expect(() => readRankedProgression({ ...BODY, rating: "1200" })).toThrow();
});

it("tolerates a backend that omits the rated hint", () => {
  const { rated, matches_rated, ...older } = BODY;
  void rated; void matches_rated;
  const view = readRankedProgression(older);
  expect(view.rated).toBe(true);
  expect(view.matchesRated).toBe(0);
});
