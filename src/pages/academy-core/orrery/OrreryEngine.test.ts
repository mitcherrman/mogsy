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

  /** An engine with a monitor, started; `frames` drives its loop. */
  function monitored() {
    const raf = manualRaf();
    const onDegrade = vi.fn();
    const e = new OrreryEngine(els(), { mode: "orbit", animate: true, onDegrade });
    e.resize(960, 700);
    e.start();
    return { e, onDegrade, frames: raf.frames };
  }

  it("a steady 60 fps loop never degrades (a minute, and with a slow frame in every three)", () => {
    const { onDegrade, frames } = monitored();
    frames(3600, 16.7);
    // 45 fps: one frame in three misses vsync
    for (let i = 0; i < 600; i++) { frames(1, 33.3); frames(2, 16.7); }
    expect(onDegrade).not.toHaveBeenCalled();
  });

  it("a steady 33 fps loop degrades once, within a few seconds", () => {
    const { onDegrade, frames } = monitored();
    frames(90 + 66, 30.3); // warm-up, then two seconds: the window has only just filled
    expect(onDegrade).not.toHaveBeenCalled();
    frames(44, 30.3); // ~6 s from the start
    expect(onDegrade).toHaveBeenCalledTimes(1);
    frames(600, 30.3);
    expect(onDegrade).toHaveBeenCalledTimes(1);
  });

  it("alternating 33 ms and 17 ms frames (Firefox at full quality) degrade", () => {
    const { onDegrade, frames } = monitored();
    for (let i = 0; i < 150; i++) { frames(1, 33.3); frames(1, 16.7); } // 7.5 s
    expect(onDegrade).toHaveBeenCalledTimes(1);
  });

  it("brief stalls in a 60 fps loop do not degrade", () => {
    const { onDegrade, frames } = monitored();
    const steady = () => frames(240, 16.7); // 4 s
    steady();
    frames(20, 80); // 1.6 s of 12 fps
    steady();
    frames(20, 50); // a second of 20 fps
    steady();
    frames(30, 40); // 1.2 s of 25 fps
    steady();
    frames(1, 1000); // one long pause (GC, a debugger)
    steady();
    frames(1, 5000);
    steady();
    for (let i = 0; i < 10; i++) { frames(1, 300); frames(120, 16.7); } // a 300 ms hitch every two seconds
    expect(onDegrade).not.toHaveBeenCalled();
  });

  it("a slow start (loading, first compile) and a tab switch do not degrade", () => {
    const { e, onDegrade, frames } = monitored();
    frames(90 + 20, 50); // the first 5.5 s at 20 fps: warm-up, then one more second
    frames(600, 16.7);
    e.setVisible(false); // the tab is hidden: the loop stops
    frames(1, 30_000); // no frame is delivered; the clock moves on
    e.setVisible(true);
    frames(1, 16.7); // the first frame back follows a 30 s gap on the clock
    frames(600, 16.7);
    expect(onDegrade).not.toHaveBeenCalled();
  });

  it("judges only while the loop runs, and starts afresh after a pause", () => {
    const { e, onDegrade, frames } = monitored();
    frames(90 + 80, 30.3); // warm-up, then 2.4 s slow
    e.stop();
    frames(400, 30.3); // no frames are delivered while stopped
    expect(onDegrade).not.toHaveBeenCalled();
    e.start();
    frames(90 + 40, 30.3); // a fresh warm-up and 1.2 s: not yet a full window
    expect(onDegrade).not.toHaveBeenCalled();
    frames(100, 30.3);
    expect(onDegrade).toHaveBeenCalledTimes(1);
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
