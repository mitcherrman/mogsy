/**
 * OF4-FIX2 — the lock's inline reveal: read by the existing reveal reader, and
 * attached to the presented Order Forge segment only on an exact match.
 * Inputs are the REAL backend bodies of a bot playtest lock.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import * as api from "@/lib/ranked-public/client";
import {
  ORDER_FORGE_MODULE_ID, RankedPublicParseError, readOwnChallengeReveal, readPublicRound,
  type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import capture from "@/lib/ranked-public/__fixtures__/orderForgeBotLockCapture.json";
import { withInlineOrderForgeReveal, type OrderForgeLockRevealRef } from "./orderForgeLockReveal";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;
const MID = C.public_before_lock.match_id as string;
const RAW = C.submit.challenge_reveal;

const preLock = (): SegmentStateView => readPublicRound(C.public_before_lock).segmentState!;
const lock = (over: Partial<OrderForgeLockRevealRef> = {}): OrderForgeLockRevealRef => ({
  matchId: MID, segmentNumber: 1,
  reveal: readOwnChallengeReveal(RAW, C.submit.next_challenge_index, ORDER_FORGE_MODULE_ID),
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("the lock ack keeps the server's inline reveal", () => {
  it("preserves `challenge_reveal` raw on an accepted ack, and null when absent", async () => {
    const bodies = [C.submit, { ...C.submit, challenge_reveal: undefined }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(bodies.shift()),
      { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch);
    const ack = await api.submitSegmentChallenge(MID, 1, 0, { order: RAW.order });
    expect(ack.segmentResolved).toBe(true);
    expect(ack.challengeReveal).toEqual(RAW);
    const bare = await api.submitSegmentChallenge(MID, 1, 0, { order: RAW.order });
    expect(bare.challengeReveal).toBeNull();
  });

  it("reads it with the SAME reader as `own_challenge_reveals`, verbatim", () => {
    const r = readOwnChallengeReveal(RAW, 1, ORDER_FORGE_MODULE_ID);
    expect(r.challengeIndex).toBe(0);
    expect(r.orderForge).toEqual({
      order: RAW.order,
      canonicalOrder: RAW.canonical_order,
      positionCorrect: RAW.position_correct,
      isCorrect: false,
      valueDisplay: Object.fromEntries(RAW.entries.map((e: any) => [e.entry_id, e.value_display])),
    });
  });

  it("keeps the disclosure guard: a reveal of a challenge still answerable is refused", () => {
    expect(() => readOwnChallengeReveal(RAW, 0, ORDER_FORGE_MODULE_ID)).toThrow(RankedPublicParseError);
  });
});

describe("withInlineOrderForgeReveal", () => {
  it("attaches the reveal to the matching frozen segment, without touching the snapshot", () => {
    const state = preLock();
    const before = JSON.stringify(state);
    const out = withInlineOrderForgeReveal(state, lock(), MID)!;
    expect(out).not.toBe(state);
    expect(out.ownChallengeReveals).toEqual([lock().reveal]);
    expect(JSON.stringify(state)).toBe(before);   // the server snapshot is not mutated
    expect(state.ownChallengeReveals).toEqual([]);
  });

  it("a reveal from another segment never attaches (stale segment)", () => {
    const state = preLock();
    expect(withInlineOrderForgeReveal(state, lock({ segmentNumber: 2 }), MID)).toBe(state);
    const next = readPublicRound(C.public_after_lock).segmentState!;
    expect(next.segmentNumber).toBe(2);
    expect(withInlineOrderForgeReveal(next, lock(), MID)).toBe(next);
  });

  it("a reveal from another match never attaches (stale match)", () => {
    const state = preLock();
    expect(withInlineOrderForgeReveal(state, lock({ matchId: "rkb_other" }), MID)).toBe(state);
    expect(withInlineOrderForgeReveal(state, lock(), "rkb_other")).toBe(state);
    expect(withInlineOrderForgeReveal(state, lock(), null)).toBe(state);
  });

  it("a snapshot that already carries its own reveal wins: no duplicate, no conflict", () => {
    const own = { ...preLock(), ownChallengeReveals: [lock().reveal] };
    expect(withInlineOrderForgeReveal(own, lock(), MID)).toBe(own);
  });

  it("does nothing for another module, no reveal, or no state", () => {
    const state = { ...preLock(), moduleId: "mastery_slice" };
    expect(withInlineOrderForgeReveal(state, lock(), MID)).toBe(state);
    expect(withInlineOrderForgeReveal(preLock(), null, MID)?.ownChallengeReveals).toEqual([]);
    expect(withInlineOrderForgeReveal(null, lock(), MID)).toBeNull();
  });
});
