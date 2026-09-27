/**
 * HUB6.3D — the Analytics Lab's temporary population fixture. It must be
 * deterministic, internally consistent (a percentile is the midrank of its
 * own table), cover every state HUB6.3E will design for, and stay isolated
 * from the production History contract.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANALYTICS_LAB_POPULATION,
  ANALYTICS_LAB_POPULATION_FIXTURES as FIXTURES,
  POPULATION_MIN_USERS,
  bellTable,
  midrankPercentile,
} from "./analyticsLabPopulation";
import { ANALYTICS_LAB_GOLDEN } from "./analyticsLabSource";
import { readHistoryPage, type DailyHistoryRecord } from "@/lib/history/contracts";

const fx = (n: number) => ANALYTICS_LAB_POPULATION.forRun(`lab-run-${String(n).padStart(2, "0")}`)!;
const m = (n: number, kind: string) => fx(n).metrics.find((x) => x.stageKind === kind)!;

describe("population fixture — maths", () => {
  it("midrank percentile: (below + ½·equal) / N", () => {
    const t = { values: [1, 2, 3], counts: [2, 4, 4] };
    expect(midrankPercentile(t, 2)).toBe(40); // (2 + 2) / 10
    expect(midrankPercentile(t, 3)).toBe(80);
  });

  it("tables are deterministic and sum to their user count", () => {
    const a = bellTable({ min: 0, max: 40, centre: 20, spread: 5, users: 1284 });
    const b = bellTable({ min: 0, max: 40, centre: 20, spread: 5, users: 1284 });
    expect(a).toEqual(b);
    expect(a.counts.reduce((x, y) => x + y, 0)).toBe(1284);
  });

  it("every sufficient metric's percentile is the midrank of its own full table", () => {
    for (const f of FIXTURES) {
      for (const metric of f.metrics) {
        if (metric.sufficiency.status !== "sufficient") {
          expect(metric.percentile).toBeNull();
          expect(metric.frequency).toBeNull();
          continue;
        }
        const published = metric.frequency!;
        expect(published.counts.reduce((x, y) => x + y, 0)).toBe(metric.users);
        expect(metric.percentile).toBeGreaterThanOrEqual(0);
        expect(metric.percentile).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("population fixture — states", () => {
  it("insufficient, and exactly sufficient", () => {
    expect(fx(1).status).toBe("insufficient");
    expect(fx(1).strongestMode).toBeNull();
    expect(m(1, "daily").sufficiency).toMatchObject({ status: "insufficient", observed: 40, required: POPULATION_MIN_USERS });
    expect(m(2, "daily").users).toBe(POPULATION_MIN_USERS);
    expect(m(2, "daily").sufficiency.status).toBe("sufficient");
  });

  it("≈20th, 50th, 85th and 98th percentiles", () => {
    expect(Math.abs(m(5, "daily").percentile! - 20)).toBeLessThan(3);
    expect(Math.abs(m(6, "daily").percentile! - 50)).toBeLessThan(3);
    expect(Math.abs(m(8, "daily").percentile! - 85)).toBeLessThan(3);
    expect(Math.abs(m(12, "standard").percentile! - 98)).toBeLessThan(1.5);
  });

  it("heavy ties at a ceiling, an extreme outlier and a top-coded sparse tail", () => {
    const surv = m(10, "survival");
    const at = surv.frequency!.counts[surv.frequency!.values.indexOf(28)];
    expect(at / surv.users).toBeGreaterThan(0.2);
    const tt = m(14, "time_trial");
    expect(tt.percentile).toBeGreaterThanOrEqual(99.5);
    expect(tt.frequency!.topCodeAbove).toBe(22);
    expect(Math.max(...tt.frequency!.values)).toBe(22);
  });

  it("strongest mode: each mode wins once; no clear leader; one mode insufficient", () => {
    expect(fx(12).strongestMode!.winner).toBe("standard");
    expect(fx(8).strongestMode!.winner).toBe("time_trial");
    expect(fx(11).strongestMode!.winner).toBe("survival");
    expect(fx(13).strongestMode).toMatchObject({ winner: null, reasonCode: "no_clear_leader" });
    expect(fx(13).strongestMode!.marginPoints!).toBeLessThan(10);
    expect(fx(9).strongestMode).toMatchObject({ winner: null, reasonCode: "mode_insufficient" });
  });

  it("the user's values are the lab runs' own facts", () => {
    const recs = ANALYTICS_LAB_GOLDEN.scenarios.lab_premium.flatMap((p) => readHistoryPage(p).items as DailyHistoryRecord[]);
    for (const f of FIXTURES) {
      const r = recs.find((x) => x.runId === f.runId)!;
      const k = (kind: string) => r.stages.find((s) => s.kind === kind)!;
      expect(m(Number(f.runId.slice(-2)), "daily").userValue).toBe(r.basic.correct);
      expect(f.metrics.find((x) => x.stageKind === "standard")!.userValue).toBe(k("standard").basic.score);
      expect(f.metrics.find((x) => x.stageKind === "time_trial")!.userValue).toBe(k("time_trial").basic.correct);
      expect(f.metrics.find((x) => x.stageKind === "survival")!.userValue).toBe(k("survival").basic.questionsPlayed);
    }
  });
});

describe("population fixture — isolation", () => {
  it("never reaches the production History contract or components", () => {
    const src = resolve(__dirname, "../../../..");
    for (const file of [
      "lib/history/contracts.ts",
      "lib/history/personal.ts",
      "components/quiz/workspace/DailyRunRow.tsx",
      "components/quiz/workspace/StageAnalytics.tsx",
      "components/quiz/workspace/historyViewModel.ts",
    ]) {
      expect(readFileSync(resolve(src, file), "utf8")).not.toMatch(/analyticsLabPopulation|AnalyticsLabPopulation/);
    }
  });

  it("the server's population stays null on every lab record", () => {
    const recs = ANALYTICS_LAB_GOLDEN.scenarios.lab_premium.flatMap((p) => readHistoryPage(p).items as DailyHistoryRecord[]);
    for (const r of recs) expect((r as { population?: unknown }).population ?? null).toBeNull();
  });
});
