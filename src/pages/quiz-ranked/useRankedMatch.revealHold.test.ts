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

describe("a server-paced settlement (MG-P3.1 hold math)", () => {
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

// RANKED-INT1 / R3C release — the final round (no next `started_at`) holds from
// the round's stored `presentation_ms`. MATCH-GRID-LIVE adds Match Grid beside
// Reconstruct; Assembly is not part of this release.
import { finalServerPacedHoldMs } from "@/lib/ranked-core/pacing";
import { SERVER_PACED_REVEAL_MODULES } from "@/lib/ranked-core/orderForgeLockReveal";
import { readResolvedPresentationMs, readSegmentSettlement } from "@/lib/ranked-public/contracts";

describe("the shared server-paced hold (Reconstruct + Match Grid + Assembly)", () => {
  const TITLE = 1400;

  it("is exactly Assembly, Match Grid and Reconstruct; every other module keeps its beat", () => {
    // ASSEMBLY-PA3: Assembly joins (backend `AssemblyModule.settlement_hold_ms`).
    expect([...SERVER_PACED_REVEAL_MODULES].sort()).toEqual(["assembly", "match", "reconstruct"]);
    for (const id of ["scrub", "order_forge", "quiz", "mastery_slice", "item_cost_duel"]) {
      expect(SERVER_PACED_REVEAL_MODULES.has(id)).toBe(false);
    }
  });

  it("the FINAL round holds the server's stored hold, not the generic 1.5 s", () => {
    expect(finalServerPacedHoldMs(5400, TITLE)).toBe(4000); // wrong / timeout
    expect(finalServerPacedHoldMs(4800, TITLE)).toBe(3400); // all exact
    // MATCH-GRID-LIVE: Match Grid's final round stores 4500 + title (wrong /
    // timeout; backend test_match_grid_live_release) → the full ledger window.
    expect(finalServerPacedHoldMs(4500 + TITLE, TITLE)).toBe(4500);
    expect(finalServerPacedHoldMs(null, TITLE)).toBe(0);    // old backend: beat unchanged
    expect(Math.max(REVEAL_HOLD_MS, finalServerPacedHoldMs(null, TITLE))).toBe(REVEAL_HOLD_MS);
  });

  it("refuses a malformed presentation (the ordinary beat then stands)", () => {
    for (const bad of [undefined, null, -1, 1.5, "5800", {}]) {
      expect(readResolvedPresentationMs({ presentation_ms: bad })).toBeNull();
    }
    expect(readResolvedPresentationMs(null)).toBeNull();
    expect(readResolvedPresentationMs({ presentation_ms: 0 })).toBe(0);
  });
});

// RECONSTRUCT-R3B — Reconstruct joins the shared server-paced hold. The
// backend window (`reconstruct.SETTLEMENT_REVEAL_WINDOW_MS` 4000, exact 3400)
// is THIS primitive's clock plus 2500 ms to read the completed recipe.
import { RECONSTRUCT_TIMING, planReveal } from "@/lib/interaction-grammar/reconstructReveal";
import reconstructCapture from "@/lib/ranked-public/__fixtures__/reconstructServerCapture.json";

describe("RECONSTRUCT-R3B — Reconstruct's server-paced hold", () => {
  const TITLE = 1400;
  const READ = 2500;

  it("the window is the primitive's own correction plus reading time", () => {
    const wrong = planReveal({ reduced: false, anyWrong: true, hasEvidence: true });
    const exact = planReveal({ reduced: false, anyWrong: false, hasEvidence: true });
    expect(wrong.totalMs).toBe(RECONSTRUCT_TIMING.evidenceEnd);
    expect(wrong.totalMs).toBe(1500);
    expect(exact.totalMs).toBe(900);
    expect(4000 - wrong.totalMs).toBe(READ);
    expect(3400 - exact.totalMs).toBe(READ);
    // Reduced motion settles at t = 0, so the whole hold is readable.
    expect(planReveal({ reduced: true, anyWrong: true, hasEvidence: true }).totalMs).toBe(0);
  });

  it("an ordinary wrong round holds the whole window (5400 → 4000)", () => {
    const nominal = Math.max(REVEAL_HOLD_MS, serverPacedHoldMs(5400, TITLE));
    expect(anchoredRevealHoldMs(nominal, 5400, TITLE)).toBe(4000);
  });

  it("reads the REAL captured rounds' stored presentations", () => {
    const cap = reconstructCapture as unknown as Record<string, { payload: Record<string, unknown> }>;
    const incorrect = cap.resolved_incorrect.payload;
    expect(readSegmentSettlement(incorrect)?.reveal.moduleId).toBe("reconstruct");
    expect(readResolvedPresentationMs(incorrect)).toBe(4000 + TITLE);
    // The final round (a timeout): no next board, so the stored value holds it.
    const final = cap.resolved_timeout.payload;
    expect(final.round_number).toBe(3);
    expect(readResolvedPresentationMs(final)).toBe(4000 + TITLE);
    expect(finalServerPacedHoldMs(readResolvedPresentationMs(final), TITLE)).toBe(4000);
    const resumed = (cap.resume_final.payload as { latest_resolved_round: { payload: unknown } })
      .latest_resolved_round.payload;
    expect(readResolvedPresentationMs(resumed)).toBe(4000 + TITLE);
  });
});

// ASSEMBLY-PA3 — Roster Lock / Draft Memory join the shared server-paced hold.
// The backend window (`assembly.SETTLEMENT_REVEAL_WINDOW_MS` 4400, exact 3600)
// is the PositionalAssembly primitive's own clock plus 2500 ms to read the
// context plate and the notes under each wrong pick.
import { ASSEMBLY_TIMING, planAssemblyReveal } from "@/lib/interaction-grammar/positionalAssembly";

describe("ASSEMBLY-PA3 — Assembly's server-paced hold", () => {
  const TITLE = 1400;
  const READ = 2500;

  it("the window is the primitive's own reveal plus reading time", () => {
    const wrong = planAssemblyReveal({ reduced: false, anyWrong: true });
    const exact = planAssemblyReveal({ reduced: false, anyWrong: false });
    expect(wrong.totalMs).toBe(ASSEMBLY_TIMING.contextEnd);
    expect(4400 - wrong.totalMs).toBe(READ);
    expect(3600 - exact.totalMs).toBe(READ);
  });

  it("an ordinary wrong board holds the whole window (5800 → 4400)", () => {
    const nominal = Math.max(REVEAL_HOLD_MS, serverPacedHoldMs(5800, TITLE));
    expect(anchoredRevealHoldMs(nominal, 5800, TITLE)).toBe(4400);
  });

  it("the FINAL board holds its stored window before the outro", () => {
    // backend test_assembly_pa3_admin_live: final presentation_ms = 4400 + title.
    expect(finalServerPacedHoldMs(4400 + TITLE, TITLE)).toBe(4400);
    expect(finalServerPacedHoldMs(3600 + TITLE, TITLE)).toBe(3600);
  });
});
