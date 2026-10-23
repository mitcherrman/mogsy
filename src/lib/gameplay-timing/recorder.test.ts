import { beforeEach, describe, expect, it } from "vitest";
import {
  TIMING_RING_SIZE, clearTimingRecords, recordRequestTiming, recordTiming, serverAppMs,
  timingRecords, timingSummary,
} from "./recorder";

beforeEach(() => clearTimingRecords());

describe("GR1 gameplay timing recorder", () => {
  it("parses only the app metric's duration from Server-Timing", () => {
    expect(serverAppMs("app;dur=12.5")).toBe(12.5);
    expect(serverAppMs("db;dur=3, app;desc=\"handler\";dur=7")).toBe(7);
    expect(serverAppMs("db;dur=3")).toBeNull();
    expect(serverAppMs("app;dur=abc")).toBeNull();
    expect(serverAppMs(null)).toBeNull();
  });

  it("splits a request into backend and network shares; unknown backend stays unknown", () => {
    recordRequestTiming("r", 100, "app;dur=30", { status: 200 });
    recordRequestTiming("r", 80, null, { status: 502 });
    const recs = timingRecords();
    expect(recs.filter((r) => r.category === "backend").map((r) => r.ms)).toEqual([30]);
    expect(recs.filter((r) => r.category === "network").map((r) => r.ms)).toEqual([70, 80]);
    expect(recs[2].detail?.backend_known).toBe(false);
  });

  it("is bounded and summarises percentiles per category and name", () => {
    for (let i = 0; i < TIMING_RING_SIZE + 50; i += 1) {
      recordTiming({ name: "x", category: "polling", ms: i % 100 });
    }
    expect(timingRecords()).toHaveLength(TIMING_RING_SIZE);
    const s = timingSummary()["polling:x"];
    expect(s.count).toBe(TIMING_RING_SIZE);
    expect(s.max).toBe(99);
  });

  it("drops nonsense instead of throwing into gameplay", () => {
    recordTiming({ name: "bad", category: "render", ms: Number.NaN });
    recordTiming({ name: "neg", category: "render", ms: -5 });
    expect(timingRecords()).toHaveLength(0);
  });
});
