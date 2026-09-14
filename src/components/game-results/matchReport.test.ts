import { describe, expect, it } from "vitest";
import { buildMatchReport } from "./matchReport";
import type { ResultTimelineEntry } from "./model";

const e = (
  index: number, label: string, outcome: ResultTimelineEntry["outcome"],
): ResultTimelineEntry => ({ index, label, outcome });

describe("the Mogzy match report is derived, and refuses what it cannot support", () => {
  it("says nothing at all about an empty timeline", () => {
    expect(buildMatchReport({ entries: [] })).toEqual([]);
  });

  it("names the strongest and the weakest subject when both are earned", () => {
    const lines = buildMatchReport({
      entries: [
        e(1, "Champion Mastery", "correct"), e(2, "Champion Mastery", "correct"),
        e(3, "Item Builds", "incorrect"), e(4, "Item Builds", "incorrect"),
      ],
    });
    expect(lines[0]).toContain("Champion Mastery was your strongest area");
    expect(lines[0]).toContain("2 of 2");
    expect(lines[1]).toContain("Item Builds cost you the most");
    expect(lines[1]).toContain("2 missed");
  });

  it("claims no strength from a single lucky question", () => {
    // One subject met once and answered right is not evidence of a strength.
    const lines = buildMatchReport({
      entries: [e(1, "Runes", "correct"), e(2, "Item Builds", "incorrect")],
    });
    expect(lines.some((l) => l.includes("strongest"))).toBe(false);
    expect(lines[0]).toMatch(/item builds/i);
  });

  it("never pairs one subject against itself", () => {
    const lines = buildMatchReport({
      entries: [
        e(1, "Item Builds", "correct"), e(2, "Item Builds", "correct"),
        e(3, "Item Builds", "incorrect"),
      ],
    });
    expect(lines.some((l) => l.includes("strongest"))).toBe(false);
    expect(lines).toHaveLength(1);
  });

  it("calls a clean sheet a clean sheet", () => {
    const lines = buildMatchReport({
      entries: [e(1, "Runes", "correct"), e(2, "Item Builds", "correct")],
    });
    expect(lines[0]).toMatch(/clean sheet/i);
  });

  it("mentions timeouts only when the mode COUNTS them", () => {
    const entries = [e(1, "Runes", "correct"), e(2, "Runes", "incorrect")];
    // null = the mode does not measure timeouts, which is not "zero timeouts".
    expect(buildMatchReport({ entries, timeoutCount: null })
      .some((l) => /ran out of time/.test(l))).toBe(false);
    expect(buildMatchReport({ entries, timeoutCount: 0 })
      .some((l) => /ran out of time/.test(l))).toBe(false);
    expect(buildMatchReport({ entries, timeoutCount: 2 })
      .some((l) => /2 questions ran out of time/.test(l))).toBe(true);
  });

  it("mentions discoveries only when there were some", () => {
    const entries = [e(1, "Runes", "correct")];
    expect(buildMatchReport({ entries, discoveredCount: 0 })
      .some((l) => /collection/.test(l))).toBe(false);
    expect(buildMatchReport({ entries, discoveredCount: 1 })
      .some((l) => /One new question joined your collection/.test(l))).toBe(true);
  });

  it("makes no claim about speed, percentile or other players", () => {
    const lines = buildMatchReport({
      entries: [
        e(1, "Runes", "correct"), e(2, "Runes", "correct"),
        e(3, "Item Builds", "incorrect"),
      ],
      timeoutCount: 1, discoveredCount: 3,
    }).join(" ");
    expect(lines).not.toMatch(/faster|slower|percentile|players|average|rank/i);
  });

  it("is deterministic — the same input gives the same sentences", () => {
    const input = {
      entries: [
        e(1, "Runes", "correct"), e(2, "Runes", "incorrect"),
        e(3, "Item Builds", "incorrect"), e(4, "Item Builds", "correct"),
      ],
      timeoutCount: 1,
    };
    expect(buildMatchReport(input)).toEqual(buildMatchReport(input));
  });
});
