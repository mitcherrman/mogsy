import { describe, expect, it } from "vitest";

import {
  LEGACY_SEGMENT, readPublicRound, readPrivatePlayer, readSegmentSettlement,
} from "./contracts";
import { privatePlayerV2, publicRoundV2 } from "./fixtures";

/**
 * The v2 fixtures are object literals, so TypeScript infers an exact shape with
 * no `segment` key. These tests deliberately bolt additive/oversized keys onto
 * that raw wire body to exercise the reader, which is precisely what a newer
 * backend would send. Widening the fixture types would weaken them for every
 * other consumer, so the widening is local to this file.
 */
function wire(body: { payload: object }): Record<string, unknown> {
  return body.payload as Record<string, unknown>;
}

describe("additive segment discriminator parsing (Phase A)", () => {
  it("defaults a v2 payload with no segment block to quiz.v1", () => {
    const body = publicRoundV2();
    expect(body.payload).not.toHaveProperty("segment");
    expect(readPublicRound(body).segment).toEqual(LEGACY_SEGMENT);
  });

  it("reads an explicit quiz segment block", () => {
    const body = publicRoundV2();
    wire(body).segment = {
      module_id: "quiz", module_version: 1,
      challenge_count: 1, challenge_index: 0,
    };
    // Still an EXHAUSTIVE comparison: a backend that omits the Phase B phase
    // fields must read as a segment with no phase and no deadlines, which is
    // exactly what LEGACY_SEGMENT carries for them.
    expect(readPublicRound(body).segment).toEqual({
      ...LEGACY_SEGMENT,
      moduleId: "quiz", moduleVersion: 1, challengeCount: 1, challengeIndex: 0,
    });
  });

  it("reads a multi-challenge segment without losing fidelity", () => {
    const body = publicRoundV2();
    wire(body).segment = {
      module_id: "item_cost_duel", module_version: 1,
      challenge_count: 5, challenge_index: 3,
    };
    expect(readPublicRound(body).segment).toEqual({
      ...LEGACY_SEGMENT,
      moduleId: "item_cost_duel", moduleVersion: 1,
      challengeCount: 5, challengeIndex: 3,
    });
  });

  it("reads the Phase B phase envelope when the backend sends it", () => {
    const body = publicRoundV2();
    wire(body).segment = {
      module_id: "item_cost_duel", module_version: 1,
      challenge_count: 5, challenge_index: 2, segment_number: 3,
      phase: "challenges", ability_deadline: "2026-07-26T12:00:05+00:00",
      challenge_started_at: "2026-07-26T12:00:05+00:00",
      challenge_deadline: "2026-07-26T12:00:30+00:00",
      pressure_applied: true, resolved: false,
    };
    expect(readPublicRound(body).segment).toEqual({
      moduleId: "item_cost_duel", moduleVersion: 1, challengeCount: 5,
      challengeIndex: 2, segmentNumber: 3, phase: "challenges",
      abilityDeadline: "2026-07-26T12:00:05+00:00",
      challengeStartedAt: "2026-07-26T12:00:05+00:00",
      challengeDeadline: "2026-07-26T12:00:30+00:00",
      pressureApplied: true, resolved: false,
    });
  });

  it("degrades an unrecognised phase value to no phase", () => {
    const body = publicRoundV2();
    wire(body).segment = { module_id: "quiz", phase: "something_new" };
    expect(readPublicRound(body).segment.phase).toBeNull();
  });

  it("populates the segment on the private payload too", () => {
    const body = privatePlayerV2();
    wire(body).segment = {
      module_id: "quiz", module_version: 1,
      challenge_count: 1, challenge_index: 0,
    };
    expect(readPrivatePlayer(body).segment.moduleId).toBe("quiz");
  });

  it.each([null, "quiz", 42, [], {}, { module_id: 7 }, { module_version: -3 }])(
    "degrades a malformed segment block to the legacy default (%j)",
    (segment) => {
      const body = publicRoundV2();
      wire(body).segment = segment;
      // This block carries no secret and no combat value, so an unparseable
      // one must not break an otherwise valid live match.
      expect(readPublicRound(body).segment).toEqual(LEGACY_SEGMENT);
    });

  it("does not weaken the strict correctness guards", () => {
    const body = publicRoundV2();
    wire(body).segment = { module_id: "quiz", module_version: 1 };
    wire(body).correct_index = 2;
    expect(() => readPublicRound(body)).toThrow();
  });

  it("leaves the question payload untouched alongside the segment", () => {
    const body = publicRoundV2();
    wire(body).segment = { module_id: "quiz", module_version: 1 };
    const parsed = readPublicRound(body);
    expect(parsed.question?.questionId).toBe("q1");
    expect(parsed.question?.options.length).toBeGreaterThan(0);
  });
});

/**
 * META REFLEX ADDITIVE SCORING, on the wire.
 *
 * The locked rules live in the backend module (`item_cost_duel.block_damage`,
 * `PERFECT_BONUS` / `SPEED_BONUS`) and are proven by its own tests: 1 damage a
 * correct card, +1 for a perfect 5/5, +1 more if that perfect player finished
 * strictly sooner. The settlement STATES the two bonuses as `perfect` and
 * `speed_bonus`, and the resolved projection forwards the settlement verbatim.
 *
 * These pin the reader's half of that contract: the flags survive the wire
 * faithfully, they are never inferred from timings, and a v1 block that
 * carries none of them still parses byte-identically.
 */
describe("Meta Reflex additive bonuses reach the client", () => {
  const revealPayload = (over: Record<string, unknown> = {}) => ({
    players: [
      { player_id: "userA", damage: { final_damage_dealt: 7 } },
      { player_id: "userB", damage: { final_damage_dealt: 2 } },
    ],
    segment_reveal: {
      module_id: "item_cost_duel", module_version: 4, challenge_count: 5,
      challenges: [],
      players: {
        userA: {
          segment_result: "win", correct: 5, incorrect: 0, unanswered: 0,
          total_response_ms: 4000, per_challenge_ms: [800, 800, 800, 800, 800],
          choices: [], damage_dealt: 7, perfect: true, speed_bonus: 1,
          ...over,
        },
        userB: {
          segment_result: "loss", correct: 2, incorrect: 3, unanswered: 0,
          total_response_ms: 9000, per_challenge_ms: [], choices: [],
          damage_dealt: 2, perfect: false, speed_bonus: 0,
        },
      },
    },
  });

  it("carries a perfect block and its speed premium", () => {
    const s = readSegmentSettlement(revealPayload())!;
    expect(s.reveal.players.userA).toMatchObject({
      correct: 5, perfect: true, speedBonus: 1, damageDealt: 7,
    });
  });

  it("carries the opponent's lack of both", () => {
    const s = readSegmentSettlement(revealPayload())!;
    expect(s.reveal.players.userB).toMatchObject({
      correct: 2, perfect: false, speedBonus: 0, damageDealt: 2,
    });
  });

  it("reads a perfect block that was SLOWER as perfect with no speed premium", () => {
    // 5/5 = 5 correct + 1 perfect = 6, and the premium goes to the other side.
    const s = readSegmentSettlement(revealPayload({
      damage_dealt: 6, perfect: true, speed_bonus: 0 }))!;
    expect(s.reveal.players.userA).toMatchObject({ perfect: true, speedBonus: 0 });
  });

  it("never infers a premium for a FAST but imperfect block", () => {
    // The rule the backend enforces: speed is layered on accuracy and is worth
    // nothing without it. 4/5 and fastest is still 4. The reader must take the
    // settlement's word for that and must not reach for `per_challenge_ms`.
    const s = readSegmentSettlement(revealPayload({
      correct: 4, incorrect: 1, damage_dealt: 4, perfect: false, speed_bonus: 0,
      total_response_ms: 100, per_challenge_ms: [20, 20, 20, 20, 20],
    }))!;
    expect(s.reveal.players.userA).toMatchObject({
      correct: 4, perfect: false, speedBonus: 0,
    });
  });

  it("parses a v1 block that has no additive fields at all, unchanged", () => {
    // A shipped version's payload is part of its replay contract, so absence
    // must read as "no bonus", never as a malformed payload.
    const body = revealPayload();
    const players = (body.segment_reveal as Record<string, unknown>)
      .players as Record<string, Record<string, unknown>>;
    for (const p of Object.values(players)) {
      delete p.damage_dealt; delete p.perfect; delete p.speed_bonus;
    }
    const s = readSegmentSettlement(body)!;
    expect(s.reveal.players.userA).toMatchObject({
      correct: 5, perfect: false, speedBonus: 0, damageDealt: null,
    });
  });

  it("keeps the ENGINE's final damage separate from the module's block damage", () => {
    // They can legitimately differ — an outgoing bonus, a shield, a reduction —
    // and the settlement is the authority on which is which. `damageDealt` is
    // what the module derived; `damageByPlayerId` is what actually landed.
    const body = revealPayload();
    (body.players as Record<string, unknown>[])[0].damage = {
      final_damage_dealt: 9 };
    const s = readSegmentSettlement(body)!;
    expect(s.reveal.players.userA.damageDealt).toBe(7);   // module-derived
    expect(s.damageByPlayerId.userA).toBe(9);             // authoritative
  });
});
