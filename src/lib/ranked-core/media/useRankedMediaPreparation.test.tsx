/**
 * RFX1 Phase 2B1 — Meta Reflex: the whole five-card block is prepared the
 * moment the block round is known, not card by card.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import { __resetPreparedImagesForTests } from "./prepareImage";
import { useRankedMediaPreparation } from "./useRankedMediaPreparation";

let requested: string[];
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = "";
  set src(v: string) { requested.push(v); }
  decode() { return Promise.resolve(); }
}
beforeEach(() => { requested = []; __resetPreparedImagesForTests(); vi.stubGlobal("Image", FakeImage); });
afterEach(() => vi.unstubAllGlobals());

const quiz = { matchId: "m1", activeRound: { roundNumber: 3 }, players: [], segmentState: null,
  question: { questionId: "q3", prompt: "p", options: ["a", "b"], category: "trivia" } } as unknown as PublicRoundView;

const block = (current: number) => ({
  matchId: "m1", activeRound: { roundNumber: 4 }, players: [], question: null,
  segment: { moduleId: "item_cost_duel", moduleVersion: 4, challengeCount: 5, challengeIndex: current },
  segmentState: {
    segmentNumber: 4, ownNextChallengeIndex: current,
    block: { contract: "meta_reflex", cards: [0, 1, 2, 3, 4].map((i) => ({
      kind: "magnitude", challengeIndex: i, prompt: "p", entityKind: "item",
      leftCardId: `l${i}`, rightCardId: `r${i}`,
      left: { entityId: `a${i}`, label: `A${i}`, media: `assets/items/mr-a${i}.png` },
      right: { entityId: `b${i}`, label: `B${i}`, media: `assets/items/mr-b${i}.png` },
    })) },
  },
}) as unknown as PublicRoundView;

const cardUrls = [0, 1, 2, 3, 4].flatMap((i) =>
  [resolveQuizAssetUrl(`assets/items/mr-a${i}.png`), resolveQuizAssetUrl(`assets/items/mr-b${i}.png`)]);

describe("Meta Reflex block preparation", () => {
  it("prepares all five cards while the previous round is still presented (Tier 3)", () => {
    renderHook(() => useRankedMediaPreparation({ live: block(0), presented: quiz }));
    expect(requested).toEqual(expect.arrayContaining(cardUrls));
  });

  it("prepares all five cards at block start, before cards 2–5 are current (Tier 2)", () => {
    renderHook(() => useRankedMediaPreparation({ live: block(0), presented: block(0) }));
    expect(requested).toEqual(expect.arrayContaining(cardUrls));
  });

  it("does not re-request the block as the viewer advances card by card", () => {
    const { rerender } = renderHook(({ r }) => useRankedMediaPreparation({ live: r, presented: r }),
      { initialProps: { r: block(0) } });
    const before = requested.length;
    rerender({ r: block(1) });
    rerender({ r: block(2) });
    expect(requested.length).toBe(before);
  });
});
