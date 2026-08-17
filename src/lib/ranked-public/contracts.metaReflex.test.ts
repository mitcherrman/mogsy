/**
 * QUIZ1 Phase 7 — the `item_cost_duel.v4` Meta Reflex card contract.
 *
 * What these lock down is the failure this phase exists to fix: the reader used
 * to demand `item_id` on every card side, so a v4 payload threw, the poll
 * swallowed it, and segment 4 presented as a frozen screen. The rules below are
 * therefore about DISPATCH and FAILING CLOSED, not about field spelling.
 */
import { describe, expect, it } from "vitest";

import {
  META_REFLEX_MIXED_VERSION,
  RankedPublicParseError,
  readPublicRound,
  readSegmentReveal,
  revealChoiceEntityId,
} from "./contracts";
import {
  icdChallengeState, metaReflexCards, metaReflexResolvedPayload,
  metaReflexSegmentMeta, metaReflexState, publicRoundV2,
} from "./fixtures";

function withSegment(state: unknown, meta: unknown = metaReflexSegmentMeta()) {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.segment = meta;
  payload.segment_state = state;
  return body;
}

function parseState(state: unknown, meta?: unknown) {
  return readPublicRound(withSegment(state, meta ?? metaReflexSegmentMeta())).segmentState!;
}

function cards(state: unknown) {
  const block = parseState(state).block;
  if (block?.contract !== "meta_reflex") {
    throw new Error(`expected a meta_reflex block, got ${block?.contract}`);
  }
  return block.cards;
}

/** Replace one card of the fixture block, leaving the rest intact. */
function withCard(index: number, patch: Record<string, unknown>) {
  const list = metaReflexCards() as unknown as Record<string, unknown>[];
  list[index] = { ...list[index], ...patch };
  return metaReflexState(index, {
    challenges: { prompt: "Meta Reflex", challenge_count: 5, challenges: list },
  });
}

describe("Meta Reflex card contract (v4)", () => {
  it("reads the block under the meta_reflex contract, not the item one", () => {
    const state = parseState(metaReflexState(0));
    expect(state.moduleVersion).toBe(META_REFLEX_MIXED_VERSION);
    expect(state.block?.contract).toBe("meta_reflex");
    expect(cards(metaReflexState(0))).toHaveLength(5);
  });

  it("parses a magnitude card with both entities named", () => {
    const card = cards(metaReflexState(0))[0];
    expect(card.kind).toBe("magnitude");
    if (card.kind !== "magnitude") throw new Error("narrowing");
    expect(card.prompt).toBe("Which item costs more gold?");
    expect(card.entityKind).toBe("item");
    expect(card.left.entityId).toBe("Hexdrinker");
    expect(card.left.label).toBe("Hexdrinker");
    expect(card.left.media).toBe("assets/items/3155.png");
    expect(card.leftCardId).toBe("c0:left");
    expect(card.rightCardId).toBe("c0:right");
  });

  it("parses a classification card exactly like a magnitude one, minus the property", () => {
    const card = cards(metaReflexState(0))[1];
    expect(card.kind).toBe("classification");
    if (card.kind !== "classification") throw new Error("narrowing");
    expect(card.left.label).toBe("Kennen");
    expect(card.right.label).toBe("Kha'Zix");
    // The prompt names the PROPERTY — that is the question. What must never
    // appear is which SIDE has it, so neither side carries a classification.
    expect(JSON.stringify([card.left, card.right]))
      .not.toMatch(/Energy|Mana|Ranged|Melee/);
    expect(Object.keys(card.left).sort()).toEqual(["entityId", "label", "media"]);
  });

  it("parses a recognition card with art only — no label, no entity id", () => {
    const card = cards(metaReflexState(0))[2];
    expect(card.kind).toBe("recognition");
    if (card.kind !== "recognition") throw new Error("narrowing");
    expect(card.left.mediaUrl)
      .toBe("/api/ranked/media/segment-card/m1/4/2/left.png");
    expect(card.right.mediaUrl)
      .toBe("/api/ranked/media/segment-card/m1/4/2/right.png");
    // The side carries the URL and nothing else — no name to render, and no
    // id to reverse a name out of.
    expect(Object.keys(card.left)).toEqual(["mediaUrl"]);
  });

  it("keeps a magnitude card with no media parseable", () => {
    const card = cards(metaReflexState(0))[3];
    if (card.kind !== "magnitude") throw new Error("narrowing");
    expect(card.left.media).toBeNull();
    expect(card.left.label).toBe("Vel'Koz");
  });

  it("reads the per-card clock the server issued", () => {
    const state = parseState(metaReflexState(1));
    expect(state.cardTimerMs).toBe(6000);
    expect(state.ownCardIndex).toBe(1);
    expect(state.ownCardDeadline).toBe("2026-07-18T12:00:12+00:00");
    expect(state.ownCardStartedAt).toBe("2026-07-18T12:00:06+00:00");
    expect(state.ownTimedOutChallenges).toEqual([false, false, false, false, false]);
  });

  it("flattens already-submitted choices to their CARD ids", () => {
    expect(parseState(metaReflexState(2)).ownSubmittedChoices)
      .toEqual(["c0:left", "c1:left", null, null, null]);
  });

  // ------------------------------------------------------- failing closed

  it("rejects an unknown card kind rather than guessing what is safe to show", () => {
    expect(() => parseState(withCard(0, { kind: "mystery" })))
      .toThrow(RankedPublicParseError);
  });

  it("rejects a magnitude card missing its entity id", () => {
    expect(() => parseState(withCard(0, {
      left: { label: "Hexdrinker", media: "assets/items/3155.png" },
    }))).toThrow(RankedPublicParseError);
  });

  it("rejects a recognition card that carries a label", () => {
    // Not merely ignored: a label on this kind IS the answer, so a payload
    // carrying one is refused rather than quietly stripped.
    expect(() => parseState(withCard(2, {
      left: { media_url: "/x.png", label: "Xerath W" },
    }))).toThrow(RankedPublicParseError);
  });

  it("rejects a card with no server-issued card ids", () => {
    expect(() => parseState(withCard(0, { left_card_id: undefined })))
      .toThrow(RankedPublicParseError);
  });

  it("does NOT let an old item-cost payload parse as a v4 block", () => {
    // The exact hazard version dispatch exists for: v1 cards presented under a
    // v4 module version must fail loudly, never be coerced into cards.
    const legacyCards = icdChallengeState(0) as Record<string, unknown>;
    const state = metaReflexState(0, { challenges: legacyCards.challenges });
    expect(() => parseState(state)).toThrow(RankedPublicParseError);
  });

  it("does NOT let a v4 payload parse as an item-cost block", () => {
    const state = metaReflexState(0, { module_version: 1 });
    expect(() => parseState(state, metaReflexSegmentMeta({ module_version: 1 })))
      .toThrow(RankedPublicParseError);
  });

  it("still rejects a hidden value smuggled into a card", () => {
    // The pre-reveal key guard runs before the card readers, so a compared
    // magnitude is refused wherever it appears.
    expect(() => parseState(withCard(0, {
      left: { entity_id: "Hexdrinker", label: "Hexdrinker", media: null, cost: 1300 },
    }))).toThrow(RankedPublicParseError);
  });
});

describe("Meta Reflex reveal (v4)", () => {
  it("normalises mixed cards into the settled-card shape", () => {
    const reveal = readSegmentReveal(metaReflexResolvedPayload())!;
    expect(reveal.moduleVersion).toBe(4);
    expect(reveal.challenges).toHaveLength(5);
    expect(reveal.challenges[0].kind).toBe("magnitude");
    expect(reveal.challenges[0].leftId).toBe("L0");
    expect(reveal.challenges[0].leftLabel).toBe("Left 0");
    // v4 magnitudes are gold, HP, armour, range or move speed and the backend
    // sends no unit, so the number is rendered bare — never suffixed "g".
    expect(reveal.challenges[0].leftValue).toBe("1000");
    expect(reveal.challenges[1].leftValue).toBe("Energy");
    expect(reveal.challenges[2].leftValue).toBeNull();
    expect(reveal.challenges[0].correctId).toBe("R0");
  });

  it("resolves a positional choice token to the entity it named", () => {
    const reveal = readSegmentReveal(metaReflexResolvedPayload())!;
    const card = reveal.challenges[0];
    expect(revealChoiceEntityId(reveal, card, "c0:left")).toBe("L0");
    expect(revealChoiceEntityId(reveal, card, "c0:right")).toBe("R0");
    expect(revealChoiceEntityId(reveal, card, null)).toBeNull();
    // A token belonging to another card resolves to nothing rather than to the
    // wrong entity.
    expect(revealChoiceEntityId(reveal, card, "c3:left")).toBeNull();
  });

  it("rejects a v4 reveal card with an unknown kind", () => {
    const payload = metaReflexResolvedPayload() as Record<string, unknown>;
    const reveal = payload.segment_reveal as Record<string, unknown>;
    (reveal.challenges as Record<string, unknown>[])[0].kind = "mystery";
    expect(() => readSegmentReveal(payload)).toThrow(RankedPublicParseError);
  });
});
