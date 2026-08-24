/**
 * RG3 — how long the answer beat lasts, and why.
 *
 * Pinned as arithmetic rather than as rendered timing: the hold is one number
 * chosen from a small set of allowances, and the property that matters is that
 * adding a reason to lengthen it can never shorten it.
 */
import { describe, expect, it } from "vitest";
import {
  REVEAL_HOLD_EVIDENCE_MS,
  REVEAL_HOLD_LEVEL_UP_MS,
  REVEAL_HOLD_MS,
} from "./useRankedMatch";

/** The rule `beginRevealHold` applies, stated once so it can be asserted. */
const hold = (leveledUp: boolean, hasEvidence: boolean) =>
  Math.max(REVEAL_HOLD_MS,
    leveledUp ? REVEAL_HOLD_LEVEL_UP_MS : 0,
    hasEvidence ? REVEAL_HOLD_EVIDENCE_MS : 0);

describe("the reveal hold", () => {
  it("leaves the ORDINARY round at exactly what it always was", () => {
    // Most rounds carry no evidence and no level-up, and RG3 must not make
    // every round slower to serve the few that have more to show.
    expect(hold(false, false)).toBe(1500);
  });

  it("gives a round with evidence the same allowance a level-up gets", () => {
    expect(hold(false, true)).toBe(REVEAL_HOLD_LEVEL_UP_MS);
    expect(REVEAL_HOLD_EVIDENCE_MS).toBe(REVEAL_HOLD_LEVEL_UP_MS);
  });

  it("never shortens a beat by adding a second reason to lengthen it", () => {
    expect(hold(true, true)).toBeGreaterThanOrEqual(hold(true, false));
    expect(hold(true, true)).toBeGreaterThanOrEqual(hold(false, true));
  });

  it("stays inside a fast loop — no beat runs for three seconds", () => {
    for (const l of [true, false]) {
      for (const e of [true, false]) expect(hold(l, e)).toBeLessThanOrEqual(3000);
    }
  });
});
