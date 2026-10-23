/**
 * Daily three acts (V2) — the Daily run contract carries the server's set plan
 * on a three-act Standard only, and refuses a malformed one.
 */
import { describe, expect, it } from "vitest";
import { DailyRunParseError, readDailyRun } from "@/lib/daily-challenge/run/contracts";
import { V5_ELIGIBLE_DAY, wireV5Run } from "@/lib/daily-challenge/run/fixtures";
import { THREE_ACTS_COMPOSITION } from "./__fixtures__/threeActsComposition";

const V1_STANDARD = { recipe_id: "daily-standard-v1", modules: 10,
  units: ["splash", "splash", "splash", "splash", "meta_reflex", "splash", "splash", "splash", "meta_reflex", "journey"],
  meta_reflex_cards: 5 };

const withComposition = (composition: unknown) => wireV5Run(V5_ELIGIBLE_DAY, {}, {
  0: { content: { title: "Today's Daily", focus: null, composition } } });

describe("Daily run contract — three-act plan", () => {
  it("reads the plan on a three-act Standard", () => {
    const run = readDailyRun(withComposition(THREE_ACTS_COMPOSITION));
    const plan = run.stages[0].content?.plan;
    expect(plan?.segments).toBe(19);
    expect(plan?.answers).toBe(21);
    expect(plan?.units).toHaveLength(7);
  });

  it("adds nothing to a V1 Standard or a stage without a composition", () => {
    const v1 = readDailyRun(withComposition(V1_STANDARD));
    expect(v1.stages[0].content).toEqual({ title: "Today's Daily", focus: null });
    const bare = readDailyRun(wireV5Run(V5_ELIGIBLE_DAY));
    expect(bare.stages.every((s) => !s.content || !("plan" in s.content))).toBe(true);
  });

  it("refuses a three-act plan that breaks its counts", () => {
    expect(() => readDailyRun(withComposition({ ...THREE_ACTS_COMPOSITION, answers: 22 })))
      .toThrow(DailyRunParseError);
  });
});
