import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Routes, __resetRoutePrefetchForTests, prefetchRoute } from "./route-prefetch";

/**
 * PERF1 — prefetchRoute keeps its per-path dedupe, and gains an intent signal
 * that runs a queued idle warm early instead of issuing a second one.
 */
describe("prefetchRoute", () => {
  let idle: Array<() => void>;

  beforeEach(() => {
    __resetRoutePrefetchForTests();
    idle = [];
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
      idle.push(cb);
      return idle.length;
    });
    for (const key of ["Quiz", "CombatLab", "LolHub", "LeagueDocsLanding", "ProPlayHub"] as const) {
      vi.spyOn(Routes[key], "prefetch").mockResolvedValue({ default: () => null } as never);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("schedules the chunks at idle, once per path", () => {
    prefetchRoute("/quiz");
    prefetchRoute("/quiz");
    expect(Routes.Quiz.prefetch).not.toHaveBeenCalled();
    expect(idle).toHaveLength(1);
    idle.forEach((cb) => cb());
    expect(Routes.Quiz.prefetch).toHaveBeenCalledTimes(1);
  });

  it("intent requests the chunks immediately, without waiting for idle", () => {
    prefetchRoute("/lol/pro-play", { intent: true });
    expect(Routes.ProPlayHub.prefetch).toHaveBeenCalledTimes(1);
    expect(idle).toHaveLength(0);
  });

  it("intent runs an already-queued idle warm early, and the idle callback then does nothing", () => {
    prefetchRoute("/lol/docs");
    expect(Routes.LeagueDocsLanding.prefetch).not.toHaveBeenCalled();
    prefetchRoute("/lol/docs", { intent: true });
    expect(Routes.LeagueDocsLanding.prefetch).toHaveBeenCalledTimes(1);
    idle.forEach((cb) => cb());
    prefetchRoute("/lol/docs", { intent: true });
    expect(Routes.LeagueDocsLanding.prefetch).toHaveBeenCalledTimes(1);
  });

  it("an unknown path is remembered and costs nothing, with or without intent", () => {
    prefetchRoute("/no-such-page");
    prefetchRoute("/no-such-page", { intent: true });
    expect(idle).toHaveLength(0);
  });

  it("warms /lol's own set unchanged (Hub, Combat Lab, Leaguecraft)", () => {
    prefetchRoute("/lol", { intent: true });
    expect(Routes.LolHub.prefetch).toHaveBeenCalledTimes(1);
    expect(Routes.CombatLab.prefetch).toHaveBeenCalledTimes(1);
    expect(Routes.Quiz.prefetch).toHaveBeenCalledTimes(1);
  });
});
