import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { useRankedMatch } from "./useRankedMatch";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

interface Backend { submissions: unknown[]; resumeCalls: number }
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
  backend = { submissions: [], resumeCalls: 0 };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    if (u.endsWith("/resume")) { backend.resumeCalls += 1; return json(resumeEnvelope()); }
    if (u.endsWith("/private")) return json(privatePlayerV2("userA"));
    if (u.includes("/submission")) { backend.submissions.push(JSON.parse(init.body as string)); return json({ status: "accepted" }); }
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (/\/matches\/m1$/.test(u) && method === "GET") return json(publicRoundV2());
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

  it("select -> review -> confirm issues exactly one atomic submission", async () => {
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    act(() => result.current.selectOption("1"));   // option index 1
    act(() => result.current.selectAbility("tank.fortify"));
    act(() => result.current.review());
    expect(result.current.phase).toBe("reviewing");
    expect(backend.submissions).toHaveLength(0);    // entering review sends nothing
    act(() => result.current.confirm(1));
    await settle();
    expect(backend.submissions).toEqual([
      { round_number: 1, answer: 1, ability_id: "tank.fortify" }]);
  });

  it("edit before confirm sends nothing", async () => {
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    act(() => result.current.selectOption("0"));
    act(() => result.current.review());
    act(() => result.current.edit());
    expect(result.current.phase).toBe("active");
    expect(backend.submissions).toHaveLength(0);
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
