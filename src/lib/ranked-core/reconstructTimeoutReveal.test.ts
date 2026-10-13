/**
 * RECONSTRUCT-R3C — the settled timeout reveal: when it attaches, and what it
 * may never carry. Driven by the real resolved projections the backend served
 * (`reconstructServerCapture.json`): a timed-out viewer, a wrong build and a
 * right one.
 */
import { describe, expect, it } from "vitest";
import capture from "@/lib/ranked-public/__fixtures__/reconstructServerCapture.json";
import {
  readPublicRound, readSegmentSettlement, RECONSTRUCT_MODULE_ID, type SegmentSettlementView, type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import { settledTimeoutReveal, withSettledTimeoutReveal } from "./reconstructTimeoutReveal";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;
const VIEWER = C.meta.viewer_user_id as string;
const settlementOf = (body: any): SegmentSettlementView => readSegmentSettlement(body.payload)!;
const TIMEOUT = settlementOf(C.resolved_timeout);
const BOT = Object.keys(TIMEOUT.reveal.players).find((id) => id !== VIEWER)!;
/** Round 3's open segment state, as the viewer saw it before the deadline. */
const OPEN: SegmentStateView = readPublicRound(C.public_after_bot_lock).segmentState!;

describe("RECONSTRUCT-R3C — settledTimeoutReveal", () => {
  it("builds the viewer's reveal from the settlement: the recipe, no picks, no marks", () => {
    const r = settledTimeoutReveal(TIMEOUT, VIEWER)!;
    expect(r.challengeIndex).toBe(0);
    expect(r.isCorrect).toBe(false);
    expect(r.reconstruct).toMatchObject({
      placement: [], slotCorrect: [], settledPlacement: [], isCorrect: false, timedOut: true,
    });
    expect(r.reconstruct!.canonicalParts).toEqual(TIMEOUT.reveal.reconstruct!.canonicalParts);
    expect(r.reconstruct!.target).toEqual(TIMEOUT.reveal.reconstruct!.target);
    expect(r.reconstruct!.pieces).toEqual(TIMEOUT.reveal.reconstruct!.pieces);
  });

  it("never carries the opponent's build", () => {
    const theirs = TIMEOUT.reveal.reconstruct!.placements[BOT]!;
    expect(theirs.length).toBeGreaterThan(0);
    const r = settledTimeoutReveal(TIMEOUT, VIEWER)!;
    expect(r.reconstruct!.placement).toEqual([]);
    expect(r.reconstruct!.slotCorrect).toEqual([]);
    expect(r.reconstruct!.settledPlacement).toEqual([]);
    expect(JSON.stringify(r)).not.toContain(BOT);
  });

  it("is null for a player who locked a build (wrong or right), and for the opponent's timeout", () => {
    expect(settledTimeoutReveal(settlementOf(C.resolved_incorrect), VIEWER)).toBeNull();
    expect(settledTimeoutReveal(settlementOf(C.resolved_correct), VIEWER)).toBeNull();
    // The bot locked in round 3: asked for the bot, there is nothing to teach.
    expect(settledTimeoutReveal(TIMEOUT, BOT)).toBeNull();
  });

  it("trusts the server's verdict, not an empty board: a locked placement always wins", () => {
    const forged: SegmentSettlementView = {
      ...TIMEOUT,
      reveal: { ...TIMEOUT.reveal, reconstruct: { ...TIMEOUT.reveal.reconstruct!,
        placements: { ...TIMEOUT.reveal.reconstruct!.placements, [VIEWER]: ["p0", "p1", "p2"] } } },
    };
    expect(settledTimeoutReveal(forged, VIEWER)).toBeNull();
  });

  it("is null without a settlement, a viewer, a Reconstruct reveal or the viewer's entry", () => {
    expect(settledTimeoutReveal(null, VIEWER)).toBeNull();
    expect(settledTimeoutReveal(TIMEOUT, null)).toBeNull();
    expect(settledTimeoutReveal(TIMEOUT, "someone-else")).toBeNull();
    expect(settledTimeoutReveal({ ...TIMEOUT, reveal: { ...TIMEOUT.reveal, moduleId: "order_forge" } }, VIEWER))
      .toBeNull();
  });
});

describe("RECONSTRUCT-R3C — withSettledTimeoutReveal", () => {
  const ref = { settlement: TIMEOUT, roundNumber: 3 };

  it("the open state carries no reveal and no answer (the precondition)", () => {
    expect(OPEN.moduleId).toBe(RECONSTRUCT_MODULE_ID);
    expect(OPEN.segmentNumber).toBe(3);
    expect(OPEN.ownChallengeReveals).toEqual([]);
  });

  it("attaches the reveal to the SAME segment, once settled", () => {
    const out = withSettledTimeoutReveal(OPEN, ref, VIEWER)!;
    expect(out).not.toBe(OPEN);
    expect(out.ownChallengeReveals).toHaveLength(1);
    expect(out.ownChallengeReveals[0].reconstruct?.timedOut).toBe(true);
    // Nothing else about the state changes.
    expect({ ...out, ownChallengeReveals: [] }).toEqual(OPEN);
  });

  it("returns the state itself (identity) whenever a condition fails", () => {
    expect(withSettledTimeoutReveal(OPEN, { settlement: null, roundNumber: null }, VIEWER)).toBe(OPEN);
    expect(withSettledTimeoutReveal(OPEN, { settlement: TIMEOUT, roundNumber: 2 }, VIEWER)).toBe(OPEN);
    expect(withSettledTimeoutReveal(OPEN, ref, BOT)).toBe(OPEN);
    expect(withSettledTimeoutReveal(OPEN, { settlement: settlementOf(C.resolved_incorrect), roundNumber: 3 }, VIEWER))
      .toBe(OPEN);
    const other = { ...OPEN, moduleId: "order_forge" };
    expect(withSettledTimeoutReveal(other, ref, VIEWER)).toBe(other);
    expect(withSettledTimeoutReveal(null, ref, VIEWER)).toBeNull();
  });

  it("a served reveal is the authority: never doubled, never replaced", () => {
    const served = { ...OPEN, ownChallengeReveals: [{
      challengeIndex: 0, isCorrect: true, playerAnswer: null, correctAnswer: null,
      explanation: null, answerOptions: [],
    }] };
    expect(withSettledTimeoutReveal(served, ref, VIEWER)).toBe(served);
  });
});
