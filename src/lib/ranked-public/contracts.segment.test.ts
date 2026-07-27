import { describe, expect, it } from "vitest";

import { LEGACY_SEGMENT, readPublicRound, readPrivatePlayer } from "./contracts";
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
