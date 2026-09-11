/**
 * RP1 Step 3 — the ONE points-vs-HP decision, and what hangs off it.
 *
 * `matchScoringModel` is the whole discrimination path: every other difference
 * in the Ranked frontend (the rail's meter, the header's title, the settled
 * plate's consequence line, the mascots' silence) is derived from its answer.
 * These tests fix the answer itself, and the two projections that read it.
 */
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2, withPointsScoring } from "@/lib/ranked-public/fixtures";
import {
  isPointsMatch, matchScoringModel, moduleProgressLabel, projectCombatants,
} from "./rankedViews";

const round = (opts?: Parameters<typeof withPointsScoring>[1]) =>
  readPublicRound(opts === undefined
    ? publicRoundV2() : withPointsScoring(publicRoundV2(), opts));

describe("the scoring model", () => {
  it("is whatever the backend's discriminator says", () => {
    expect(matchScoringModel(round({}))).toBe("points");
    expect(isPointsMatch(round({}))).toBe(true);
  });

  it("is hp when the backend published no block at all (pre-RP1)", () => {
    expect(matchScoringModel(round())).toBe("hp");
    expect(isPointsMatch(round())).toBe(false);
  });

  it("is NOT inferred from a score field that happens to be present", () => {
    // A scoreless-looking hp match and a 0–0 points match both read 0; only
    // `model` separates them, and nothing here may sniff the other fields.
    const env = publicRoundV2();
    (env.payload.players as Record<string, unknown>[])
      .forEach((p) => { p.score = 0; });
    expect(matchScoringModel(readPublicRound(env))).toBe("hp");
  });
});

describe("the module progress line", () => {
  it("names the live module and the FROZEN length", () => {
    expect(moduleProgressLabel(round({ moduleNumber: 6, matchLength: 10 })))
      .toBe("Module 6 / 10");
  });

  it("reads the module the player is looking at, not the settled count", () => {
    // Module 6 is open and five have settled: "6 / 10", never "5 / 10".
    expect(moduleProgressLabel(round({
      moduleNumber: 6, matchLength: 10, modulesCompleted: 5,
    }))).toBe("Module 6 / 10");
  });

  it("says 10 / 10 on the last module, with no off-by-one", () => {
    expect(moduleProgressLabel(round({
      moduleNumber: 10, matchLength: 10, modulesCompleted: 9,
    }))).toBe("Module 10 / 10");
  });

  it("does not hard-code ten — a shorter frozen format says so", () => {
    expect(moduleProgressLabel(round({ moduleNumber: 2, matchLength: 5 })))
      .toBe("Module 2 / 5");
  });

  it("is null for an hp match, which gets NO fake denominator", () => {
    expect(moduleProgressLabel(round())).toBeNull();
  });

  it("names the module without a denominator if a length is missing", () => {
    expect(moduleProgressLabel(round({ moduleNumber: 3, matchLength: null })))
      .toBe("Module 3");
  });
});

describe("the combatants a points match projects", () => {
  it("carries BOTH cumulative scores onto the two rails", () => {
    const views = projectCombatants(
      round({ scores: { userA: 11, userB: 8 } }), "userA");
    expect(views.player.score).toBe(11);
    expect(views.opponent.score).toBe(8);
  });

  it("leaves an hp match's combatants with NO score, so the rail keeps HP", () => {
    const views = projectCombatants(round(), "userA");
    expect(views.player.score).toBeNull();
    expect(views.opponent.score).toBeNull();
    expect(views.player.hp).toBe(170);
  });
});
