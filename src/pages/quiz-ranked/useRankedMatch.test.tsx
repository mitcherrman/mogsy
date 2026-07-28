import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { useRankedMatch } from "./useRankedMatch";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

interface Backend {
  submissions: unknown[];
  /** Bodies posted to the R3 round-ability route, in order. */
  abilityDrafts: unknown[];
  /** Set to make the next ability write fail with this typed code. */
  abilityFailure: string | null;
  resumeCalls: number;
  publicOverride: unknown | null;
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function resumeEnvelope() {
  return {
    schema_version: "ranked_duel.resume.v1", projection_type: "resume",
    match_id: "m1", round_number: 1, server_time: "2026-07-18T12:00:00+00:00",
    payload: {
      match_status: "active", match_over: false,
      public: publicRoundV2(), private: privatePlayerV2("userA"),
      progression_pending_players: [], latest_resolved_round: null, result: null,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T12:00:05Z"));
  backend = {
    submissions: [], abilityDrafts: [], abilityFailure: null,
    resumeCalls: 0, publicOverride: null,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    if (u.endsWith("/resume")) { backend.resumeCalls += 1; return json(resumeEnvelope()); }
    if (u.endsWith("/private")) return json(privatePlayerV2("userA"));
    if (u.includes("/submission")) { backend.submissions.push(JSON.parse(init.body as string)); return json({ status: "accepted" }); }
    if (/\/rounds\/\d+\/ability$/.test(u)) {
      if (backend.abilityFailure) {
        const code = backend.abilityFailure;
        backend.abilityFailure = null;
        return json({ detail: { code, message: code } }, 409);
      }
      backend.abilityDrafts.push(JSON.parse(init.body as string));
      return json({ status: "accepted" });
    }
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (/\/matches\/m1$/.test(u) && method === "GET")
      return json(backend.publicOverride ?? publicRoundV2());
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const settle = async (ms = 20) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe("useRankedMatch", () => {
  it("resumes into the active round with the question and own abilities", async () => {
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    expect(backend.resumeCalls).toBe(1);
    expect(result.current.phase).toBe("active");
    expect(result.current.publicRound?.question?.options).toHaveLength(4);
    expect(result.current.privatePlayer?.ownerPlayerId).toBe("userA");
    // Skew anchored to server_time.
    expect(typeof result.current.skewMs).toBe("number");
  });

  it("one answer call submits immediately, with no ability and no confirm step",
    async () => {
      const { result } = renderHook(() => useRankedMatch("m1", "userA"));
      await settle();
      act(() => result.current.answer("1", 1));   // option index 1
      await settle();
      expect(backend.submissions).toEqual([{ round_number: 1, answer: 1 }]);
    });

  it("a second click while the first is in flight sends nothing extra", async () => {
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    act(() => {
      result.current.answer("1", 1);
      result.current.answer("2", 2);  // double activation
    });
    await settle();
    expect(backend.submissions).toEqual([{ round_number: 1, answer: 1 }]);
  });

  it("does not report the answer as locked before the server accepts it", async () => {
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    act(() => result.current.answer("1", 1));
    // Mid-flight: the controller stays in the active phase and only marks
    // itself busy. `locked` comes from the backend snapshot, never from here.
    expect(result.current.submitting).toBe(true);
    expect(result.current.phase).toBe("active");
    await settle();
  });

  it("drafts the ability on its own route, independent of the answer", async () => {
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    act(() => result.current.selectAbility("tank.fortify"));
    await settle();
    expect(backend.abilityDrafts).toEqual([{ ability_id: "tank.fortify" }]);
    expect(backend.submissions).toHaveLength(0);  // no answer was implied
    expect(result.current.selectedAbilityId).toBe("tank.fortify");
  });

  it("clears the ability back to No Ability with an explicit null", async () => {
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    act(() => result.current.selectAbility("tank.fortify"));
    await settle();
    act(() => result.current.selectAbility(null));
    await settle();
    expect(backend.abilityDrafts).toEqual([
      { ability_id: "tank.fortify" }, { ability_id: null }]);
    expect(result.current.selectedAbilityId).toBeNull();
  });

  it("still accepts an ability change after the answer has been submitted",
    async () => {
      const { result } = renderHook(() => useRankedMatch("m1", "userA"));
      await settle();
      act(() => result.current.answer("1", 1));
      await settle();
      act(() => result.current.selectAbility("tank.fortify"));
      await settle();
      expect(backend.abilityDrafts).toEqual([{ ability_id: "tank.fortify" }]);
    });

  it("a closed round reverts the echo instead of reporting an error", async () => {
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    backend.abilityFailure = "RANKED_ROUND_CLOSED";
    act(() => result.current.selectAbility("tank.fortify"));
    await settle();
    // The server's frozen value wins; a lost race is not a user-facing failure.
    expect(result.current.selectedAbilityId).toBeNull();
    expect(result.current.actionError).toBeNull();
  });

  it("keeps a sticky round number across the between-rounds gap (never blanks)", async () => {
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    expect(result.current.roundNumber).toBe(1);

    // Simulate the transition window: the backend reports NO active round (and no
    // question) between one round settling and the next starting — match not over.
    const gap = publicRoundV2();
    gap.payload.active_round = null;
    gap.payload.question = null;
    gap.payload.match_status = "active";
    backend.publicOverride = gap;
    await settle(2000); // trigger the next poll

    // The raw round has no active round…
    expect(result.current.publicRound?.activeRound ?? null).toBeNull();
    // …but the sticky header number is preserved, so the view never shows "Round —".
    expect(result.current.roundNumber).toBe(1);
    expect(result.current.phase).not.toBe("match_over");
  });

  it("sends a presence heartbeat on its own cadence", async () => {
    renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    const before = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .filter((c) => String(c[0]).includes("/presence")).length;
    await settle(10000);  // one heartbeat interval
    const after = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .filter((c) => String(c[0]).includes("/presence")).length;
    expect(after).toBeGreaterThan(before);
  });
});
