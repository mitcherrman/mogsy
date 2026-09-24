import { describe, expect, it } from "vitest";
import type { PublicRoundView, SegmentStateView } from "@/lib/ranked-public/contracts";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { plannedRoundTotal } from "./stagePlan";
import { survivalHumanFinished, survivalStatus } from "./survivalFinish";

const pub = (ruleset: PublicRoundView["ruleset"]) => ({ ruleset } as PublicRoundView);
const seg = (s: Partial<SegmentStateView>) => ({
  ownFinished: false, ownChallengesCompleted: 0, challengeCount: 3, ...s,
} as SegmentStateView);
const surv = (o: Partial<NonNullable<PublicRoundView["ruleset"]>> = {}) =>
  pub({ rulesetId: "survival", strikes: 0, maxStrikes: 3, questionsSettled: 0, stageEnded: false, ...o });

describe("DC-SURV-UX — the Survival finish signal is server truth", () => {
  it("not finished while the human is still playing", () => {
    expect(survivalHumanFinished(surv(), seg({ ownChallengesCompleted: 1 }))).toBe(false);
  });
  it("mid-Slice strike 3: own_finished with cards unplayed is the PRE-4 stop", () => {
    expect(survivalHumanFinished(surv({ strikes: 1 }),
      seg({ ownFinished: true, ownChallengesCompleted: 2, challengeCount: 3 }))).toBe(true);
  });
  it("a finished block is not the end unless the ledger says the stage ended", () => {
    const done = seg({ ownFinished: true, ownChallengesCompleted: 1, challengeCount: 1 });
    expect(survivalHumanFinished(surv({ strikes: 1 }), done)).toBe(false);
    expect(survivalHumanFinished(surv({ strikes: 3, stageEnded: true }), done)).toBe(true);
  });
  it("bot progress is not an input: opponent fields change nothing", () => {
    const s = seg({ ownChallengesCompleted: 1, opponentFinished: true, opponentChallengesCompleted: 3 });
    expect(survivalHumanFinished(surv(), s)).toBe(false);
    expect(survivalStatus(surv({ strikes: 1 }))).toEqual({ answered: 0, strikesUsed: 1, maxStrikes: 3 });
  });
  it("Standard and Time Trial are never Survival-finished", () => {
    const early = seg({ ownFinished: true, ownChallengesCompleted: 1 });
    expect(survivalHumanFinished(pub(null), early)).toBe(false);
    expect(survivalHumanFinished(pub({ rulesetId: "time_trial", stageEnded: true }), early)).toBe(false);
    expect(survivalStatus(pub({ rulesetId: "time_trial" }))).toBeNull();
  });
  it("reads the published ledger, and a Survival stage draws no denominator", () => {
    const env = publicRoundV2(false) as { payload: Record<string, unknown> };
    env.payload.ruleset = { ruleset_id: "survival", max_strikes: 3, strikes: 2, questions_settled: 12, stage_ended: false };
    env.payload.scoring = { model: "points", match_length: 175, module_number: 13, modules_completed: 12 };
    const view = readPublicRound(env);
    expect(survivalStatus(view)).toEqual({ answered: 12, strikesUsed: 2, maxStrikes: 3 });
    expect(plannedRoundTotal(view)).toBeNull();
  });
});

describe("DC-LANE-C — own_stage_finished / live_strikes are the published answer", () => {
  it("own_stage_finished true ends the stage at once, even mid-block with own_finished false", () => {
    expect(survivalHumanFinished(surv({ strikes: 2, liveStrikes: 3, ownStageFinished: true }),
      seg({ ownFinished: false, ownChallengesCompleted: 1 }))).toBe(true);
  });
  it("own_stage_finished false wins over the legacy early-stop inference", () => {
    expect(survivalHumanFinished(surv({ strikes: 1, liveStrikes: 1, ownStageFinished: false }),
      seg({ ownFinished: true, ownChallengesCompleted: 1, challengeCount: 1 }))).toBe(false);
  });
  it("displays the live strike count, not the settled one", () => {
    expect(survivalStatus(surv({ strikes: 1, liveStrikes: 3 })))
      .toEqual({ answered: 0, strikesUsed: 3, maxStrikes: 3 });
  });
  it("reads both fields off the wire", () => {
    const env = publicRoundV2(false) as { payload: Record<string, unknown> };
    env.payload.ruleset = { ruleset_id: "survival", max_strikes: 3, strikes: 2, questions_settled: 12,
      stage_ended: false, live_strikes: 3, own_stage_finished: true };
    const view = readPublicRound(env);
    expect(view.ruleset?.liveStrikes).toBe(3);
    expect(view.ruleset?.ownStageFinished).toBe(true);
    expect(survivalHumanFinished(view, null)).toBe(true);
    expect(survivalStatus(view)?.strikesUsed).toBe(3);
  });
  it("an older payload without the fields reads them as null", () => {
    const env = publicRoundV2(false) as { payload: Record<string, unknown> };
    env.payload.ruleset = { ruleset_id: "survival", max_strikes: 3, strikes: 0 };
    const view = readPublicRound(env);
    expect(view.ruleset?.liveStrikes).toBeNull();
    expect(view.ruleset?.ownStageFinished).toBeNull();
  });
});
