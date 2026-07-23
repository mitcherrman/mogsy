import { describe, expect, it } from "vitest";
import { STAT_CHECK_FIXTURE_DECK } from "../fixtureDeck";
import { formatDiagnosticsReport, mean, median, runDiagnostics, simulateMatch } from "./simulation";

const DIAG_SEEDS = Array.from({ length: 200 }, (_, i) => `stat-check-diag:${i}`);

describe("stat check simulation diagnostics", () => {
  it("simulates a match deterministically", () => {
    const a = simulateMatch(STAT_CHECK_FIXTURE_DECK, "stat-check-diag:0");
    const b = simulateMatch(STAT_CHECK_FIXTURE_DECK, "stat-check-diag:0");
    expect(a).toEqual(b);
    expect(a.match.rounds).toBeGreaterThan(0);
    expect(a.match.invariantIssues).toEqual([]);
  });

  it("median/mean helpers behave", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("runs the diagnostic sweep with no invariant violations and prints the report", () => {
    const report = runDiagnostics(STAT_CHECK_FIXTURE_DECK, DIAG_SEEDS);
    expect(report.matches).toBe(DIAG_SEEDS.length);
    expect(report.totalRounds).toBe(report.roundsPerMatch.reduce((a, b) => a + b, 0));
    const issues = report.matchRecords.flatMap((m) => m.invariantIssues);
    expect(issues).toEqual([]);
    // Retired categories never appear and boards never repeat a family.
    expect(report.categoryStats["lowest-mr-1"]).toBeUndefined();
    expect(report.categoryStats["lowest-attack-speed-1"]).toBeUndefined();
    expect(report.familyFrequency["magic-resist"]).toBe(0);
    expect(report.familyFrequency["attack-speed"]).toBe(0);
    expect(report.repeatedFamilyBoards).toBe(0);
    expect(Object.keys(report.categoryStats).length).toBeGreaterThan(0);
    // Every match must terminate (exhaustion or HP), never hang.
    for (const match of report.matchRecords) {
      expect(match.exhausted || match.outcome !== null).toBe(true);
    }
    console.log(`\n${formatDiagnosticsReport(report)}\n`);
  });
});
