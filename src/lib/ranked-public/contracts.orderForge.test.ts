/**
 * OF1-B — the `order_forge.v1` reader boundary.
 *
 * The exact server field names are the ASSUMED contract documented in
 * `fixtures.ts`; these tests pin what the readers do with it, including the
 * pre-reveal guards.
 */
import { describe, expect, it } from "vitest";
import {
  RankedPublicParseError, readMatchReview, readPublicRound, readSegmentReveal,
} from "./contracts";
import {
  orderForgeChallengeReveal, orderForgeSegmentMeta, orderForgeState, publicRoundV2,
} from "./fixtures";

function parse(state: unknown) {
  const body = publicRoundV2();
  (body.payload as Record<string, unknown>).segment = orderForgeSegmentMeta();
  (body.payload as Record<string, unknown>).segment_state = state;
  return readPublicRound(body);
}

describe("order_forge segment state", () => {
  it("reads the public block without falling through to the item-cost reader", () => {
    const s = parse(orderForgeState()).segmentState!;
    expect(s.block).toEqual({
      contract: "order_forge",
      prompt: "Order these items by gold cost",
      metricLabel: "Gold cost",
      directionLabels: { first: "Cheapest", last: "Most expensive" },
      entries: [
        { entryId: "e0", label: "Kindlegem", media: null },
        { entryId: "e1", label: "Infinity Edge", media: null },
        { entryId: "e2", label: "Long Sword", media: null },
        { entryId: "e3", label: "Sunfire Aegis", media: null },
        { entryId: "e4", label: "Zhonya's Hourglass", media: null },
      ],
    });
    expect(s.revealWindowMs).toBe(2500);
  });

  it("accepts entry media as a url string or a {src, alt} object", () => {
    const state = orderForgeState();
    const entries = (state.challenges.challenges[0] as { entries: Record<string, unknown>[] }).entries;
    entries[0].media = "assets/items/3067.png";
    entries[1].media = { src: "assets/items/3031.png", alt: "" };
    const b = parse(state).segmentState!.block as { entries: { media: unknown }[] };
    expect(b.entries[0].media).toEqual({ src: "assets/items/3067.png", alt: "" });
    expect(b.entries[1].media).toEqual({ src: "assets/items/3031.png", alt: "" });
  });

  it("echoes the viewer's whole order as ownSubmittedChoices", () => {
    expect(parse(orderForgeState()).segmentState!.ownSubmittedChoices).toEqual([null]);
    expect(parse(orderForgeState({}, true)).segmentState!.ownSubmittedChoices)
      .toEqual([["e3", "e0", "e4", "e1", "e2"]]);
  });

  it("refuses a live payload that carries the canonical order or a value", () => {
    for (const leak of [
      { canonical_order: ["e0"] },
      { position_correct: [true] },
      { value_display: { e0: "800 g" } },
    ]) {
      const state = orderForgeState();
      Object.assign(state.challenges.challenges[0], leak);
      expect(() => parse(state)).toThrow(RankedPublicParseError);
    }
    const state = orderForgeState();
    (state.challenges as Record<string, unknown>).cost = 350;
    expect(() => parse(state)).toThrow(RankedPublicParseError);
  });

  it("rejects an order echo that is not a list of ids", () => {
    expect(() => parse(orderForgeState({ own_submitted_choices: [{ order: "e0" }] })))
      .toThrow(RankedPublicParseError);
  });

  it("reads the viewer's own reveal (and only for a challenge they have passed)", () => {
    const s = parse(orderForgeState({ own_challenge_reveals: [orderForgeChallengeReveal()] }, true))
      .segmentState!;
    const r = s.ownChallengeReveals[0].orderForge!;
    expect(r.order).toEqual(["e3", "e0", "e4", "e1", "e2"]);
    expect(r.canonicalOrder).toEqual(["e2", "e0", "e3", "e4", "e1"]);
    expect(r.valueDisplay).toMatchObject({ e2: "350 g", e1: "3600 g" });
    expect(r.positionCorrect).toEqual([false, true, false, false, false]);
    expect(r.isCorrect).toBe(false);
    // A reveal for a challenge the viewer may still answer is a breach.
    expect(() => parse(orderForgeState({ own_challenge_reveals: [orderForgeChallengeReveal()] }, false)))
      .toThrow(RankedPublicParseError);
  });

  it("still reads a legacy module unchanged (unknown ids are not order_forge)", () => {
    const body = publicRoundV2();
    (body.payload as Record<string, unknown>).segment_state = null;
    expect(readPublicRound(body).segmentState).toBeNull();
  });
});

describe("order_forge segment reveal (settlement)", () => {
  const payload = {
    segment_reveal: {
      module_id: "order_forge", module_version: 1, challenge_count: 1,
      canonical_order: ["e2", "e0", "e3", "e4", "e1"],
      entries: [
        { entry_id: "e0", label: "Kindlegem", value_display: "800 g" },
        { entry_id: "e1", label: "Infinity Edge", value_display: "3600 g" },
        { entry_id: "e2", label: "Long Sword", value_display: "350 g" },
        { entry_id: "e3", label: "Sunfire Aegis", value_display: "2700 g" },
        { entry_id: "e4", label: "Zhonya's Hourglass", value_display: "3250 g" },
      ],
      players: {
        userA: { order: ["e3", "e0", "e4", "e1", "e2"], position_correct: [false, true, false, false, false],
          segment_result: "loss", points_awarded: 0, duration_ms: 9000 },
        userB: { order: ["e2", "e0", "e3", "e4", "e1"], position_correct: [true, true, true, true, true],
          segment_result: "win", points_awarded: 6, duration_ms: 12000 },
      },
    },
  };

  it("reads both players' orders and the canonical one once settled", () => {
    const r = readSegmentReveal(payload)!;
    expect(r.challenges).toEqual([]);
    expect(r.orderForge!.canonicalOrder).toEqual(["e2", "e0", "e3", "e4", "e1"]);
    expect(r.orderForge!.orders.userA).toEqual(["e3", "e0", "e4", "e1", "e2"]);
    expect(r.orderForge!.labels.e2).toBe("Long Sword");
    expect(r.players.userB.segmentResult).toBe("win");
    expect(r.players.userA.correct).toBe(0);
  });

  it("treats a missing order as no answer", () => {
    const p = JSON.parse(JSON.stringify(payload));
    delete p.segment_reveal.players.userA.order;
    expect(readSegmentReveal(p)!.orderForge!.orders.userA).toBeNull();
  });
});

describe("order_forge match review", () => {
  const round = (over: Record<string, unknown> = {}) => ({
    round_number: 2, kind: "order_forge", module_id: "order_forge", category: null,
    canonical_question_ref: null, revealed: true,
    icon_hint: { kind: "generic", key: null, icon: null },
    question: null, challenges: null,
    entries: [
      { entry_id: "e0", label: "Kindlegem", media: null, value_display: "800 g" },
      { entry_id: "e1", label: "Infinity Edge", media: null, value_display: "3600 g" },
    ],
    viewer_order: ["e1", "e0"], canonical_order: ["e0", "e1"],
    outcome: "incorrect", position_correct: [false, false],
    viewer_submission: {
      answer_index: null, is_correct: false, correct_count: null,
      answered_count: null, challenge_count: null,
    },
    ...over,
  });
  const envelope = (rounds: unknown[]) => ({
    schema_version: "ranked_duel.match_review.v1", projection_type: "match_review",
    match_id: "m1", round_number: null, server_time: "2026-07-18T12:00:00+00:00",
    payload: { match_id: "m1", final_round_number: 2, round_count: 2, rounds },
  });

  it("does not throw the whole review on the new kind, and reads it", () => {
    const view = readMatchReview(envelope([round()]));
    const of = view.rounds[0].orderForge!;
    expect(view.rounds[0].kind).toBe("order_forge");
    expect(of.viewerOrder).toEqual(["e1", "e0"]);
    expect(of.canonicalOrder).toEqual(["e0", "e1"]);
    expect(of.entries[0]).toMatchObject({ entryId: "e0", valueDisplay: "800 g" });
    expect(of.outcome).toBe("incorrect");
    expect(of.positionCorrect).toEqual([false, false]);
  });

  it("refuses an unrevealed order_forge round that carries the canonical order or values", () => {
    expect(() => readMatchReview(envelope([round({ revealed: false })])))
      .toThrow(RankedPublicParseError);
    const ok = readMatchReview(envelope([round({
      revealed: false, canonical_order: null, position_correct: [], outcome: null,
      entries: [{ entry_id: "e0", label: "Kindlegem", media: null, value_display: null }],
    })]));
    expect(ok.rounds[0].orderForge!.canonicalOrder).toBeNull();
  });

  it("still rejects a genuinely unknown kind", () => {
    expect(() => readMatchReview(envelope([round({ kind: "whatever" })])))
      .toThrow(/kind is unknown/);
  });
});
