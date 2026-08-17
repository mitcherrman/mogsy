import { describe, expect, it } from "vitest";

import {
  RankedPublicParseError,
  readPublicRound,
  readSegmentReveal,
  readSegmentSettlement,
} from "./contracts";
import {
  icdChallengeState, icdResolvedPayload, icdSegmentMeta, icdSegmentState,
  publicRoundV2,
} from "./fixtures";

function wire(body: { payload: object }): Record<string, unknown> {
  return body.payload as Record<string, unknown>;
}

function withSegment(state: unknown, meta: unknown = icdSegmentMeta()) {
  const body = publicRoundV2();
  wire(body).segment = meta;
  wire(body).segment_state = state;
  return body;
}

describe("owner segment state parsing", () => {
  it("is null for a quiz payload that omits the block entirely", () => {
    expect(readPublicRound(publicRoundV2()).segmentState).toBeNull();
  });

  it("is null for an explicit inactive block", () => {
    const body = publicRoundV2();
    wire(body).segment_state = { active: false };
    expect(readPublicRound(body).segmentState).toBeNull();
  });

  it("reads the ability phase", () => {
    const parsed = readPublicRound(withSegment(icdSegmentState()));
    const state = parsed.segmentState!;
    expect(state.phase).toBe("ability");
    expect(state.segmentNumber).toBe(3);
    expect(state.challengeCount).toBe(5);
    expect(state.ownAbility.confirmed).toBe(false);
    expect(state.ownAbility.availableAbilityIds).toEqual(["tank.fortify"]);
    expect(state.opponentAbilityConfirmed).toBe(false);
    // No card block exists before the challenge phase.
    expect(state.block).toBeNull();
  });

  it("reads an unavailable ability with its reason", () => {
    const parsed = readPublicRound(withSegment(icdSegmentState({
      own_ability: {
        selected_ability_id: null, confirmed: false,
        available_ability_ids: ["mage.arcane_charge"],
        unavailable_ability_ids: {
          "mage.insight": "Mage Insight has no effect in this segment",
        },
      },
    })));
    expect(parsed.segmentState!.ownAbility.unavailableAbilityIds).toEqual({
      "mage.insight": "Mage Insight has no effect in this segment",
    });
  });

  it("reads the challenge phase with five public pairs", () => {
    const state = readPublicRound(withSegment(icdChallengeState(2))).segmentState!;
    expect(state.phase).toBe("challenges");
    // v1 pins the ITEM card contract, so the block reads as item_cost — never
    // as Meta Reflex cards, whatever fields happen to be present.
    expect(state.block?.contract).toBe("item_cost");
    const challenges = state.block?.contract === "item_cost" ? state.block.challenges : [];
    expect(challenges).toHaveLength(5);
    expect(challenges[0].left.itemId).toBe("Item 0");
    // The transport layer carries asset_path VERBATIM (still repo-relative).
    // It is NOT renderable as-is: the renderer must resolve it against the
    // combat API origin via resolveQuizAssetUrl (see itemCostDuelModule).
    expect(challenges[0].right.assetPath).toBe("assets/items/1.png");
    expect(state.ownNextChallengeIndex).toBe(2);
    expect(state.ownSubmittedChoices).toEqual(["Item 0", "Item 2", null, null, null]);
    expect(state.prompt).toBe("Which item costs more?");
  });

  it("carries the opponent only as a count and a finished flag", () => {
    const state = readPublicRound(withSegment(icdChallengeState(5, {
      opponent_challenges_completed: 3, opponent_finished: false,
      own_finished: true,
    }))).segmentState!;
    expect(state.opponentChallengesCompleted).toBe(3);
    expect(state.opponentFinished).toBe(false);
    expect(state.ownFinished).toBe(true);
    expect(Object.keys(state)).not.toContain("opponentChoices");
  });

  it("reads the pressure flag and the shortened deadline", () => {
    const state = readPublicRound(withSegment(icdChallengeState(5, {
      pressure_applied: true,
      challenge_deadline: "2026-07-18T12:00:27+00:00",
    }))).segmentState!;
    expect(state.pressureApplied).toBe(true);
    expect(state.challengeDeadline).toBe("2026-07-18T12:00:27+00:00");
  });

  // ---------------------------------------------- hidden-information guard

  it.each([
    ["left_cost", { left_cost: 3000 }],
    ["right_cost", { right_cost: 3000 }],
    ["correct_item_id", { correct_item_id: "Item 1" }],
    ["price_gap", { price_gap: 500 }],
    ["is_correct", { is_correct: true }],
    ["opponent_choices", { opponent_choices: ["Item 1"] }],
    ["opponent_ability_id", { opponent_ability_id: "mage.overload" }],
    ["opponent_submitted_at", { opponent_submitted_at: "2026-07-18T12:00:06+00:00" }],
    ["score", { score: 4 }],
    ["winner", { winner: "userA" }],
    ["segment_result", { segment_result: "win" }],
  ])("rejects a pre-reveal payload carrying %s", (_name, extra) => {
    expect(() => readPublicRound(withSegment(icdChallengeState(1, extra))))
      .toThrow(RankedPublicParseError);
  });

  it("rejects a hidden field nested deep inside the item pairs", () => {
    const state = icdChallengeState(0) as Record<string, unknown>;
    const block = state.challenges as { challenges: Record<string, unknown>[] };
    (block.challenges[2].left as Record<string, unknown>).cost = 3200;
    expect(() => readPublicRound(withSegment(state))).toThrow(RankedPublicParseError);
  });

  it("does NOT reject the legitimate module id or challenge_count", () => {
    // A substring scan of the JSON would flag `item_cost_duel` (contains
    // "cost") and `challenge_count`. The structural key check must not.
    const state = readPublicRound(withSegment(icdChallengeState(0))).segmentState!;
    expect(state.moduleId).toBe("item_cost_duel");
    expect(state.challengeCount).toBe(5);
  });

  it("rejects a malformed block outright rather than degrading it", () => {
    // Unlike the tolerant `segment` discriminator, this block drives real
    // input, so a broken one must not render at all.
    expect(() => readPublicRound(withSegment({ active: true })))
      .toThrow(RankedPublicParseError);
  });

  it("keeps legacy quiz payloads parsing unchanged", () => {
    const parsed = readPublicRound(publicRoundV2());
    expect(parsed.segment.moduleId).toBe("quiz");
    expect(parsed.segment.phase).toBeNull();
    expect(parsed.segmentState).toBeNull();
    expect(parsed.question?.questionId).toBe("q1");
  });
});

describe("resolved segment reveal parsing", () => {
  it("is null for a quiz settlement", () => {
    expect(readSegmentReveal({ players: [] })).toBeNull();
    expect(readSegmentSettlement({ players: [] })).toBeNull();
  });

  it("reads the whole transcript, including costs and correct items", () => {
    const reveal = readSegmentReveal(icdResolvedPayload())!;
    expect(reveal.moduleId).toBe("item_cost_duel");
    expect(reveal.challenges).toHaveLength(5);
    expect(reveal.moduleVersion).toBe(1);
    expect(reveal.challenges[0].leftValue).toBe("1000g");
    expect(reveal.challenges[0].kind).toBeNull();
    expect(reveal.challenges[0].correctId).toBe("Item 1");
    expect(reveal.players.userA.segmentResult).toBe("win");
    expect(reveal.players.userA.correct).toBe(5);
    expect(reveal.players.userB.unanswered).toBe(1);
    expect(reveal.players.userB.perChallengeMs[4]).toBeNull();
    expect(reveal.items["Item 1"].name).toBe("Item 1");
  });

  it("only accepts the Ranked result vocabulary", () => {
    const payload = icdResolvedPayload() as Record<string, unknown>;
    const reveal = payload.segment_reveal as Record<string, unknown>;
    (reveal.players as Record<string, Record<string, unknown>>)
      .userA.segment_result = "correct";
    expect(readSegmentReveal(payload)!.players.userA.segmentResult).toBeNull();
  });

  it("reads settlement damage and the revealed abilities", () => {
    const settlement = readSegmentSettlement(icdResolvedPayload())!;
    expect(settlement.damageByPlayerId.userA).toBe(15);
    expect(settlement.damageByPlayerId.userB).toBe(0);
    expect(settlement.abilitiesByPlayerId.userA).toBe("tank.fortify");
    expect(settlement.abilitiesByPlayerId.userB).toBeNull();
  });
});
