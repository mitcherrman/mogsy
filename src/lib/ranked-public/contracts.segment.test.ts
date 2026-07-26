import { describe, expect, it } from "vitest";

import { LEGACY_SEGMENT, readPublicRound, readPrivatePlayer } from "./contracts";
import { privatePlayerV2, publicRoundV2 } from "./fixtures";

describe("additive segment discriminator parsing (Phase A)", () => {
  it("defaults a v2 payload with no segment block to quiz.v1", () => {
    const body = publicRoundV2();
    expect(body.payload).not.toHaveProperty("segment");
    expect(readPublicRound(body).segment).toEqual(LEGACY_SEGMENT);
  });

  it("reads an explicit quiz segment block", () => {
    const body = publicRoundV2();
    body.payload.segment = {
      module_id: "quiz", module_version: 1,
      challenge_count: 1, challenge_index: 0,
    };
    expect(readPublicRound(body).segment).toEqual({
      moduleId: "quiz", moduleVersion: 1, challengeCount: 1, challengeIndex: 0,
    });
  });

  it("reads a future multi-challenge segment without losing fidelity", () => {
    const body = publicRoundV2();
    body.payload.segment = {
      module_id: "item_cost_duel", module_version: 1,
      challenge_count: 5, challenge_index: 3,
    };
    expect(readPublicRound(body).segment).toEqual({
      moduleId: "item_cost_duel", moduleVersion: 1,
      challengeCount: 5, challengeIndex: 3,
    });
  });

  it("populates the segment on the private payload too", () => {
    const body = privatePlayerV2();
    body.payload.segment = {
      module_id: "quiz", module_version: 1,
      challenge_count: 1, challenge_index: 0,
    };
    expect(readPrivatePlayer(body).segment.moduleId).toBe("quiz");
  });

  it.each([null, "quiz", 42, [], {}, { module_id: 7 }, { module_version: -3 }])(
    "degrades a malformed segment block to the legacy default (%j)",
    (segment) => {
      const body = publicRoundV2();
      body.payload.segment = segment;
      // This block carries no secret and no combat value, so an unparseable
      // one must not break an otherwise valid live match.
      expect(readPublicRound(body).segment).toEqual(LEGACY_SEGMENT);
    });

  it("does not weaken the strict correctness guards", () => {
    const body = publicRoundV2();
    body.payload.segment = { module_id: "quiz", module_version: 1 };
    body.payload.correct_index = 2;
    expect(() => readPublicRound(body)).toThrow();
  });

  it("leaves the question payload untouched alongside the segment", () => {
    const body = publicRoundV2();
    body.payload.segment = { module_id: "quiz", module_version: 1 };
    const parsed = readPublicRound(body);
    expect(parsed.question?.questionId).toBe("q1");
    expect(parsed.question?.options.length).toBeGreaterThan(0);
  });
});
