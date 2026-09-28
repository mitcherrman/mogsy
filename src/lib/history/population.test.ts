/**
 * HUB6.3E — the HUB6.3C population contract, parsed (synthetic wire in the
 * exact shape of `history/population.py` at `00c794cd`).
 */
import { describe, expect, it } from "vitest";
import { readHistoryPage } from "@/lib/history/contracts";
import { cohortOf, readRunPopulation, readSubjectBlock, strongestFor } from "@/lib/history/population";

const bins = [
  { lower: null, upper: 10, lower_open: true, upper_open: false, upper_inclusive: false, count: 40 },
  { lower: 10, upper: 20, lower_open: false, upper_open: false, upper_inclusive: false, count: 60 },
  { lower: 20, upper: null, lower_open: false, upper_open: true, upper_inclusive: false, count: 20 },
];
const metric = (value: number, extra: Record<string, unknown> = {}) => ({
  value, percentile: 0.8725, median: 14.5,
  quantiles: { p10: 5, p25: 8.75, p50: 14.5, p75: 20.25, p90: 24.1 },
  histogram: { scale: "integer", bins, subject_bin: 2 }, ...extra,
});
const cohort = (type: string, status: string, users: number | null, metrics: Record<string, unknown>, reason: string | null = null) => ({
  cohort: { type, as_of: "2026-09-14", window_days: type === "rolling_28d" ? 28 : 1, users, observations: users, generated_at: "2026-09-14T23:30:00+00:00" },
  status, reason_code: reason,
  sufficiency: { status: status === "available" ? "sufficient" : "insufficient", observed: users ?? 0, required: 100, reason_code: reason },
  metrics,
});
const block = (subject: string, primary: string | null, cohorts: unknown[]) => ({ subject, primary_metric: primary, cohorts });

describe("HUB6.3C population — parser", () => {
  it("reads an available subject block: cohort, users, percentile, median, quantiles, histogram, subject bin", () => {
    const b = readSubjectBlock(block("time_trial", "correct", [
      cohort("rolling_28d", "available", 120, { correct: metric(24) }),
      cohort("same_day", "insufficient", 40, { correct: metric(24) }, "insufficient_population"),
    ]))!;
    expect(b.primaryMetric).toBe("correct");
    const c = cohortOf(b, "rolling_28d")!;
    expect(c).toMatchObject({ type: "rolling_28d", windowDays: 28, users: 120, status: "available" });
    expect(c.metrics.correct).toMatchObject({ value: 24, percentile: 0.8725, median: 14.5 });
    expect(c.metrics.correct.quantiles!.p90).toBe(24.1);
    expect(c.metrics.correct.histogram!.bins[0]).toMatchObject({ lower: null, lowerOpen: true, count: 40 });
    expect(c.metrics.correct.histogram!.bins[2].upperOpen).toBe(true);
    expect(c.metrics.correct.histogram!.subjectBin).toBe(2);
  });

  it("a cohort that is not available NEVER carries a percentile, median or histogram — even if one is sent", () => {
    const b = readSubjectBlock(block("core", null, [
      cohort("rolling_28d", "insufficient", 40, { correct: metric(47) }, "insufficient_population"),
      cohort("same_day", "unavailable", null, { correct: metric(47) }, "aggregate_not_built"),
    ]))!;
    for (const c of b.cohorts) {
      expect(c.metrics.correct.value).toBe(47);
      expect([c.metrics.correct.percentile, c.metrics.correct.median, c.metrics.correct.quantiles, c.metrics.correct.histogram])
        .toEqual([null, null, null, null]);
    }
    expect(cohortOf(b, "rolling_28d")!.sufficiency).toMatchObject({ observed: 40, required: 100 });
    expect(cohortOf(b, "same_day")!.reasonCode).toBe("aggregate_not_built");
  });

  it("a percentile of 0 is only ever a real 0–1 value; an out-of-range one is dropped", () => {
    const b = readSubjectBlock(block("standard", "score", [cohort("rolling_28d", "available", 150, { score: metric(90, { percentile: 1.7 }) })]))!;
    expect(cohortOf(b, "rolling_28d")!.metrics.score.percentile).toBeNull();
  });

  it("the run block: status, policy versions, core and the server's strongest mode — never recomputed", () => {
    const p = readRunPopulation({
      status: "available", reason_code: null, policy_version: "history-population-v1", metric_policy_version: "history-personal-v1",
      core: block("core", null, [cohort("rolling_28d", "available", 150, { correct: metric(60) })]),
      strongest_mode: [
        { cohort_type: "rolling_28d", stage_kind: "time_trial", percentile: 0.87, margin: 0.16, reason_code: null,
          candidates: [{ stage_kind: "standard", metric: "score", percentile: 0.6 }, { stage_kind: "time_trial", metric: "correct", percentile: 0.87 }, { stage_kind: "survival", metric: "depth", percentile: 0.71 }] },
        { cohort_type: "same_day", stage_kind: null, percentile: null, margin: 0.05, reason_code: "margin_below_threshold", candidates: [] },
      ],
    })!;
    expect(p.policyVersion).toBe("history-population-v1");
    expect(strongestFor(p, "rolling_28d")).toMatchObject({ stageKind: "time_trial", percentile: 0.87, margin: 0.16 });
    expect(strongestFor(p, "rolling_28d")!.candidates).toHaveLength(3);
    expect(strongestFor(p, "same_day")).toMatchObject({ stageKind: null, percentile: null, reasonCode: "margin_below_threshold" });
  });

  it("a winner's percentile only travels with a winner", () => {
    const p = readRunPopulation({ status: "available", core: null, strongest_mode: [
      { cohort_type: "rolling_28d", stage_kind: null, percentile: 0.9, margin: null, reason_code: "mode_population_insufficient", candidates: [] },
    ] })!;
    expect(strongestFor(p, "rolling_28d")!.percentile).toBeNull();
  });

  it("population_not_configured and aggregate_not_built are states, not failures", () => {
    expect(readRunPopulation({ status: "unavailable", reason_code: "population_not_configured", core: null, strongest_mode: null }))
      .toMatchObject({ status: "unavailable", reasonCode: "population_not_configured", core: null, strongestMode: [] });
  });

  it("absent or malformed population is null, never fatal", () => {
    expect(readRunPopulation(null)).toBeNull();
    expect(readRunPopulation({ status: "weird" })).toBeNull();
    expect(readSubjectBlock({ subject: 5 })).toBeNull();
    expect(readSubjectBlock(block("core", null, [{ cohort: {}, status: "available" }]))!.cohorts).toEqual([]);
  });
});

describe("HUB6.3C through the page parser", () => {
  const stageWire = (kind: string, extra: Record<string, unknown> = {}) => ({
    stage_id: `s-${kind}`, order: 0, kind, ruleset: { id: kind, version: 1, config: { max_strikes: kind === "survival" ? 3 : null } },
    review_identity: null,
    basic: { score: 10, correct: 2, answered: 3, accuracy: 0.667, ended_by: "strikes_exhausted" },
    questions: [
      { question_result_id: "q1", canonical_ref: "r1", outcome: "correct", review_position: 1, round_number: 1, challenge_index: 0 },
      { question_result_id: "q2", canonical_ref: "r2", outcome: "incorrect", review_position: 2, round_number: 2, challenge_index: 0 },
      { question_result_id: "q3", canonical_ref: "r3", outcome: "correct", review_position: 3, round_number: 3, challenge_index: 0 },
    ],
    analytics_capability: { state: "upgrade_required", reason_code: null }, analytics: null, ...extra,
  });
  const page = (item: Record<string, unknown>) => ({
    schema_version: 1, as_of: "2026-09-15T00:00:00Z", next_cursor: null,
    items: [{
      record_type: "daily", run_id: "r", plan_date: "2026-09-14", completed_at: "2026-09-14T10:00:00Z", status: "completed",
      stage_count: 1, basic: { score: 10, correct: 2, answered: 3, accuracy: 0.667 },
      analytics_capability: { state: "upgrade_required", reason_code: null }, analytics: null, ...item,
    }],
  });

  it("an older (HUB2.3 / HUB6.3B) payload parses with population and the Free HUB6.3C fields null", () => {
    const r = readHistoryPage(page({ stages: [stageWire("survival")] })).items[0];
    expect(r.population).toBeNull();
    expect(r.stages[0].population).toBeNull();
    expect(r.stages[0].basic).toMatchObject({ longestStreak: null, depth: null, strikesUsed: null, maxStrikes: null });
    expect(r.stages[0].questions.every((q) => q.isStrike === null && q.strikeIndex === null)).toBe(true);
  });

  it("HUB6.3C Free facts: the stage's streak (with span), Survival depth and strikes, and per-question strike markers", () => {
    const survival = stageWire("survival", {
      basic: {
        score: 10, correct: 2, answered: 3, accuracy: 0.667, ended_by: "strikes_exhausted", questions_played: 3,
        longest_streak: 1, longest_streak_span: { length: 1, start_question_result_id: "q1", end_question_result_id: "q1" },
        depth: 3, strikes_used: 1, max_strikes: 3,
      },
    });
    (survival.questions as Array<Record<string, unknown>>)[1].is_strike = true;
    (survival.questions as Array<Record<string, unknown>>)[1].strike_index = 1;
    (survival.questions as Array<Record<string, unknown>>)[0].is_strike = false;
    (survival.questions as Array<Record<string, unknown>>)[0].strike_index = null;
    const s = readHistoryPage(page({ stages: [survival] })).items[0].stages[0];
    expect(s.basic).toMatchObject({ longestStreak: 1, depth: 3, strikesUsed: 1, maxStrikes: 3 });
    expect(s.basic.longestStreakSpan).toEqual({ length: 1, startQuestionResultId: "q1", endQuestionResultId: "q1" });
    expect(s.questions.map((q) => [q.isStrike, q.strikeIndex])).toEqual([[false, null], [true, 1], [null, null]]);
  });

  it("a malformed population block never takes the record down", () => {
    const r = readHistoryPage(page({ stages: [stageWire("standard", { population: { subject: 7 } })], population: { status: 3 } })).items[0];
    expect(r.population).toBeNull();
    expect(r.stages[0].population).toBeNull();
    expect(r.stages).toHaveLength(1);
  });
});
