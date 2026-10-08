import { describe, expect, it } from "vitest";
import {
  planReveal, RECONSTRUCT_TIMING, settleDelayMs, showsEvidence, showsSettled, stageAt,
} from "./reconstructReveal";
import { RECONSTRUCT_MAX_SLOTS } from "./reconstruct";

const FULL = { reduced: false, anyWrong: true, hasEvidence: true };

describe("planReveal", () => {
  it("is marks 0–450, settle 450–1050, evidence 1050–1500 when everything shows", () => {
    expect(planReveal(FULL)).toEqual({
      instant: false,
      stages: [
        { stage: "marks", start: 0, end: 450 },
        { stage: "settle", start: 450, end: 1050 },
        { stage: "evidence", start: 1050, end: 1500 },
      ],
      totalMs: 1500,
    });
  });

  it("a fully correct build has no settle: marks, then evidence straight after, no gap", () => {
    const p = planReveal({ ...FULL, anyWrong: false });
    expect(p.stages.map((s) => s.stage)).toEqual(["marks", "evidence"]);
    expect(p.stages[1].start).toBe(p.stages[0].end);
    expect(p.totalMs).toBe(900);
  });

  it("with no evidence the reveal ends when settle does, or when marks do", () => {
    expect(planReveal({ ...FULL, hasEvidence: false }).totalMs).toBe(1050);
    expect(planReveal({ ...FULL, hasEvidence: false, anyWrong: false }).totalMs).toBe(450);
  });

  it("reduced motion is instant: no stages, no duration, whatever else is true", () => {
    for (const anyWrong of [true, false]) for (const hasEvidence of [true, false]) {
      expect(planReveal({ reduced: true, anyWrong, hasEvidence })).toEqual({ instant: true, stages: [], totalMs: 0 });
    }
  });

  it("every plan ends by 1.5 s and its stages tile the timeline with no gaps or overlaps", () => {
    for (const reduced of [true, false]) for (const anyWrong of [true, false]) for (const hasEvidence of [true, false]) {
      const p = planReveal({ reduced, anyWrong, hasEvidence });
      expect(p.totalMs).toBeLessThanOrEqual(1500);
      let at = 0;
      for (const s of p.stages) { expect(s.start).toBe(at); expect(s.end).toBeGreaterThan(s.start); at = s.end; }
      expect(at).toBe(p.totalMs);
    }
  });

  it("the stage budgets match the S0 spec (marks ≤ 450, settled by 1050, evidence by 1500)", () => {
    expect(RECONSTRUCT_TIMING.marksEnd).toBe(450);
    expect(RECONSTRUCT_TIMING.settleEnd).toBe(1050);
    expect(RECONSTRUCT_TIMING.evidenceEnd).toBe(1500);
  });
});

describe("stageAt", () => {
  const plan = planReveal(FULL);
  it("walks marks → settle → evidence → done at the boundaries", () => {
    expect([0, 449].map((t) => stageAt(plan, t))).toEqual(["marks", "marks"]);
    expect([450, 1049].map((t) => stageAt(plan, t))).toEqual(["settle", "settle"]);
    expect([1050, 1499].map((t) => stageAt(plan, t))).toEqual(["evidence", "evidence"]);
    expect([1500, 5000].map((t) => stageAt(plan, t))).toEqual(["done", "done"]);
  });
  it("skips a stage the plan skips", () => {
    const correct = planReveal({ ...FULL, anyWrong: false });
    expect(stageAt(correct, 449)).toBe("marks");
    expect(stageAt(correct, 450)).toBe("evidence");
    expect(stageAt(correct, 900)).toBe("done");
  });
  it("is done at once when instant", () => {
    expect(stageAt(planReveal({ ...FULL, reduced: true }), 0)).toBe("done");
  });
  it("the stage never goes backwards as time advances", () => {
    const order = ["marks", "settle", "evidence", "done"];
    let last = 0;
    for (let t = 0; t <= 2000; t += 10) {
      const i = order.indexOf(stageAt(plan, t));
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });
});

describe("what each stage shows", () => {
  it("settled sockets are on from settle onward; evidence only from evidence onward", () => {
    expect(showsSettled("marks")).toBe(false);
    for (const s of ["settle", "evidence", "done"] as const) expect(showsSettled(s)).toBe(true);
    expect(showsEvidence("marks")).toBe(false);
    expect(showsEvidence("settle")).toBe(false);
    expect(showsEvidence("evidence")).toBe(true);
    expect(showsEvidence("done")).toBe(true);
  });
});

describe("the tween constants fit their windows", () => {
  it("the marks tween ends inside the marks window", () => {
    expect(RECONSTRUCT_TIMING.marksTween).toBeLessThanOrEqual(RECONSTRUCT_TIMING.marksEnd);
  });
  it("the last wrong socket's settle tween ends inside the settle window, even with every socket wrong", () => {
    const window = RECONSTRUCT_TIMING.settleEnd - RECONSTRUCT_TIMING.marksEnd;
    const last = settleDelayMs(RECONSTRUCT_MAX_SLOTS - 1) + RECONSTRUCT_TIMING.settleTween;
    expect(last).toBeLessThanOrEqual(window);
  });
  it("the evidence tween ends inside the evidence window", () => {
    expect(RECONSTRUCT_TIMING.evidenceTween).toBeLessThanOrEqual(RECONSTRUCT_TIMING.evidenceEnd - RECONSTRUCT_TIMING.settleEnd);
  });
});
