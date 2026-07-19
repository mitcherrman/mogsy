import { describe, expect, it } from "vitest";

import { MasteryContractParseError } from "./common";
import { FORBIDDEN_ANSWER_KEYS, assertNoAnswerKey } from "./hiddenInfoGuard";
import { parseMasteryPlayerQuestion } from "./parsers";
import { playerQuestionEnvelopes } from "../fixtures";

describe("assertNoAnswerKey", () => {
  it("passes a clean pre-submission payload", () => {
    expect(() => assertNoAnswerKey({ a: 1, nested: { b: [{ c: "ok" }] } })).not.toThrow();
  });

  it("rejects a top-level correct_answer", () => {
    expect(() => assertNoAnswerKey({ correct_answer: 3 })).toThrow(MasteryContractParseError);
  });

  it("rejects a deeply nested forbidden key and reports the exact path", () => {
    try {
      assertNoAnswerKey({ data: { state: { deep: [{ reaches_zero: true }] } } }, "root");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(MasteryContractParseError);
      expect((e as MasteryContractParseError).path).toBe("root.data.state.deep[0].reaches_zero");
    }
  });

  it("matches forbidden keys case-insensitively", () => {
    expect(() => assertNoAnswerKey({ CorrectAnswer: 1 })).toThrow(MasteryContractParseError);
  });

  it("covers every documented forbidden key", () => {
    for (const key of FORBIDDEN_ANSWER_KEYS) {
      expect(() => assertNoAnswerKey({ [key]: "x" }), `key ${key}`).toThrow(MasteryContractParseError);
    }
  });
});

describe("player-question parser leak prevention", () => {
  const clean = () => playerQuestionEnvelopes()[0];

  it("rejects an injected correct_answer", () => {
    const env = clean();
    (env.data as Record<string, unknown>).correct_answer = 3;
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/correct_answer/);
  });

  it("rejects an injected explanation", () => {
    const env = clean();
    (env.data as Record<string, unknown>).explanation = "the answer is 3";
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/explanation/);
  });

  it("rejects nested calculation values", () => {
    const env = clean();
    (env.data as Record<string, unknown>).calculation_result = { value: 3, unit: "seconds" };
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/calculation_result/);
  });

  it("rejects injected state_changes", () => {
    const env = clean();
    (env.data as Record<string, unknown>).state_changes = [{ delta: -250 }];
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/state_changes/);
  });

  it("rejects injected after-state data", () => {
    const env = clean();
    (env.data as Record<string, unknown>).after_snapshot_id = "snap_deadbeef";
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/after_snapshot_id/);
  });

  it("reports the exact offending path for a nested leak", () => {
    const env = clean();
    ((env.data as Record<string, unknown>).state as Record<string, unknown>).reaches_zero = false;
    try {
      parseMasteryPlayerQuestion(env);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as MasteryContractParseError).path).toBe("player_question.data.state.reaches_zero");
    }
  });
});
