/**
 * SCRUB-S1 — the Chronoscope's pure parts: snapping, pointer and keyboard
 * arithmetic, and the bounded reveal clock.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHRONOSCOPE_BUDGET_MS, assertChronoscopeContent, clampPosition, detentFraction, frameAt,
  planChronoscopeReveal, positionFromPointer, revealPosition, showsCanonical, showsProof,
  snapPosition, stageAt, stepIndexForKey, traverseWindow,
} from "./chronoscope";
import type { ChronoscopePublic } from "./types";

const content = (n: number): ChronoscopePublic<null> => ({
  eyebrow: "e", prompt: "p", unitLabel: "Step",
  checkpoints: Array.from({ length: n }, (_, i) => ({
    token: `t${i}`, label: `Step ${i + 1}`, clock: `${i}:00`, reading: [], scene: null,
  })),
});

describe("content assertions", () => {
  it("needs two distinct checkpoints and in-range rail marks", () => {
    expect(() => assertChronoscopeContent(content(1))).toThrow(/at least 2/);
    expect(() => assertChronoscopeContent(content(2))).not.toThrow();
    const dup = content(3);
    expect(() => assertChronoscopeContent({ ...dup, checkpoints: [dup.checkpoints[0], dup.checkpoints[0]] })).toThrow(/distinct/);
    expect(() => assertChronoscopeContent({ ...content(3), railMarks: [{ index: 3, text: "x" }] })).toThrow(/off the rail/);
    expect(() => assertChronoscopeContent({ ...content(3), railMarks: [{ index: 2, text: "x" }] })).not.toThrow();
  });
});

describe("position", () => {
  it("clamps to the rail and snaps to the nearest detent", () => {
    expect(clampPosition(-3, 15)).toBe(0);
    expect(clampPosition(99, 15)).toBe(14);
    expect(clampPosition(NaN, 15)).toBe(0);
    expect(snapPosition(3.49, 15)).toBe(3);
    expect(snapPosition(3.5, 15)).toBe(4);
    expect(snapPosition(14.9, 15)).toBe(14);
  });
  it("frames a fractional position between its neighbours", () => {
    expect(frameAt(3.25, 15)).toEqual({ from: 3, to: 4, t: 0.25 });
    expect(frameAt(14, 15)).toEqual({ from: 14, to: 14, t: 0 });
    expect(frameAt(0, 15)).toEqual({ from: 0, to: 1, t: 0 });
  });
  it("spreads detents evenly across the travel", () => {
    expect(detentFraction(0, 15)).toBe(0);
    expect(detentFraction(14, 15)).toBe(1);
    expect(detentFraction(7, 15)).toBeCloseTo(0.5);
    expect(detentFraction(0, 1)).toBe(0);
  });
  it("maps a pointer x through the rail's inset track", () => {
    const rail = { left: 100, width: 400, insetPx: 22 };
    expect(positionFromPointer(122, rail, 15)).toBe(0);
    expect(positionFromPointer(478, rail, 15)).toBe(14);
    expect(positionFromPointer(300, rail, 15)).toBeCloseTo(7);
    // Past either end is clamped, never thrown.
    expect(positionFromPointer(0, rail, 15)).toBe(0);
    expect(positionFromPointer(900, rail, 15)).toBe(14);
  });
});

describe("keyboard", () => {
  it("steps one, pages by the host's step, jumps to the ends", () => {
    expect(stepIndexForKey("ArrowRight", 3, 15, 3)).toBe(4);
    expect(stepIndexForKey("ArrowUp", 3, 15, 3)).toBe(4);
    expect(stepIndexForKey("ArrowLeft", 3, 15, 3)).toBe(2);
    expect(stepIndexForKey("ArrowDown", 0, 15, 3)).toBe(0);
    expect(stepIndexForKey("PageUp", 13, 15, 3)).toBe(14);
    expect(stepIndexForKey("PageDown", 1, 15, 3)).toBe(0);
    expect(stepIndexForKey("Home", 9, 15, 3)).toBe(0);
    expect(stepIndexForKey("End", 9, 15, 3)).toBe(14);
    expect(stepIndexForKey("Enter", 9, 15, 3)).toBeNull();
    expect(stepIndexForKey("a", 9, 15, 3)).toBeNull();
  });
});

describe("reveal clock", () => {
  it("is instant under reduced motion", () => {
    const plan = planChronoscopeReveal({ reduced: true, distance: 5 });
    expect(plan).toEqual({ instant: true, stages: [], totalMs: 0 });
    expect(stageAt(plan, 0)).toBe("done");
    expect(revealPosition(plan, 0, 7, 2)).toBe(2);
  });
  it("plays clamp → traverse → settle → proof inside the budget for a wrong lock", () => {
    const plan = planChronoscopeReveal({ reduced: false, distance: 4 });
    expect(plan.stages.map((s) => s.stage)).toEqual(["clamp", "traverse", "settle", "proof"]);
    expect(plan.totalMs).toBe(CHRONOSCOPE_BUDGET_MS);
    for (let i = 1; i < plan.stages.length; i++) expect(plan.stages[i].start).toBe(plan.stages[i - 1].end);
    expect(stageAt(plan, 0)).toBe("clamp");
    expect(stageAt(plan, plan.totalMs - 1)).toBe("proof");
    expect(stageAt(plan, plan.totalMs)).toBe("done");
  });
  it("skips the traverse for a correct lock and still ends inside the budget", () => {
    const plan = planChronoscopeReveal({ reduced: false, distance: 0 });
    expect(plan.stages.map((s) => s.stage)).toEqual(["clamp", "settle", "proof"]);
    expect(traverseWindow(plan)).toBeNull();
    expect(plan.totalMs).toBeLessThan(CHRONOSCOPE_BUDGET_MS);
    expect(revealPosition(plan, 100, 3, 3)).toBe(3);
  });
  it("scales the same shape to a host's shorter hold", () => {
    const full = planChronoscopeReveal({ reduced: false, distance: 6 });
    const short = planChronoscopeReveal({ reduced: false, distance: 6, budgetMs: 900 });
    expect(short.totalMs).toBe(900);
    expect(short.stages.map((s) => s.stage)).toEqual(full.stages.map((s) => s.stage));
    const w = traverseWindow(short)!;
    expect(w.end - w.start).toBeGreaterThan(0);
  });
  it("moves the reticle from the locked detent to the canonical one, only during the traverse", () => {
    const plan = planChronoscopeReveal({ reduced: false, distance: 5 });
    const w = traverseWindow(plan)!;
    expect(revealPosition(plan, 0, 9, 4)).toBe(9);
    expect(revealPosition(plan, w.start, 9, 4)).toBe(9);
    const mid = revealPosition(plan, (w.start + w.end) / 2, 9, 4);
    expect(mid).toBeGreaterThan(4);
    expect(mid).toBeLessThan(9);
    expect(revealPosition(plan, w.end, 9, 4)).toBe(4);
    expect(revealPosition(plan, plan.totalMs, 9, 4)).toBe(4);
    // Backwards and forwards alike.
    expect(revealPosition(plan, w.end, 2, 7)).toBe(7);
  });
  it("shows the canonical detent from settle and the proof from proof", () => {
    expect(showsCanonical("clamp")).toBe(false);
    expect(showsCanonical("traverse")).toBe(false);
    expect(showsCanonical("settle")).toBe(true);
    expect(showsProof("settle")).toBe(false);
    expect(showsProof("proof")).toBe(true);
    expect(showsProof("done")).toBe(true);
  });
});

describe("source contract", () => {
  it("the pure module never reads a reveal and never grades", () => {
    const src = readFileSync(path.resolve("src/lib/interaction-grammar/chronoscope.ts"), "utf8");
    expect(src).not.toMatch(/\bChronoscopeReveal\b/);
    expect(src).not.toMatch(/canonicalToken|isCorrect/);
  });
});
