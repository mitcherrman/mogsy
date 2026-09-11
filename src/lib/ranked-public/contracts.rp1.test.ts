/**
 * RP1 Step 3 — the wire contract a points client reads.
 *
 * The backend (RP1 Step 2) publishes ONE discriminator and three blocks built
 * on it. These tests fix what this client does with each, and in particular
 * the two things it must NOT do: infer a model from anything but `model`, and
 * accept a block it cannot read.
 */
import { describe, expect, it } from "vitest";
import {
  RankedPublicParseError, readMatchResult, readPublicRound,
} from "./contracts";
import {
  matchResultPointsV1, matchResultV1, publicRoundV2, withPointsScoring,
} from "./fixtures";

describe("the live scoring block", () => {
  it("parses a points match: model, length, module number and completed", () => {
    const view = readPublicRound(withPointsScoring(publicRoundV2(), {
      moduleNumber: 6, matchLength: 10, modulesCompleted: 5,
      scores: { userA: 11, userB: 8 },
    }));
    expect(view.scoring).toEqual({
      model: "points", matchLength: 10, moduleNumber: 6, modulesCompleted: 5,
    });
    expect(view.players.map((p) => [p.playerId, p.score]))
      .toEqual([["userA", 11], ["userB", 8]]);
  });

  it("parses an hp match, whose match length is null and is not invented", () => {
    const env = publicRoundV2();
    (env.payload as Record<string, unknown>).scoring = {
      model: "hp", match_length: null, module_number: 3, modules_completed: 2,
    };
    const view = readPublicRound(env);
    expect(view.scoring?.model).toBe("hp");
    expect(view.scoring?.matchLength).toBeNull();
  });

  /**
   * The compatibility case, and the reason it is `null` rather than a
   * synthesised hp block: this client ships BEFORE the backend does, so every
   * live match it meets today sends no scoring at all.
   */
  it("reads a pre-RP1 payload — no scoring block — as null, not as a failure", () => {
    const view = readPublicRound(publicRoundV2());
    expect(view.scoring).toBeNull();
    expect(view.players.every((p) => p.score === null)).toBe(true);
  });

  it("REFUSES a scoring block whose model it does not recognise", () => {
    const env = publicRoundV2();
    (env.payload as Record<string, unknown>).scoring = {
      model: "elo", match_length: 10, module_number: 1, modules_completed: 0,
    };
    expect(() => readPublicRound(env)).toThrow(RankedPublicParseError);
    expect(() => readPublicRound(env)).toThrow(/scoring.model/);
  });

  it("REFUSES a scoring block missing a module number", () => {
    const env = publicRoundV2();
    (env.payload as Record<string, unknown>).scoring = {
      model: "points", match_length: 10, modules_completed: 0,
    };
    expect(() => readPublicRound(env)).toThrow(RankedPublicParseError);
  });
});

describe("the result scoreline", () => {
  it("parses both final scores beside the backend's own winner", () => {
    const view = readMatchResult(
      matchResultPointsV1({ userA: 24, userB: 19 }));
    expect(view.scoring).toEqual({
      model: "points", matchLength: 10, modulesPlayed: 10,
      finalScores: { userA: 24, userB: 19 },
    });
    // The winner is still the result row's, never a comparison of the two.
    expect(view.winnerUserId).toBe("userA");
  });

  it("carries a draw's equal scores without deciding anything from them", () => {
    const view = readMatchResult(matchResultPointsV1(
      { userA: 18, userB: 18 }, { outcome: "draw", winner: null }));
    expect(view.scoring?.finalScores).toEqual({ userA: 18, userB: 18 });
    expect(view.outcome).toBe("draw");
    expect(view.winnerUserId).toBeNull();
  });

  it("reads a legacy hp result — no scoring — as null", () => {
    expect(readMatchResult(matchResultV1("combat")).scoring).toBeNull();
  });

  it("REFUSES a result scoreline it cannot read", () => {
    const env = matchResultPointsV1({ userA: 1, userB: 2 });
    (env.payload as Record<string, unknown>).scoring = {
      model: "points", match_length: 10, modules_played: 10,
      final_scores: { userA: "lots" },
    };
    expect(() => readMatchResult(env)).toThrow(RankedPublicParseError);
  });
});
