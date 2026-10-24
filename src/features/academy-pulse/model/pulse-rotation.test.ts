import { describe, expect, it } from "vitest";

import { initialRotation, isRotating, rotationReducer, type PulseRotationAction, type PulseRotationState } from "./pulse-rotation";

const run = (s: PulseRotationState, ...actions: PulseRotationAction[]) => actions.reduce(rotationReducer, s);

describe("rotation", () => {
  it("advances on the dwell, wrapping into the next cycle", () => {
    let s = initialRotation(3);
    expect(isRotating(s)).toBe(true);
    s = run(s, { type: "advance" }, { type: "advance" });
    expect(s.index).toBe(2);
    expect(s.cycle).toBe(0);
    s = run(s, { type: "advance" });
    expect(s).toMatchObject({ index: 0, cycle: 1, direction: 1 });
  });

  it("every hold stops the dwell, and a stale timer firing under a hold changes nothing", () => {
    for (const reason of ["user", "hover", "focus", "interaction", "expanded", "offscreen", "hidden"] as const) {
      const held = run(initialRotation(4), { type: "hold", reason, on: true });
      expect(isRotating(held)).toBe(false);
      expect(run(held, { type: "advance" })).toBe(held);
    }
  });

  it("releasing one hold never resumes a rotation another hold still keeps", () => {
    let s = run(initialRotation(4), { type: "hold", reason: "hover", on: true }, { type: "hold", reason: "expanded", on: true });
    s = run(s, { type: "hold", reason: "hover", on: false });
    expect(isRotating(s)).toBe(false);
    s = run(s, { type: "hold", reason: "expanded", on: false });
    expect(isRotating(s)).toBe(true);
  });

  it("Pause is the viewer's own hold; reduced motion starts with it on", () => {
    const s = initialRotation(4, true);
    expect(isRotating(s)).toBe(false);
    expect(isRotating(run(s, { type: "toggle-user" }))).toBe(true);
  });

  it("moving by hand restarts the dwell and ends the scene's interaction hold, but not other holds", () => {
    let s = run(initialRotation(4), { type: "hold", reason: "interaction", on: true }, { type: "hold", reason: "focus", on: true });
    const before = s.epoch;
    s = run(s, { type: "next" });
    expect(s.index).toBe(1);
    expect(s.epoch).toBe(before + 1);
    expect(s.holds.has("interaction")).toBe(false);
    expect(s.holds.has("focus")).toBe(true);
  });

  it("Pause follows the viewer's choice, not a transient hold (PULSE-1.2)", () => {
    const hovering = run(initialRotation(4), { type: "hold", reason: "hover", on: true });
    expect(isRotating(hovering)).toBe(false);
    const paused = run(hovering, { type: "toggle-user" });
    expect(paused.holds.has("user")).toBe(true); // the first press pauses, it does not resume
  });

  it("explicit Play clears pointer, mouse-focus and stale interaction pauses", () => {
    const stopped = run(initialRotation(4, true),
      { type: "hold", reason: "hover", on: true },
      { type: "hold", reason: "focus", on: true },
      { type: "hold", reason: "interaction", on: true });
    expect(isRotating(stopped)).toBe(false);
    const resumed = run(stopped, { type: "toggle-user" });
    expect(isRotating(resumed)).toBe(true);
    expect(resumed.holds.size).toBe(0);

    // Explicit Play must never bypass an expanded modal or visibility safety.
    const blocked = run(stopped,
      { type: "hold", reason: "expanded", on: true },
      { type: "hold", reason: "hidden", on: true },
      { type: "toggle-user" });
    expect(blocked.holds).toEqual(new Set(["expanded", "hidden"]));
    expect(isRotating(blocked)).toBe(false);
  });

  it("manual scene selection drops a pointer hover but preserves deliberate keyboard focus", () => {
    const stopped = run(initialRotation(3),
      { type: "hold", reason: "hover", on: true },
      { type: "hold", reason: "focus", on: true });
    const next = run(stopped, { type: "next" });
    expect(next.index).toBe(1);
    expect(next.holds.has("hover")).toBe(false);
    expect(next.holds.has("focus")).toBe(true);
    expect(isRotating(run(next, { type: "hold", reason: "focus", on: false }))).toBe(true);
  });

  it("Previous wraps backwards (into the previous cycle) and records the direction", () => {
    const s = run(initialRotation(4), { type: "next" }, { type: "next" }, { type: "next" }, { type: "next" });
    expect(s).toMatchObject({ index: 0, cycle: 1 });
    expect(run(s, { type: "prev" })).toMatchObject({ index: 3, cycle: 0, direction: -1 });
  });

  it("goto jumps to a pip; out-of-range or same index is ignored", () => {
    const s = initialRotation(5);
    expect(run(s, { type: "goto", index: 3 })).toMatchObject({ index: 3, direction: 1 });
    expect(run(s, { type: "goto", index: 0 })).toBe(s);
    expect(run(s, { type: "goto", index: 9 })).toBe(s);
  });

  it("a single scene never rotates; a shrinking cycle keeps the index in range", () => {
    expect(isRotating(initialRotation(1))).toBe(false);
    expect(run(initialRotation(1), { type: "next" }).index).toBe(0);
    const s = run(initialRotation(6), { type: "goto", index: 5 }, { type: "resize", length: 3 });
    expect(s.index).toBe(2);
  });

  it("can open on a chosen scene", () => {
    expect(initialRotation(5, false, 3).index).toBe(3);
    expect(initialRotation(5, false, -1).index).toBe(0);
    expect(initialRotation(5, false, 7).index).toBe(0);
  });
});
