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

// MG-P3.1 — Match Grid paces its own settlement on the server (MG-P2.1).
import { anchoredRevealHoldMs, serverPacedHoldMs } from "@/lib/ranked-core/pacing";

describe("a server-paced (Match Grid) settlement", () => {
  const TITLE = 1400;
  it("holds until the server's boundary minus the title, and no longer", () => {
    // P2.1: a wrong board → next board answerable 5900 ms after resolution.
    const lead = 5900;
    const nominal = Math.max(REVEAL_HOLD_MS, serverPacedHoldMs(lead, TITLE));
    expect(nominal).toBe(4500);
    expect(anchoredRevealHoldMs(nominal, lead, TITLE)).toBe(4500);
  });

  it("an exact board's shorter server window is honoured (4400 → 3000)", () => {
    const nominal = Math.max(REVEAL_HOLD_MS, serverPacedHoldMs(4400, TITLE));
    expect(anchoredRevealHoldMs(nominal, 4400, TITLE)).toBe(3000);
  });

  it("an unknown boundary adds nothing (the ordinary beat stands)", () => {
    expect(serverPacedHoldMs(null, TITLE)).toBe(0);
    expect(Math.max(REVEAL_HOLD_MS, serverPacedHoldMs(null, TITLE))).toBe(REVEAL_HOLD_MS);
  });

  it("can only lengthen toward the server's own ceiling, never past it", () => {
    for (const lead of [0, 900, 2900, 5900, 9000]) {
      const nominal = Math.max(REVEAL_HOLD_MS, serverPacedHoldMs(lead, TITLE));
      expect(anchoredRevealHoldMs(nominal, lead, TITLE)).toBeLessThanOrEqual(Math.max(900, lead - TITLE));
    }
  });
});
