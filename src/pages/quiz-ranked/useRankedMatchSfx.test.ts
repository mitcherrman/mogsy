import { describe, expect, it } from "vitest";

import {
  observeRankedSfx, type RankedSfxObservation, type RankedSfxWatch,
} from "./useRankedMatchSfx";

const base = (over: Partial<RankedSfxObservation> = {}): RankedSfxObservation => ({
  matchId: "m1",
  moduleKey: "quiz.1#1",
  roundKey: "quiz.1#1",
  ownSubmitted: false,
  opponentSubmitted: false,
  metaKey: null,
  metaOpponentCompleted: 0,
  metaOwnFinished: false,
  metaOwnReveals: [],
  settlementRound: null,
  settlementLive: false,
  ownSettlementOutcome: null,
  ownAward: null,
  terminal: false,
  terminalResult: null,
  ...over,
});

function step(previous: RankedSfxWatch | null, observation: RankedSfxObservation) {
  return observeRankedSfx(previous, observation);
}

describe("Ranked semantic SFX observation", () => {
  it("seeds active hydration silently and sounds each later playable module once", () => {
    const hydrated = step(null, base());
    expect(hydrated.emissions).toEqual([]);
    expect(step(hydrated.watch, base()).emissions).toEqual([]);

    const next = step(hydrated.watch, base({
      moduleKey: "mastery_slice.1#2", roundKey: "mastery_slice.1#2",
    }));
    expect(next.emissions).toEqual([{
      event: "ranked.module.start",
      eventId: "ranked:m1:module:mastery_slice.1#2:start",
    }]);
    expect(step(next.watch, base({
      moduleKey: "mastery_slice.1#2", roundKey: "mastery_slice.1#2",
    })).emissions).toEqual([]);

    // A remount/reconnect creates a fresh watch and therefore only seeds.
    expect(step(null, base({
      moduleKey: "mastery_slice.1#2", roundKey: "mastery_slice.1#2",
    })).emissions).toEqual([]);
  });

  it("sounds only the newly public neutral opponent action while own play remains open", () => {
    const initial = step(null, base());
    const acted = step(initial.watch, base({ opponentSubmitted: true }));
    expect(acted.emissions.map((event) => event.event)).toEqual([
      "ranked.opponent.submitted",
    ]);
    expect(step(acted.watch, base({ opponentSubmitted: true })).emissions).toEqual([]);
    expect(step(initial.watch, base({
      opponentSubmitted: true, ownSubmitted: true,
    })).emissions).toEqual([]);
    expect(step(null, base({ opponentSubmitted: true })).emissions).toEqual([]);
  });

  it("sounds authoritative own verdict and award, with an intentional speed accent", () => {
    const initial = step(null, base());
    const settled = step(initial.watch, base({
      settlementRound: 1,
      settlementLive: true,
      ownSettlementOutcome: "correct",
      ownAward: { pointsAwarded: 3, speedBonusPoints: 1 },
    }));
    expect(settled.emissions.map((event) => event.event)).toEqual([
      "ranked.answer.correct", "ranked.points.awarded", "ranked.speed.bonus",
    ]);
    expect(step(settled.watch, base({
      settlementRound: 1,
      settlementLive: true,
      ownSettlementOutcome: "correct",
      ownAward: { pointsAwarded: 3, speedBonusPoints: 1 },
    })).emissions).toEqual([]);

    const wrong = step(initial.watch, base({
      settlementRound: 1, ownSettlementOutcome: "incorrect",
      settlementLive: true,
    }));
    expect(wrong.emissions.map((event) => event.event)).toEqual([
      "ranked.answer.incorrect",
    ]);
    expect(step(null, base({
      settlementRound: 1, ownSettlementOutcome: "correct",
      ownAward: { pointsAwarded: 2, speedBonusPoints: 0 },
    })).emissions).toEqual([]);
  });

  it("uses owner-only Meta reveals and coalesces public opponent progress", () => {
    const meta = base({
      moduleKey: "item_cost_duel.4#4",
      roundKey: "item_cost_duel.4#4",
      metaKey: "item_cost_duel.4#4",
    });
    const initial = step(null, meta);
    const progress = step(initial.watch, {
      ...meta, metaOpponentCompleted: 3,
    });
    expect(progress.emissions.map((event) => event.event)).toEqual([
      "ranked.opponent.submitted",
    ]);
    const reveal = step(progress.watch, {
      ...meta,
      metaOpponentCompleted: 3,
      metaOwnReveals: [{ challengeIndex: 0, outcome: "correct" }],
    });
    expect(reveal.emissions.map((event) => event.event)).toEqual([
      "ranked.answer.correct",
    ]);
    expect(step(null, {
      ...meta,
      metaOpponentCompleted: 3,
      metaOwnReveals: [{ challengeIndex: 0, outcome: "incorrect" }],
    }).emissions).toEqual([]);
  });

  it("sounds terminal authority only after live play, including delayed result arrival", () => {
    const live = step(null, base());
    const terminalWithoutResult = step(live.watch, base({
      moduleKey: null, roundKey: null, terminal: true,
    }));
    expect(terminalWithoutResult.emissions).toEqual([]);
    const victory = step(terminalWithoutResult.watch, base({
      moduleKey: null, roundKey: null, terminal: true, terminalResult: "victory",
    }));
    expect(victory.emissions.map((event) => event.event)).toEqual([
      "ranked.match.victory",
    ]);
    expect(step(victory.watch, base({
      moduleKey: null, roundKey: null, terminal: true, terminalResult: "victory",
    })).emissions).toEqual([]);

    expect(step(null, base({
      moduleKey: null, roundKey: null, terminal: true, terminalResult: "defeat",
    })).emissions).toEqual([]);

    for (const result of ["defeat", "draw"] as const) {
      const transition = step(live.watch, base({
        moduleKey: null, roundKey: null, terminal: true, terminalResult: result,
      }));
      expect(transition.emissions.map((event) => event.event)).toEqual([
        `ranked.match.${result}`,
      ]);
    }
  });
});
