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

// RANKED-INT1 — Assembly joins Match Grid as a server-paced module, and the
// final round (no next `started_at`) holds from the round's stored
// `presentation_ms` instead of falling back to the generic beat.
import { finalServerPacedHoldMs } from "@/lib/ranked-core/pacing";
import { SERVER_PACED_REVEAL_MODULES } from "@/lib/ranked-core/orderForgeLockReveal";
import { readResolvedPresentationMs, readSegmentSettlement } from "@/lib/ranked-public/contracts";
import { ASSEMBLY_TIMING } from "@/lib/interaction-grammar/positionalAssembly";
import rosterCapture from "@/lib/ranked-public/__fixtures__/assemblyRosterLockServerCapture.json";
import draftCapture from "@/lib/ranked-public/__fixtures__/assemblyDraftMemoryServerCapture.json";
import scrubCapture from "@/lib/ranked-public/__fixtures__/scrubServerCapture.json";

describe("RANKED-INT1 — the shared server-paced hold (Match Grid + Assembly)", () => {
  const TITLE = 1400;

  it("is exactly Match Grid and Assembly; every other module keeps its beat", () => {
    expect([...SERVER_PACED_REVEAL_MODULES].sort()).toEqual(["assembly", "match"]);
    for (const id of ["scrub", "reconstruct", "order_forge", "quiz", "mastery_slice", "item_cost_duel"]) {
      expect(SERVER_PACED_REVEAL_MODULES.has(id)).toBe(false);
    }
  });

  it("gives a wrong Assembly board its whole server window (5800 → 4400)", () => {
    const nominal = Math.max(REVEAL_HOLD_MS, serverPacedHoldMs(5800, TITLE));
    expect(anchoredRevealHoldMs(nominal, 5800, TITLE)).toBe(4400);
  });

  it("the window covers the primitive's own measured correction plus reading time", () => {
    // Backend `assembly.REVEAL_CHOREOGRAPHY_MS` (1900) is THIS clock's plate-in.
    expect(ASSEMBLY_TIMING.contextEnd).toBe(1900);
    expect(4400 - ASSEMBLY_TIMING.contextEnd).toBeGreaterThanOrEqual(2500);
    // Exact boards skip the settle stage: plate in by 1100, held to 3600.
    const exactPlateIn = ASSEMBLY_TIMING.marksEnd + (ASSEMBLY_TIMING.contextEnd - ASSEMBLY_TIMING.settleEnd);
    expect(exactPlateIn).toBe(1100);
    expect(3600 - exactPlateIn).toBeGreaterThanOrEqual(2500);
  });

  it("the FINAL round holds the server's stored hold, not the generic 1.5 s", () => {
    expect(finalServerPacedHoldMs(5800, TITLE)).toBe(4400); // Assembly, wrong / timeout
    expect(finalServerPacedHoldMs(5000, TITLE)).toBe(3600); // Assembly, all exact
    expect(finalServerPacedHoldMs(5900, TITLE)).toBe(4500); // Match Grid, not exact
    expect(finalServerPacedHoldMs(null, TITLE)).toBe(0);    // old backend: beat unchanged
    expect(Math.max(REVEAL_HOLD_MS, finalServerPacedHoldMs(null, TITLE))).toBe(REVEAL_HOLD_MS);
  });

  it.each([["roster_lock", rosterCapture], ["draft_memory", draftCapture]])(
    "reads the REAL final %s round's stored presentation", (_family, cap) => {
      const final = cap.resolved_timeout.payload;
      expect(final.round_number).toBe(3);
      expect(readResolvedPresentationMs(final)).toBe(5800);
      expect(readSegmentSettlement(final)?.reveal.moduleId).toBe("assembly");
      expect(finalServerPacedHoldMs(readResolvedPresentationMs(final), TITLE)).toBe(4400);
      // The same number the resume path carries for the finished match.
      expect(readResolvedPresentationMs(cap.resume_final.payload.latest_resolved_round.payload)).toBe(5800);
    });

  it("a non-server-paced final round (Scrub) is unaffected", () => {
    const final = scrubCapture.resume_final.payload.latest_resolved_round.payload;
    expect(readSegmentSettlement(final)?.reveal.moduleId).toBe("scrub");
    expect(SERVER_PACED_REVEAL_MODULES.has("scrub")).toBe(false);
  });

  it("refuses a malformed presentation (the ordinary beat then stands)", () => {
    for (const bad of [undefined, null, -1, 1.5, "5800", {}]) {
      expect(readResolvedPresentationMs({ presentation_ms: bad })).toBeNull();
    }
    expect(readResolvedPresentationMs(null)).toBeNull();
    expect(readResolvedPresentationMs({ presentation_ms: 0 })).toBe(0);
  });
});
