import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertEstimateContent, beamFigures, clampEstimate, coarseFromFraction, coarseNotches, composeEstimate, estimateCeiling,
  fineFigures, fineFraction, fineFromFraction, formatEstimate, fractionOf, needleAngle, NEEDLE_MAX_DEG, planEstimateReveal,
  showsLedger, showsTruth, showsVerdict, splitEstimate, stageAt, stepForKey,
} from "./estimate";
import type { EstimatePublic, EstimateScale } from "./types";

const scale: EstimateScale = { max: 400, coarseStep: 50, figureEvery: 100 };
const content = (over: Partial<EstimatePublic> = {}): EstimatePublic => ({
  prompt: "How much?", measureLabel: "Final damage", unitLabel: "damage", scale,
  certification: { kind: "certified", label: "Combat authority" }, ...over,
});

describe("estimate content", () => {
  it("accepts a lattice scale with a stated certification", () => {
    expect(() => assertEstimateContent(content())).not.toThrow();
  });
  it("refuses a max that is not a multiple of the coarse step", () => {
    expect(() => assertEstimateContent(content({ scale: { max: 410, coarseStep: 50, figureEvery: 100 } }))).toThrow(/multiple/);
  });
  it("refuses a beam with fewer than two notches", () => {
    expect(() => assertEstimateContent(content({ scale: { max: 50, coarseStep: 50, figureEvery: 50 } }))).toThrow(/two coarse notches/);
  });
  it("refuses figures off the lattice", () => {
    expect(() => assertEstimateContent(content({ scale: { max: 400, coarseStep: 50, figureEvery: 75 } }))).toThrow(/figureEvery/);
  });
  it("refuses content without a certification", () => {
    expect(() => assertEstimateContent({ ...content(), certification: undefined as unknown as EstimatePublic["certification"] })).toThrow(/certification/);
  });
});

describe("values", () => {
  it("clamps to the beam and rounds to whole numbers", () => {
    expect(estimateCeiling(scale)).toBe(399);
    expect(clampEstimate(-5, scale)).toBe(0);
    expect(clampEstimate(1e9, scale)).toBe(399);
    expect(clampEstimate(12.4, scale)).toBe(12);
    expect(clampEstimate(12.6, scale)).toBe(13);
    expect(clampEstimate(Number.NaN, scale)).toBe(0);
  });
  it("lists the coarse notches up to one step short of the end", () => {
    expect(coarseNotches(scale)).toEqual([0, 50, 100, 150, 200, 250, 300, 350]);
  });
  it("splits and composes every value on the beam exactly", () => {
    for (let v = 0; v < scale.max; v++) {
      const { coarse, fine } = splitEstimate(v, scale);
      expect(coarse % scale.coarseStep).toBe(0);
      expect(fine).toBeGreaterThanOrEqual(0);
      expect(fine).toBeLessThan(scale.coarseStep);
      expect(composeEstimate(coarse, fine, scale)).toBe(v);
    }
  });
  it("composes a clamped notch and offset", () => {
    expect(composeEstimate(900, 5, scale)).toBe(355);
    expect(composeEstimate(100, 99, scale)).toBe(149);
    expect(composeEstimate(-50, -1, scale)).toBe(0);
  });
});

describe("geometry", () => {
  it("maps values linearly along the beam", () => {
    expect(fractionOf(0, scale)).toBe(0);
    expect(fractionOf(200, scale)).toBe(0.5);
    expect(fractionOf(400, scale)).toBe(1);
    expect(fractionOf(1000, scale)).toBe(1);
  });
  it("snaps a coarse press to the nearest notch and never past the last", () => {
    expect(coarseFromFraction(0.26, scale)).toBe(100);
    expect(coarseFromFraction(0.49, scale)).toBe(200);
    expect(coarseFromFraction(1, scale)).toBe(350);
    expect(coarseFromFraction(-1, scale)).toBe(0);
  });
  it("reads a fine press as one unit of the step", () => {
    expect(fineFromFraction(0, scale)).toBe(0);
    expect(fineFromFraction(1, scale)).toBe(49);
    expect(fineFromFraction(0.5, scale)).toBe(25);
    expect(fineFraction(49, scale)).toBe(1);
    expect(fineFraction(0, scale)).toBe(0);
  });
  it("engraves a tick per notch plus the end, and a figure every figureEvery", () => {
    const figures = beamFigures(scale);
    expect(figures.map((f) => f.value)).toEqual([0, 50, 100, 150, 200, 250, 300, 350, 400]);
    expect(figures.filter((f) => f.labelled).map((f) => f.value)).toEqual([0, 100, 200, 300, 400]);
    const fine = fineFigures(scale);
    expect(fine).toHaveLength(50);
    expect(fine.filter((f) => f.labelled).map((f) => f.value)).toEqual([0, 10, 20, 30, 40]);
  });
});

describe("keyboard", () => {
  it("steps one unit, ten with Shift, a notch with Page keys, and reaches the ends", () => {
    expect(stepForKey("ArrowRight", false, 10, scale)).toBe(11);
    expect(stepForKey("ArrowUp", false, 10, scale)).toBe(11);
    expect(stepForKey("ArrowLeft", false, 10, scale)).toBe(9);
    expect(stepForKey("ArrowDown", false, 10, scale)).toBe(9);
    expect(stepForKey("ArrowRight", true, 10, scale)).toBe(20);
    expect(stepForKey("ArrowLeft", true, 10, scale)).toBe(0);
    expect(stepForKey("PageUp", false, 10, scale)).toBe(60);
    expect(stepForKey("PageDown", false, 60, scale)).toBe(10);
    expect(stepForKey("Home", false, 60, scale)).toBe(0);
    expect(stepForKey("End", false, 60, scale)).toBe(399);
  });
  it("clamps at the ends and ignores keys it does not own", () => {
    expect(stepForKey("ArrowRight", false, 399, scale)).toBe(399);
    expect(stepForKey("PageUp", false, 380, scale)).toBe(399);
    expect(stepForKey("ArrowLeft", false, 0, scale)).toBe(0);
    expect(stepForKey("Enter", false, 10, scale)).toBeNull();
    expect(stepForKey("a", false, 10, scale)).toBeNull();
  });
});

describe("readout", () => {
  it("groups thousands with a narrow no-break space and signs negatives", () => {
    expect(formatEstimate(999)).toBe("999");
    expect(formatEstimate(1234)).toBe("1 234");
    expect(formatEstimate(-5)).toBe("−5");
    expect(formatEstimate(0)).toBe("0");
  });
});

describe("needle", () => {
  it("rests at zero for an exact reveal and swings with the relative error", () => {
    expect(needleAngle("exact", 0)).toBe(0);
    expect(needleAngle("over", 0.25)).toBe(21);
    expect(needleAngle("under", 0.25)).toBe(-21);
    expect(needleAngle("over", 1)).toBe(NEEDLE_MAX_DEG);
    expect(needleAngle("under", 2)).toBe(-NEEDLE_MAX_DEG);
  });
  it("pins on the verdict's side when there is no relative error", () => {
    expect(needleAngle("over", null)).toBe(NEEDLE_MAX_DEG);
    expect(needleAngle("under", null)).toBe(-NEEDLE_MAX_DEG);
  });
});

describe("reveal clock", () => {
  it("lays the stages out contiguously inside the budget", () => {
    const plan = planEstimateReveal({ reduced: false, budgetMs: 2000 });
    expect(plan.instant).toBe(false);
    expect(plan.stages.map((s) => s.stage)).toEqual(["charge", "descend", "band", "ledger"]);
    for (let i = 1; i < plan.stages.length; i++) expect(plan.stages[i].start).toBe(plan.stages[i - 1].end);
    expect(plan.totalMs).toBe(plan.stages[plan.stages.length - 1].end);
    expect(plan.totalMs).toBe(2000);
    expect(stageAt(plan, 0)).toBe("charge");
    expect(stageAt(plan, plan.stages[1].start)).toBe("descend");
    expect(stageAt(plan, plan.stages[2].start)).toBe("band");
    expect(stageAt(plan, plan.stages[3].start)).toBe("ledger");
    expect(stageAt(plan, plan.totalMs)).toBe("done");
  });
  it("never goes below a readable minimum budget", () => {
    expect(planEstimateReveal({ reduced: false, budgetMs: 10 }).totalMs).toBe(400);
  });
  it("is instant under reduced motion", () => {
    const plan = planEstimateReveal({ reduced: true });
    expect(plan.instant).toBe(true);
    expect(stageAt(plan, 0)).toBe("done");
  });
  it("orders what each stage shows", () => {
    expect(showsTruth("charge")).toBe(false);
    expect(showsTruth("descend")).toBe(true);
    expect(showsVerdict("descend")).toBe(false);
    expect(showsVerdict("band")).toBe(true);
    expect(showsLedger("band")).toBe(false);
    expect(showsLedger("ledger")).toBe(true);
    expect(showsLedger("done")).toBe(true);
  });
});

describe("source contract", () => {
  it("knows no domain, no host and no authority", () => {
    const src = readFileSync(resolve(__dirname, "estimate.ts"), "utf8");
    expect(src).not.toMatch(/combat-estimate|labAuthority|__fixtures__|pages\/dev|journey/);
    expect(src).not.toMatch(/champion|armor|damage/i);
    // The reveal's truth never enters this file: it draws values, it does not compare them.
    expect(src).not.toMatch(/lockedValue|truth\.value/);
  });
});
