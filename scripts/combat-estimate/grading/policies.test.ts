/**
 * CEG1 — the grading research's invariants, and the guard that keeps the
 * generated tables equal to the code that generates them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport, FALLBACK, loadCapture, RECOMMENDED, REPORT } from "./audit";
import {
  absolutePolicy, ce1RelativeText, closestWins, hybridPolicy, hybridTolerance, inputtable, isCorrect, modelledAnswers,
  reconstructAuthority, relativeExactPolicy, roundHalfUp, smoothScore, type Truth,
} from "./policies";
import { gradePlaytest, parsePlaytestCsv } from "./grade_playtest";
import { roundHalfUp as ce1RoundHalfUp } from "@/lib/combat-estimate/contract";

const capture = loadCapture();
const certified = capture.scenarios.filter((s) => s.kind === "certified");
const truthOf = (s: { answer: { exact: number; whole: number } }): Truth => ({ exact: s.answer.exact, whole: s.answer.whole });

describe("the evidence base", () => {
  it("is CE1's twelve certified scenarios at the captured backend commit, with nothing synthetic", () => {
    expect(certified).toHaveLength(12);
    expect(capture.scenarios).toHaveLength(12);
    expect(capture.backend.commit).toMatch(/^8829fc3c/);
    expect(certified.filter((s) => s.metric === "raw")).toHaveLength(2);
  });

  it("the offline model reproduces every captured authority answer (the anchor for every modelled answer)", () => {
    for (const s of certified) expect(Math.abs(reconstructAuthority(s) - s.answer.exact)).toBeLessThan(1e-9);
  });

  it("rounds exactly as CE1 and the backend display do (ROUND_HALF_UP)", () => {
    for (const v of [0, 0.5, 1.4999, 144.5, 144.4999, 72.5666, 265.89]) expect(roundHalfUp(v)).toBe(ce1RoundHalfUp(v));
    for (const s of certified) expect(roundHalfUp(s.answer.exact)).toBe(s.answer.whole);
  });
});

describe("the instrument's input contract", () => {
  const scale = { max: 400, coarseStep: 50 };
  it("submits whole numbers in [0, max − 1] only, and says when an intent could not be expressed", () => {
    expect(inputtable(144, scale)).toEqual({ value: 144, reach: "reachable" });
    expect(inputtable(151.437, scale)).toEqual({ value: 151, reach: "rounded" });
    expect(inputtable(-27, scale)).toEqual({ value: 0, reach: "clamped-low" });
    expect(inputtable(400, scale)).toEqual({ value: 399, reach: "clamped-high" });
  });
  it("every certified whole answer is reachable on its own beam", () => {
    for (const s of certified) expect(inputtable(s.answer.whole, { max: s.scale.max, coarseStep: s.scale.coarse_step }).reach).toBe("reachable");
  });
});

describe("policy properties", () => {
  const truths: Truth[] = [...certified.map(truthOf), { exact: 0, whole: 0 }, { exact: 3, whole: 3 }, { exact: 144.5, whole: 145 }, { exact: 980, whole: 980 }];

  it("the hybrid is symmetric in points, never narrower than its floor, and always contains the whole answer", () => {
    for (const t of truths) {
      const b = RECOMMENDED.band(t)!;
      expect(t.whole - b.lo).toBe(b.hi - t.whole);
      expect(b.hi - t.whole).toBeGreaterThanOrEqual(2);
      expect(isCorrect(RECOMMENDED, t, t.whole)).toBe(true);
    }
  });

  it("the hybrid is defined at zero damage; a pure relative rule is not", () => {
    expect(RECOMMENDED.band({ exact: 0, whole: 0 })).toEqual({ lo: -2, hi: 2 });
    expect(relativeExactPolicy(0.1).band({ exact: 0, whole: 0 })).toBeNull();
    expect(isCorrect(relativeExactPolicy(0.1), { exact: 0, whole: 0 }, 0)).toBe(false);
  });

  it("T = max(K, roundHalfUp(p × whole)) at the documented points", () => {
    expect(hybridTolerance(2, 0.025, 73)).toBe(2);
    expect(hybridTolerance(2, 0.025, 144)).toBe(4);
    expect(hybridTolerance(2, 0.025, 266)).toBe(7);
    expect(hybridTolerance(2, 0.025, 486)).toBe(12);
    expect(hybridTolerance(2, 0.025, 1000)).toBe(25);
  });

  it("a wider policy accepts everything a narrower one in the same family accepts", () => {
    for (const s of certified) {
      const t = truthOf(s);
      for (let e = 0; e < s.scale.max; e += 1) {
        if (isCorrect(RECOMMENDED, t, e)) expect(isCorrect(FALLBACK, t, e)).toBe(true);
        if (isCorrect(absolutePolicy(5), t, e)) expect(isCorrect(absolutePolicy(10), t, e)).toBe(true);
      }
    }
  });

  it("a relative rule on the exact value is asymmetric around the shown whole answer (the trap the hybrid avoids)", () => {
    const zed = truthOf(certified.find((s) => s.id === "zed-q-r1-l2-longsword-vs-ahri")!);
    const b = relativeExactPolicy(0.05).band(zed)!;
    expect([zed.whole - b.lo, b.hi - zed.whole]).toEqual([4, 3]);
  });

  it("CE1's whole-percent reveal text can print the threshold for an estimate a ≤p% rule fails", () => {
    const jarvan = truthOf(certified.find((s) => s.id === "jarvan-q-r3-l5-dirk-vs-olaf")!);
    expect(ce1RelativeText(jarvan, 159)).toBe("10%");
    expect(isCorrect(relativeExactPolicy(0.1), jarvan, 159)).toBe(false);
  });

  it("the smooth score is 1 at the truth, falls with distance, and is 0 past its zero point", () => {
    const t = { exact: 200, whole: 200 };
    expect(smoothScore(t, 200)).toBe(1);
    expect(smoothScore(t, 210)).toBeCloseTo(0.9, 10);
    expect(smoothScore(t, 190)).toBeCloseTo(0.9, 10);
    expect(smoothScore(t, 320)).toBe(0);
  });

  it("closest-wins needs both players' estimates, draws at equal distance and times out the absent", () => {
    const t = { exact: 144.2, whole: 144 };
    expect(closestWins(t, 144, 145)).toEqual(["win", "lose"]);
    expect(closestWins({ exact: 150, whole: 150 }, 140, 160)).toEqual(["draw", "draw"]);
    expect(closestWins(t, null, 300)).toEqual(["timeout", "win"]);
  });
});

describe("the measured claims the handoff makes", () => {
  it("the recommendation accepts every correct-method shortcut and rejects every modelled misconception on the certified rounds", () => {
    for (const s of certified) {
      const scale = { max: s.scale.max, coarseStep: s.scale.coarse_step };
      for (const m of modelledAnswers(s)) {
        const verdict = isCorrect(RECOMMENDED, truthOf(s), inputtable(m.value, scale).value);
        if (m.cls === "method-shortcut") expect(verdict, `${s.id} ${m.id}`).toBe(true);
        if (m.cls === "misconception") expect(verdict, `${s.id} ${m.id}`).toBe(false);
      }
    }
  });

  it("the fallback lets exactly the four small-penetration misconceptions through", () => {
    const passed: string[] = [];
    for (const s of certified) {
      const scale = { max: s.scale.max, coarseStep: s.scale.coarse_step };
      for (const m of modelledAnswers(s)) {
        if (m.cls === "misconception" && isCorrect(FALLBACK, truthOf(s), inputtable(m.value, scale).value)) passed.push(`${s.id.split("-vs-")[0]}:${m.id}`);
      }
    }
    expect(passed.sort()).toEqual([
      "jhin-w-r5-l13-dirk-pickaxe:no-pen", "leesin-r-r2-l11-brutalizer:no-pen",
      "olaf-q-r5-l11-lastwhisper:pct-as-flat", "vi-r-r3-l18-lastwhisper-pickaxe-pickaxe:pct-as-flat",
    ]);
  });

  it("no hybrid band reaches past a certified beam (no answer needs an off-beam estimate to be correct)", () => {
    for (const s of certified) {
      const b = hybridPolicy(3, 0.05).band(truthOf(s))!;
      expect(b.lo).toBeGreaterThanOrEqual(0);
      expect(b.hi).toBeLessThanOrEqual(s.scale.max - 1);
    }
  });
});

describe("the playtest log grader", () => {
  it("reads the template and grades its example row offline", () => {
    const rows = parsePlaytestCsv(readFileSync(path.resolve("scripts/combat-estimate/grading/playtest-log.template.csv"), "utf8"));
    expect(rows).toEqual([{ round: "jarvan-q-r3-l5-dirk-vs-olaf", device: "desktop", estimate: 150, seconds: 25, gut: "fair-correct", note: "example row - delete me" }]);
    const truths = new Map(certified.map((s) => [s.id, truthOf(s)]));
    const report = gradePlaytest(rows, truths);
    // 150 vs 144: outside the recommendation's ±4, inside the fallback's ±7.
    expect(report).toContain("jarvan-q-r3-l5-dirk-vs-olaf | desktop | 150 | 144 | 6 | fair-correct | incorrect | correct");
    expect(report).toContain(`${RECOMMENDED.label}: agrees with the gut call on 0/1`);
  });

  it("refuses a log it cannot read rather than guessing", () => {
    expect(() => parsePlaytestCsv("round,device,estimate,seconds,gut,note\nx,phone,12.5,,unsure,")).toThrow(/whole-number/);
    expect(() => parsePlaytestCsv("a,b\n")).toThrow(/header/);
  });
});

describe("reproducibility", () => {
  it("the committed tables equal a fresh run of the generator", () => {
    const committed = readFileSync(path.resolve(REPORT), "utf8").replace(/\r\n/g, "\n");
    expect(buildReport(capture)).toBe(committed);
  });

  it("the research code imports no app runtime (it can never grade a live round)", () => {
    const src = readFileSync(path.resolve("scripts/combat-estimate/grading/policies.ts"), "utf8");
    expect(src).not.toMatch(/^import /m);
  });
});
