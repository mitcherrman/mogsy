/**
 * HUB6.3E — the Analytics Lab's population, as HUB6.3C's real route
 * (`00c794cd`) returned it and the production parser read it. Every figure
 * here is the backend's (midrank percentile, median, merged histogram,
 * strongest mode); these tests hold the lab to the states it exists for and
 * the contract's own invariants.
 */
import { describe, expect, it } from "vitest";
import { readHistoryPage, type DailyHistoryRecord, type HistoryStage } from "@/lib/history/contracts";
import { cohortOf, strongestFor, type PopulationCohort } from "@/lib/history/population";
import { percentileNumber } from "@/components/quiz/workspace/analytics/copy";
import { ANALYTICS_LAB_GOLDEN, type AnalyticsLabScenario } from "./analyticsLabSource";
import { ANALYTICS_LAB_POPULATION_RECIPES, POPULATION_MIN_USERS } from "./analyticsLabPopulation";
import { analyticsLabInput } from "./analyticsLabInput";

function records(scenario: AnalyticsLabScenario = "lab_premium"): DailyHistoryRecord[] {
  return ANALYTICS_LAB_GOLDEN.scenarios[scenario].flatMap((page) => readHistoryPage(page).items);
}
const run = (n: number) => records().find((r) => r.runId === `lab-run-${String(n).padStart(2, "0")}`)!;
const stage = (n: number, kind: string): HistoryStage => run(n).stages.find((s) => s.kind === kind)!;
const rolling = (c: { cohorts: PopulationCohort[] } | null | undefined) => cohortOf(c ?? null, "rolling_28d")!;

describe("population — the real HUB6.3C wire", () => {
  it("every Premium Daily carries the run block, its policies, Core and three mode blocks", () => {
    for (const r of records()) {
      expect(r.population).not.toBeNull();
      expect(r.population!.policyVersion).toBe("history-population-v1");
      expect(r.population!.metricPolicyVersion).toBe("history-personal-v1");
      expect(r.population!.core?.subject).toBe("core");
      expect(r.population!.strongestMode.map((s) => s.cohortType)).toEqual(["rolling_28d", "same_day"]);
      for (const kind of ["standard", "time_trial", "survival"]) {
        const s = r.stages.find((x) => x.kind === kind);
        if (s) expect(s.population?.subject).toBe(kind);
      }
      for (const s of r.stages.filter((x) => x.kind === "weak_areas" || x.kind === "review")) {
        expect(s.population).toBeNull();
      }
    }
  });

  it("primary metrics: Standard score, Time Trial correct, Survival depth", () => {
    expect(stage(14, "standard").population!.primaryMetric).toBe("score");
    expect(stage(14, "time_trial").population!.primaryMetric).toBe("correct");
    expect(stage(14, "survival").population!.primaryMetric).toBe("depth");
  });

  it("Free and entitlement-unavailable readers get no population at all", () => {
    for (const scenario of ["lab_free", "lab_unavailable"] as const) {
      for (const r of records(scenario)) {
        expect(r.population).toBeNull();
        expect(r.stages.every((s) => s.population === null)).toBe(true);
      }
    }
  });

  it("an available cohort's histogram sums to its players, every bin holds ≥ 5, and the player's bin is named", () => {
    for (const r of records()) {
      const blocks = [r.population?.core, ...r.stages.map((s) => s.population)].filter(Boolean);
      for (const b of blocks) {
        for (const c of b!.cohorts.filter((x) => x.status === "available")) {
          expect(c.users).toBeGreaterThanOrEqual(POPULATION_MIN_USERS);
          for (const m of Object.values(c.metrics)) {
            const h = m.histogram!;
            expect(h.bins.reduce((a, x) => a + x.count, 0)).toBe(c.users);
            expect(h.bins.every((x) => x.count >= 5)).toBe(true);
            expect(h.subjectBin).not.toBeNull();
            expect(m.percentile).toBeGreaterThan(0);
            expect(m.percentile).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("accuracy is a fraction histogram of tenths; counts are integer bins", () => {
    const c = rolling(run(14).population!.core);
    expect(c.metrics.accuracy.histogram!.scale).toBe("fraction");
    expect(c.metrics.correct.histogram!.scale).toBe("integer");
  });
});

describe("population — the lab's states", () => {
  it("L1: insufficient (40 players): the count survives, no percentile, median or histogram anywhere", () => {
    const r = run(1);
    expect(r.population!.status).toBe("insufficient");
    const c = rolling(r.population!.core);
    expect(c.status).toBe("insufficient");
    expect(c.reasonCode).toBe("insufficient_population");
    expect(c.sufficiency).toMatchObject({ observed: 40, required: 100 });
    for (const m of Object.values(c.metrics)) {
      expect(m.value).not.toBeNull();
      expect([m.percentile, m.median, m.quantiles, m.histogram]).toEqual([null, null, null, null]);
    }
    expect(strongestFor(r.population, "rolling_28d")).toMatchObject({ stageKind: null, reasonCode: "mode_population_insufficient" });
  });

  it("L2: exactly 100 players is sufficient", () => {
    const c = rolling(run(2).population!.core);
    expect(c.users).toBe(100);
    expect(c.status).toBe("available");
  });

  it("L3: the rolling cohort is available while the same-day cohort (88) is not", () => {
    const b = run(3).population!.core;
    expect(rolling(b).status).toBe("available");
    expect(cohortOf(b, "same_day")).toMatchObject({ status: "insufficient", users: 88 });
  });

  it("L7: no aggregate for the date → unavailable / aggregate_not_built, never a zero", () => {
    const r = run(7);
    expect(r.population!.status).toBe("unavailable");
    expect(r.population!.reasonCode).toBe("aggregate_not_built");
    const c = rolling(r.population!.core);
    expect(c.reasonCode).toBe("aggregate_not_built");
    expect(Object.values(c.metrics).every((m) => m.percentile === null)).toBe(true);
  });

  it("≈20th / 50th / 85th / 98th percentile (Core correct, L5 / L6 / L8 / L12)", () => {
    const p = (n: number) => rolling(run(n).population!.core).metrics.correct.percentile!;
    expect(p(5)).toBeCloseTo(0.2, 1);
    expect(p(6)).toBeCloseTo(0.5, 1);
    expect(p(8)).toBeCloseTo(0.85, 1);
    expect(p(12)).toBeGreaterThan(0.95);
  });

  it("L10: heavy ties at the Survival ceiling — midrank, with the tied bin holding over a fifth of players", () => {
    const c = rolling(stage(10, "survival").population);
    const depth = c.metrics.depth;
    const bin = depth.histogram!.bins[depth.histogram!.subjectBin!];
    expect(bin.count / c.users!).toBeGreaterThan(0.2);
    expect(depth.percentile).toBeGreaterThan(0.85);
    expect(depth.percentile).toBeLessThan(0.95); // a tie is never the top
  });

  it("L14: an extreme outlier lands in the open overflow bin; the page never says '100th'", () => {
    const m = rolling(stage(14, "time_trial").population).metrics.correct;
    const bin = m.histogram!.bins[m.histogram!.subjectBin!];
    expect(bin.upperOpen).toBe(true);
    expect(bin.upper).toBeNull();
    expect(m.percentile).toBeGreaterThan(0.99);
    expect(percentileNumber(m.percentile!)).toBe(99);
  });

  it("strongest mode is the server's: Time Trial (L8), Survival (L11), Standard (L12)", () => {
    expect(strongestFor(run(8).population, "rolling_28d")!.stageKind).toBe("time_trial");
    expect(strongestFor(run(11).population, "rolling_28d")!.stageKind).toBe("survival");
    expect(strongestFor(run(12).population, "rolling_28d")!.stageKind).toBe("standard");
    const s = strongestFor(run(12).population, "rolling_28d")!;
    expect(s.margin).toBeGreaterThanOrEqual(0.1);
    expect(s.candidates.map((c) => c.stageKind)).toEqual(["standard", "time_trial", "survival"]);
  });

  it("no strongest mode: a lead under 10 points (L13) or one mode insufficient (L9)", () => {
    const l13 = strongestFor(run(13).population, "rolling_28d")!;
    expect(l13).toMatchObject({ stageKind: null, percentile: null, reasonCode: "margin_below_threshold" });
    expect(l13.margin).toBeLessThan(0.1);
    const l9 = strongestFor(run(9).population, "rolling_28d")!;
    expect(l9).toMatchObject({ stageKind: null, reasonCode: "mode_population_insufficient" });
    expect(l9.candidates.find((c) => c.stageKind === "survival")!.percentile).toBeNull();
    expect(rolling(stage(9, "survival").population).sufficiency).toMatchObject({ observed: 60 });
  });

  it("the player's value is their own fact: the population's value equals the record", () => {
    const r = run(14);
    expect(rolling(r.population!.core).metrics.correct.value).toBe(r.analytics!.personal!.core!.current!.correct);
    expect(rolling(stage(14, "survival").population).metrics.depth.value).toBe(stage(14, "survival").basic.depth);
    expect(rolling(stage(14, "standard").population).metrics.score.value).toBe(stage(14, "standard").basic.score);
  });
});

describe("population — recipes, not users", () => {
  it("every recipe is part of the hashed lab input", () => {
    const input = JSON.parse(analyticsLabInput());
    expect(input.population).toHaveLength(ANALYTICS_LAB_POPULATION_RECIPES.length);
    expect(ANALYTICS_LAB_POPULATION_RECIPES.filter((r) => !r.built).map((r) => r.runId)).toEqual(["lab-run-07"]);
  });

  it("the golden holds aggregates only: no other player's id or value ever appears", () => {
    const text = JSON.stringify(ANALYTICS_LAB_GOLDEN.scenarios.lab_premium);
    expect(text).not.toMatch(/"user_id"|"frequency"|"rank"|leaderboard/);
  });
});
