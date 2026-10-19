import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRECT_CAP_AFTER_MOUNT_MS,
  DIRECT_SAFETY_CAP_MS,
  ENTRANCE_CAP_MS,
  REVEAL_FADE_MS,
  __resetAcademyStartupForTests,
  cancelAcademyVeil,
  getAcademyStartup,
  holdAcademyVeil,
  noteAcademyMounted,
  reportAcademyReadiness,
  revealAcademy,
  subscribeAcademyStartup,
} from "./veil-store";

/** ACADEMY STARTUP RC2 — the held veil's state machine and its caps. */
beforeEach(() => {
  vi.useFakeTimers();
  __resetAcademyStartupForTests();
  document.documentElement.classList.remove("reduce-motion");
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => { vi.useRealTimers(); });

describe("holding and revealing", () => {
  it("starts idle; a hold is entrance or direct; a second hold is a no-op", () => {
    expect(getAcademyStartup().phase).toBe("idle");
    holdAcademyVeil("entrance");
    const first = getAcademyStartup();
    expect(first).toMatchObject({ phase: "held", source: "entrance" });
    holdAcademyVeil("direct");
    expect(getAcademyStartup()).toBe(first);
  });

  it("a ready reveal fades for REVEAL_FADE_MS, then the veil is gone", () => {
    holdAcademyVeil("entrance");
    revealAcademy("ready");
    expect(getAcademyStartup()).toMatchObject({ phase: "revealing", reason: "ready" });
    vi.advanceTimersByTime(REVEAL_FADE_MS - 1);
    expect(getAcademyStartup().phase).toBe("revealing");
    vi.advanceTimersByTime(1);
    expect(getAcademyStartup().phase).toBe("revealed");
  });

  it("under reduced motion the reveal is immediate (no fade)", () => {
    document.documentElement.classList.add("reduce-motion");
    holdAcademyVeil("entrance");
    revealAcademy("ready");
    expect(getAcademyStartup()).toMatchObject({ phase: "revealed", reason: "ready" });
  });

  it("reveal is only from held, and only once", () => {
    revealAcademy("ready");
    expect(getAcademyStartup().phase).toBe("idle");
    holdAcademyVeil("entrance");
    revealAcademy("degraded", { degraded: ["cover:archives"] });
    revealAcademy("ready");
    expect(getAcademyStartup()).toMatchObject({ reason: "degraded", degraded: ["cover:archives"] });
  });

  it("notifies subscribers on every transition", () => {
    const seen: string[] = [];
    subscribeAcademyStartup(() => seen.push(getAcademyStartup().phase));
    holdAcademyVeil("entrance");
    revealAcademy("ready");
    vi.advanceTimersByTime(REVEAL_FADE_MS);
    expect(seen).toEqual(["held", "revealing", "revealed"]);
  });
});

describe("caps — there is never an infinite veil", () => {
  it("entrance: 1.6 s after the hand-off, revealed as a timeout naming what it still waited for", () => {
    holdAcademyVeil("entrance");
    reportAcademyReadiness({ pending: ["cover:archives", "patch"], degraded: ["font:lora"] });
    vi.advanceTimersByTime(ENTRANCE_CAP_MS - 1);
    expect(getAcademyStartup().phase).toBe("held");
    vi.advanceTimersByTime(1);
    expect(getAcademyStartup()).toMatchObject({ phase: "revealing", reason: "timeout", pending: ["cover:archives", "patch"], degraded: ["font:lora"] });
  });

  it("entrance: the page never mounting (a stalled chunk or shell) still releases at the cap", () => {
    holdAcademyVeil("entrance");
    vi.advanceTimersByTime(ENTRANCE_CAP_MS);
    expect(getAcademyStartup()).toMatchObject({ reason: "timeout", pending: ["stage"] });
  });

  it("entrance: mounting does not extend the cap", () => {
    holdAcademyVeil("entrance");
    vi.advanceTimersByTime(1000);
    noteAcademyMounted();
    vi.advanceTimersByTime(ENTRANCE_CAP_MS - 1000);
    expect(getAcademyStartup().reason).toBe("timeout");
  });

  it("direct: 1.8 s after the Orrery MOUNTS (the flat surface before it is today's first paint anyway)", () => {
    holdAcademyVeil("direct");
    vi.advanceTimersByTime(4000); // a slow chunk
    expect(getAcademyStartup().phase).toBe("held");
    noteAcademyMounted();
    vi.advanceTimersByTime(DIRECT_CAP_AFTER_MOUNT_MS - 1);
    expect(getAcademyStartup().phase).toBe("held");
    vi.advanceTimersByTime(1);
    expect(getAcademyStartup().reason).toBe("timeout");
  });

  it("direct: a page that never mounts is released by the safety net", () => {
    holdAcademyVeil("direct");
    vi.advanceTimersByTime(DIRECT_SAFETY_CAP_MS);
    expect(getAcademyStartup().reason).toBe("timeout");
  });

  it("a ready reveal disarms the cap", () => {
    holdAcademyVeil("entrance");
    revealAcademy("ready");
    vi.advanceTimersByTime(ENTRANCE_CAP_MS * 2);
    expect(getAcademyStartup()).toMatchObject({ phase: "revealed", reason: "ready" });
  });
});

describe("cancellation", () => {
  it("drops a held veil at once, without a fade, and disarms the cap", () => {
    holdAcademyVeil("entrance");
    cancelAcademyVeil();
    expect(getAcademyStartup()).toMatchObject({ phase: "idle", reason: "cancelled" });
    vi.advanceTimersByTime(ENTRANCE_CAP_MS);
    expect(getAcademyStartup().phase).toBe("idle");
  });

  it("drops a fading veil too, keeping how it ended", () => {
    holdAcademyVeil("entrance");
    revealAcademy("ready");
    cancelAcademyVeil();
    expect(getAcademyStartup()).toMatchObject({ phase: "idle", reason: "ready" });
  });

  it("a later journey can hold again", () => {
    holdAcademyVeil("entrance");
    cancelAcademyVeil();
    holdAcademyVeil("entrance");
    expect(getAcademyStartup().phase).toBe("held");
  });
});
