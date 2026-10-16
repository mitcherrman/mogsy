import { describe, expect, it } from "vitest";
import {
  PHASE_FACE, TIER_WORD, dataLabelText, errorDirection, formatMs, formatSeconds, ladderScaleMs, railGeometry, rankText,
  revealRankText, runStats, signedErrorText, tierSfx,
} from "./presentation";
import { DEMO_SUMMARY } from "./__stories__/demoViewModels";

describe("presentation — numbers", () => {
  it("formats durations as seconds with two places and errors as whole milliseconds", () => {
    expect(formatSeconds(6830)).toBe("6.83 s");
    expect(formatSeconds(7000)).toBe("7.00 s");
    expect(formatSeconds(118400)).toBe("118.40 s");
    expect(formatMs(-170)).toBe("170 ms");
    expect(formatMs(8400)).toBe("8,400 ms");
  });

  it("names the direction of a signed error", () => {
    expect(errorDirection(-170)).toBe("early");
    expect(errorDirection(240)).toBe("late");
    expect(errorDirection(0)).toBe("exact");
    expect(signedErrorText(-170)).toBe("170 ms early");
    expect(signedErrorText(240)).toBe("240 ms late");
    expect(signedErrorText(0)).toBe("Exact");
  });
});

describe("presentation — copy", () => {
  it("prints the rank, or 'any rank'", () => {
    expect(rankText(2, 3)).toBe("Rank 2 / 3");
    expect(rankText(null, 5)).toBe("Any rank");
    expect(revealRankText(3)).toBe("rank 3");
    expect(revealRankText(null)).toBe("any rank");
  });

  it("names the data WITH its source and never invents a patch", () => {
    expect(dataLabelText("26.19", "patch_operations")).toBe("Data: 26.19 (Patch Ops)");
    expect(dataLabelText("26.19", "patch_notes_ingestion_fallback")).toBe("Data: 26.19 (patch-notes fallback)");
    expect(dataLabelText(null, "unknown")).toBe("Data: patch unknown (source unknown)");
    expect(dataLabelText("26.19", "something_new")).toBe("Data: 26.19 (something_new)");
  });

  it("maps every tier to one of the two existing verdict cues", () => {
    expect(tierSfx("perfect")).toBe("ranked.answer.correct");
    expect(tierSfx("great")).toBe("ranked.answer.correct");
    expect(tierSfx("good")).toBe("ranked.answer.correct");
    expect(tierSfx("miss")).toBe("ranked.answer.incorrect");
    expect(Object.keys(TIER_WORD)).toEqual(["perfect", "great", "good", "miss"]);
  });

  it("keeps every phase face free of digits", () => {
    for (const face of Object.values(PHASE_FACE)) {
      expect(`${face.word} ${face.sub} ${face.status}`).not.toMatch(/\d/);
    }
  });
});

describe("presentation — the rail", () => {
  it("runs from zero to the first round end past the longer duration", () => {
    expect(railGeometry({ targetMs: 7000, elapsedMs: 6830 }).domainMs).toBe(8000);
    expect(railGeometry({ targetMs: 7000, elapsedMs: 9800 }).domainMs).toBe(12000);
    expect(railGeometry({ targetMs: 110000, elapsedMs: 118400 }).domainMs).toBe(150000);
    expect(railGeometry({ targetMs: 1000, elapsedMs: 900 }).domainMs).toBe(1500);
  });

  it("places both marks by the same linear map, and keeps even the longest stop inside the rail", () => {
    const g = railGeometry({ targetMs: 4000, elapsedMs: 2000 });
    expect(g.domainMs).toBe(5000);
    expect(g.truePct).toBe(80);
    expect(g.youPct).toBe(40);
    const far = railGeometry({ targetMs: 4000, elapsedMs: 600000 });
    expect(far.youPct).toBeLessThan(100);
    expect(far.youPct).toBeGreaterThan(far.truePct);
  });

  it("chooses notches so there are never more than eight on the rail", () => {
    for (const ms of [1000, 4000, 7000, 12000, 45000, 60000, 110000]) {
      const g = railGeometry({ targetMs: ms, elapsedMs: ms });
      expect(g.domainMs / g.tickMs).toBeLessThanOrEqual(8);
      expect(g.tickPcts.length).toBeLessThanOrEqual(7);
      for (const p of g.tickPcts) { expect(p).toBeGreaterThan(0); expect(p).toBeLessThan(100); }
    }
  });
});

describe("presentation — the run", () => {
  it("sums points and counts played, voided, perfect and landed rounds", () => {
    const s = runStats(DEMO_SUMMARY);
    expect(s).toMatchObject({ dealt: 5, played: 4, voided: 1, perfect: 2, hits: 3, totalPoints: 260, maxPoints: 500, bestAbsErrorMs: 0 });
    expect(s.meanAbsErrorMs).toBe(2618);
  });

  it("reads null means and bests from an unplayed run", () => {
    const s = runStats({ ...DEMO_SUMMARY, rounds: DEMO_SUMMARY.rounds.map((r) => ({ ...r, reveal: null })) });
    expect(s).toMatchObject({ played: 0, voided: 5, totalPoints: 0, meanAbsErrorMs: null, bestAbsErrorMs: null });
  });

  it("picks one round millisecond scale for the ladder", () => {
    expect(ladderScaleMs(DEMO_SUMMARY)).toBe(10000);
    expect(ladderScaleMs({ ...DEMO_SUMMARY, rounds: [DEMO_SUMMARY.rounds[0]] })).toBe(250);
  });
});

describe("PT5 slice formatting", () => {
  it("prints a slice duration at the precision it was graded, never float-rounded", async () => {
    const { formatSliceSeconds, deltaSecondsText, formatSecondsExact, hasteText } = await import("./presentation");
    expect(formatSliceSeconds(5500)).toBe("5.50 s");
    expect(formatSliceSeconds(5000)).toBe("5.00 s");
    expect(formatSliceSeconds(4545)).toBe("4.545 s"); // (4.545).toFixed(2) would say 4.54
    expect(formatSliceSeconds(10005)).toBe("10.005 s");
    expect(deltaSecondsText(5500, 5000)).toBe("−0.50 s");
    expect(deltaSecondsText(5000, 4545)).toBe("−0.455 s");
    expect(deltaSecondsText(4000, 4100)).toBe("+0.10 s");
    expect(formatSecondsExact(4545.4545)).toBe("4.545 s");
    expect(hasteText(10)).toBe("+10 Ability Haste");
    expect(hasteText(10, true)).toBe("+10 AH");
  });
});
