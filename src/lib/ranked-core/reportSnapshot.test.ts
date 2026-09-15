/**
 * FB1-4 — the arena's projection, and the answer rule it enforces.
 *
 * The reporting control is reachable at any moment of a live round, so the one
 * thing that must be structurally impossible is for it to put an unrevealed
 * correct answer into a row the player can read back. That is asserted here
 * rather than trusted to the controller.
 */
import { describe, expect, it } from "vitest";

import { arenaReportSnapshot } from "./reportSnapshot";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";

const IDENTITY = { mode: "Ranked", category: "Ranked" } as const;

function round(overrides: Partial<PublicRoundView> = {}): PublicRoundView {
  return {
    matchId: "match-1",
    activeRound: { roundNumber: 3 } as PublicRoundView["activeRound"],
    segment: { moduleId: "quiz", moduleVersion: 1 } as PublicRoundView["segment"],
    question: {
      questionId: "q-77",
      prompt: "Which item gives the most armor?",
      options: ["Thornmail", "Warmog's", "Bloodthirster"],
      category: "Items",
      topic: { category: "items", tier: "hard", iconHint: null },
    },
    ...overrides,
  } as PublicRoundView;
}

describe("projecting a round", () => {
  it("captures the prompt, the options and the match coordinates", () => {
    const snapshot = arenaReportSnapshot({
      identity: IDENTITY, publicRound: round(), selection: null, reveal: null,
    })!;
    expect(snapshot.mode).toBe("Ranked");
    expect(snapshot.category).toBe("Ranked");
    expect(snapshot.prompt).toBe("Which item gives the most armor?");
    expect(snapshot.choices).toEqual(["Thornmail", "Warmog's", "Bloodthirster"]);
    expect(snapshot.runtimeQuestionId).toBe("q-77");
    expect(snapshot.matchId).toBe("match-1");
    expect(snapshot.roundNumber).toBe(3);
    expect(snapshot.moduleType).toBe("quiz.v1");
    expect(snapshot.difficulty).toBe("hard");
  });

  it("publishes no question_key, because Ranked's transport carries none", () => {
    // Keys like `item_exact_stat:armor:highest` name the answer, which is why
    // the round reader's assertNoCorrectness guard keeps them off the wire.
    const snapshot = arenaReportSnapshot({
      identity: IDENTITY, publicRound: round(), selection: null, reveal: null,
    })!;
    expect(snapshot.questionKey).toBeUndefined();
    expect(snapshot.staticQuestionId).toBeUndefined();
  });

  it("resolves the player's selection to its label", () => {
    const snapshot = arenaReportSnapshot({
      identity: IDENTITY, publicRound: round(), selection: "1", reveal: null,
    })!;
    expect(snapshot.selectedAnswer).toBe("Warmog's");
  });

  it("returns null when there is no question to report", () => {
    expect(arenaReportSnapshot({
      identity: IDENTITY,
      publicRound: round({ question: null }),
      selection: null,
      reveal: null,
    })).toBeNull();
  });
});

describe("the answer rule", () => {
  it("captures NO canonical answer before the round has revealed", () => {
    const snapshot = arenaReportSnapshot({
      identity: IDENTITY,
      publicRound: round(),
      selection: "1",
      // What the controller supplies mid-question: no reveal at all.
      reveal: null,
    })!;
    expect(snapshot.canonicalAnswer).toBeUndefined();
  });

  it("still captures none when a reveal exists but has not revealed", () => {
    const snapshot = arenaReportSnapshot({
      identity: IDENTITY,
      publicRound: round(),
      selection: "1",
      reveal: { revealed: false, correctOptionId: "0" },
    })!;
    expect(snapshot.canonicalAnswer).toBeUndefined();
  });

  it("captures the answer the player is already looking at, post-settlement", () => {
    const snapshot = arenaReportSnapshot({
      identity: IDENTITY,
      publicRound: round(),
      selection: "1",
      reveal: { revealed: true, correctOptionId: "0", isCorrect: false },
    })!;
    expect(snapshot.canonicalAnswer).toBe("Thornmail");
  });
});

describe("option lookup is honest about failure", () => {
  it("returns no label rather than a wrong one for an unresolvable id", () => {
    for (const selection of ["9", "-1", "abc", {}, null, undefined]) {
      const snapshot = arenaReportSnapshot({
        identity: IDENTITY, publicRound: round(), selection, reveal: null,
      })!;
      expect(snapshot.selectedAnswer).toBeUndefined();
    }
  });
});
