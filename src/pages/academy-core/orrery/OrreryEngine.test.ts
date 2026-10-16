/**
 * Academy Core V3.5 Phase 2 — the engine's own contracts that need no layout:
 * the drag API, the frame-rate monitor behind the lite tier, and the tempo ramp.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrreryEngine, type EngineElements } from "./OrreryEngine";

const els = (tempo: HTMLElement[] = []): EngineElements => ({
  books: { leaguecraft: null, "pro-play": null, "combat-lab": null, archives: null },
  tethers: { leaguecraft: null, "pro-play": null, "combat-lab": null, archives: null },
  needle: null,
  parallax: [],
  tempo,
});

/** A manual requestAnimationFrame: `frames(n, ms)` runs the pending callback n times, ms apart. */
function manualRaf() {
  let cb: FrameRequestCallback | null = null;
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => { cb = f; return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => { cb = null; });
  let now = 0;
  return {
    frames(n: number, ms: number) {
      for (let i = 0; i < n; i++) { now += ms; const f = cb; cb = null; f?.(now); }
    },
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("drag API", () => {
  it("dragging moves the orbit with the pointer; release flings, then snaps and resumes", () => {
    const raf = manualRaf();
    const e = new OrreryEngine(els(), { mode: "orbit", animate: true });
    e.resize(960, 700);
    e.start();
    raf.frames(10, 16);
    expect(e.spinPhase).toBe("free");
    const before = e.phase;
    e.grab();
    expect(e.spinPhase).toBe("grabbed");
    // 40 px to the right at u = 1: the near side of the orbit follows the pointer (theta decreases)
    for (let i = 0; i < 8; i++) e.dragBy(40, 1 / 60);
    expect(e.phase).toBeLessThan(before - 0.5);
    e.release();
    expect(e.spinPhase).toBe("inertia");
    raf.frames(60 * 8, 16.7);
    expect(["dwell", "free"]).toContain(e.spinPhase);
  });

  it("is inert under reduced motion and in the phone composition", () => {
    for (const opts of [{ mode: "orbit" as const, animate: false }, { mode: "composed" as const, animate: true }]) {
      const e = new OrreryEngine(els(), opts);
      e.resize(960, 700);
      const p = e.phase;
      e.grab();
      e.dragBy(200, 0.1);
      e.release();
      expect(e.phase).toBe(p);
      expect(e.spinPhase).toBe("free");
    }
  });
});

describe("frame-rate monitor", () => {
  it("steps down once when frames stay slow after warm-up", () => {
    const raf = manualRaf();
    const onDegrade = vi.fn();
    const e = new OrreryEngine(els(), { mode: "orbit", animate: true, onDegrade });
    e.resize(960, 700);
    e.start();
    raf.frames(60, 16.7);
    expect(onDegrade).not.toHaveBeenCalled();
    raf.frames(400, 50); // 20 fps
    expect(onDegrade).toHaveBeenCalledTimes(1);
    raf.frames(200, 50);
    expect(onDegrade).toHaveBeenCalledTimes(1);
  });

  it("does not degrade a healthy 60 fps loop, nor one with a brief hitch", () => {
    const raf = manualRaf();
    const onDegrade = vi.fn();
    const e = new OrreryEngine(els(), { mode: "orbit", animate: true, onDegrade });
    e.resize(960, 700);
    e.start();
    raf.frames(600, 16.7);
    raf.frames(20, 80); // a hitch (a GC pause, a tab switch)
    raf.frames(600, 16.7);
    expect(onDegrade).not.toHaveBeenCalled();
  });
});

describe("tempo", () => {
  it("eases the playback rate of the Core's animations toward the room's tempo", () => {
    const raf = manualRaf();
    const a = { playbackRate: 1 };
    const el = { getAnimations: () => [a] } as unknown as HTMLElement;
    const e = new OrreryEngine(els([el]), { mode: "orbit", animate: true });
    e.resize(960, 700);
    e.start();
    e.setTempo(2.5);
    raf.frames(10, 16.7);
    expect(a.playbackRate).toBeGreaterThan(1);
    expect(a.playbackRate).toBeLessThan(2.5);
    raf.frames(120, 16.7);
    expect(a.playbackRate).toBeCloseTo(2.5, 1);
    e.setTempo(1);
    raf.frames(150, 16.7);
    expect(a.playbackRate).toBeCloseTo(1, 1);
  });
});

describe("arrow selector API", () => {
  it("steer turns the orbit to the selected book and holds it; releaseSelection lets the orbit go", () => {
    const raf = manualRaf();
    const e = new OrreryEngine(els(), { mode: "orbit", animate: true });
    e.resize(960, 700);
    e.start();
    raf.frames(5, 16.7);
    const id = e.steer(1);
    expect(id).toBe("leaguecraft");
    expect(e.selected).toBe("leaguecraft");
    expect(e.spinPhase).toBe("steering");
    raf.frames(150, 16.7);
    expect(e.spinPhase).toBe("held");
    const held = e.phase;
    raf.frames(300, 16.7);
    expect(e.phase).toBe(held);
    expect(e.steer(1)).toBe("archives");
    expect(e.steer(-1)).toBe("leaguecraft");
    e.releaseSelection();
    expect(e.selected).toBeNull();
    expect(e.spinPhase).toBe("free");
    raf.frames(120, 16.7);
    expect(e.phase).not.toBe(held);
  });

  it("a grab drops the selection; reduced motion places the selection at once; phones have no orbit to steer", () => {
    const raf = manualRaf();
    const e = new OrreryEngine(els(), { mode: "orbit", animate: true });
    e.resize(960, 700);
    e.start();
    e.steer(1);
    raf.frames(20, 16.7);
    e.grab();
    expect(e.selected).toBeNull();
    e.release();

    const r = new OrreryEngine(els(), { mode: "orbit", animate: false });
    r.resize(960, 700);
    const before = r.phase;
    expect(r.steer(1)).toBe("leaguecraft");
    expect(r.spinPhase).toBe("held");
    expect(r.phase).toBeCloseTo(before + Math.PI / 4, 9);

    const c = new OrreryEngine(els(), { mode: "composed", animate: true });
    c.resize(360, 640);
    expect(c.steer(1)).toBeNull();
  });
});
