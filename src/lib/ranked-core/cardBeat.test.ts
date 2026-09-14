/**
 * POINT1 corrective — which card, if any, the header's result plate describes.
 *
 * The projection is the whole phase model for the per-card beat, so these pin
 * the three states it distinguishes and, above all, that it reads the SERVER's
 * `own_revealing_card_index` rather than inferring a phase from a clock.
 */
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { SegmentStateView } from "@/lib/ranked-public/contracts";
import {
  metaReflexSegmentMeta, metaReflexState, publicRoundV2, settledCardReveal,
} from "@/lib/ranked-public/fixtures";
import { projectCardBeat } from "./cardBeat";

function parse(state: unknown): SegmentStateView {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.segment = metaReflexSegmentMeta();
  payload.segment_state = state;
  return readPublicRound(body).segmentState!;
}

const revealing = (index: number, over: Record<string, unknown> = {}) =>
  parse(metaReflexState(index + 1, {
    own_card_reveals: Array.from({ length: index + 1 }, (_, i) =>
      settledCardReveal(i, i === index ? over : {})),
    own_revealing_card_index: index,
  }));

describe("a card being revealed", () => {
  it("names that card, 1-based, with the server's own verdict", () => {
    expect(projectCardBeat(revealing(0))).toEqual({
      outcome: "correct", cardNumber: 1, challengeIndex: 0, roundNumber: null });
  });

  it("carries an incorrect verdict through unchanged", () => {
    expect(projectCardBeat(revealing(2, { outcome: "incorrect" })))
      .toEqual({ outcome: "incorrect", cardNumber: 3, challengeIndex: 2,
        roundNumber: null });
  });

  it("carries a timeout through rather than calling it wrong", () => {
    expect(projectCardBeat(revealing(1, {
      outcome: "timeout", selected_card_id: null,
    }))!.outcome).toBe("timeout");
  });

  it("follows the SERVER's index, not the last entry in the list", () => {
    // Three cards have settled; the server says card TWO is the one on screen.
    const state = parse(metaReflexState(3, {
      own_card_reveals: [0, 1, 2].map((i) => settledCardReveal(i)),
      own_revealing_card_index: 1,
    }));
    expect(projectCardBeat(state)!.challengeIndex).toBe(1);
  });
});

describe("no card is being revealed", () => {
  it("is null while a card is LIVE — the card on screen has no verdict", () => {
    const state = parse(metaReflexState(2, {
      own_card_reveals: [0, 1].map((i) => settledCardReveal(i)),
      own_revealing_card_index: null,
    }));
    expect(projectCardBeat(state)).toBeNull();
  });

  it("is null on the first card, before anything has settled", () => {
    expect(projectCardBeat(parse(metaReflexState(0)))).toBeNull();
  });

  it("is null without a segment at all (an ordinary quiz round)", () => {
    expect(projectCardBeat(null)).toBeNull();
  });
});

describe("the block is over", () => {
  /**
   * Card five has no successor waiting on a clock, so the server stops naming
   * a revealing index — and the fifth card's result must still stand until the
   * block's own settlement replaces it in the same slot.
   */
  it("holds the LAST settled card once the viewer has finished", () => {
    const state = parse(metaReflexState(5, {
      own_card_reveals: [0, 1, 2, 3, 4].map((i) => settledCardReveal(i)),
      own_revealing_card_index: null,
    }));
    expect(projectCardBeat(state)).toEqual({
      outcome: "correct", cardNumber: 5, challengeIndex: 4, roundNumber: null });
  });
});
