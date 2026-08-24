/**
 * RG3 — the settled-card carve-out in the live segment reader.
 *
 * `own_card_reveals` is the ONE key of a live payload that legitimately carries
 * answers. These tests exist to prove that widening the reader for it did not
 * widen it for anything else: the pre-reveal walk must still reject the same
 * fields everywhere they are not, and the carve-out itself must still refuse a
 * card the viewer can still play.
 */
import { describe, expect, it } from "vitest";
import { RankedPublicParseError, readPublicRound } from "./contracts";
import {
  metaReflexSegmentMeta, metaReflexState, publicRoundV2, settledCardReveal,
} from "./fixtures";

function parse(state: unknown) {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.segment = metaReflexSegmentMeta();
  payload.segment_state = state;
  return readPublicRound(body).segmentState!;
}

describe("settled-card reveals", () => {
  it("is empty before the viewer has finished a card", () => {
    expect(parse(metaReflexState(0)).ownCardReveals).toEqual([]);
  });

  it("reads exactly the cards behind the viewer's active index", () => {
    const state = parse(metaReflexState(3));
    expect(state.ownCardReveals.map((r) => r.challengeIndex)).toEqual([0, 1, 2]);
    expect(state.ownNextChallengeIndex).toBe(3);
  });

  it("carries the server's own words and numbers, unparsed", () => {
    const [card] = parse(metaReflexState(1)).ownCardReveals;
    expect(card).toEqual({
      challengeIndex: 0,
      kind: "magnitude",
      entityKind: "item",
      outcome: "correct",
      selectedCardId: "c0:left",
      correctCardId: "c0:left",
      left: { label: "Infinity Edge", valueDisplay: "3,450 gold" },
      right: { label: "Bloodthirster", valueDisplay: "3,400 gold" },
    });
  });

  it("reads a recognition card's labels with null values", () => {
    const [card] = parse(metaReflexState(1, {
      own_card_reveals: [settledCardReveal(0, {
        kind: "recognition",
        left: { label: "Ashe", value_display: null },
        right: { label: "Vayne", value_display: null },
      })],
    })).ownCardReveals;
    expect(card.kind).toBe("recognition");
    expect(card.left.valueDisplay).toBeNull();
  });

  it("REFUSES a payload that discloses the card the viewer is looking at", () => {
    expect(() => parse(metaReflexState(1, {
      own_card_reveals: [settledCardReveal(0), settledCardReveal(1)],
    }))).toThrow(RankedPublicParseError);
    // Refused, not filtered: a contract breach here is the answer to a live
    // card, and half-obeying it would hide the breach instead of reporting it.
    expect(() => parse(metaReflexState(1, {
      own_card_reveals: [settledCardReveal(1)],
    }))).toThrow(/still answer card 1/);
  });

  it("refuses an outcome vocabulary it does not know", () => {
    expect(() => parse(metaReflexState(1, {
      own_card_reveals: [settledCardReveal(0, { outcome: "won" })],
    }))).toThrow(RankedPublicParseError);
  });

  it("still rejects an answer field anywhere OUTSIDE the carve-out", () => {
    // The whole point of lifting the reveals out rather than exempting the key:
    // the guard must be exactly as sharp everywhere else as it was before.
    for (const leak of [
      { left_value: 3200 },
      { right_value: 2900 },
      { correct_entity_id: "Infinity Edge" },
      { correct_card_id: "c0:left" },
    ]) {
      expect(() => parse(metaReflexState(0, {
        challenges: { prompt: "Meta Reflex", challenge_count: 5,
                      challenges: [leak] },
      }))).toThrow(RankedPublicParseError);
    }
  });

  it("keeps rejecting the fields it always rejected", () => {
    expect(() => parse(metaReflexState(0, { correct_index: 1 })))
      .toThrow(RankedPublicParseError);
    expect(() => parse(metaReflexState(0, { opponent_choices: [] })))
      .toThrow(RankedPublicParseError);
  });

  it("reads a backend that does not send the field at all", () => {
    const state = metaReflexState(2) as Record<string, unknown>;
    delete state.own_card_reveals;
    expect(parse(state).ownCardReveals).toEqual([]);
  });
});
