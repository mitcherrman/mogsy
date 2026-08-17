/**
 * Controller behaviour for a multi-challenge segment (Phase B slice 4).
 *
 * Two things matter most here and are asserted directly:
 *   1. The client holds NO authority. It never advances its own challenge
 *      index — every action is a round trip and the next snapshot decides.
 *   2. The presence heartbeat runs for the whole match lifetime, in every
 *      phase, including while the local controls are disabled. Slice 3 showed
 *      a silent client is correctly forfeited during this longer segment, so
 *      an active player must keep beating without any widening of the grace.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { useRankedMatch, HEARTBEAT_MS } from "./useRankedMatch";
import {
  icdChallengeState, icdResolvedPayload, icdSegmentMeta, icdSegmentState,
  privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";

interface Backend {
  presenceBeats: number;
  abilityDrafts: unknown[];
  abilityConfirms: unknown[];
  challengeSubmits: { index: number; body: unknown }[];
  segmentState: unknown;
  segmentMeta: unknown;
  resolvedPayload: unknown | null;
  nextChallengeIndex: number;
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });

function publicBody() {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.segment = backend.segmentMeta;
  payload.segment_state = backend.segmentState;
  // Faithful to the backend: the engine round is created at the CHALLENGE
  // transition, so a segment in its ability window has no active round.
  const meta = backend.segmentMeta as Record<string, unknown> | null;
  if (meta?.phase === "ability") payload.active_round = null;
  return body;
}

function privateBody() {
  const body = privatePlayerV2("userA");
  const payload = body.payload as Record<string, unknown>;
  payload.segment = backend.segmentMeta;
  payload.segment_state = backend.segmentState;
  return body;
}

function resumeEnvelope() {
  return {
    schema_version: "ranked_duel.resume.v1", projection_type: "resume",
    match_id: "m1", round_number: 3, server_time: "2026-07-18T12:00:00+00:00",
    payload: {
      match_status: "active", match_over: false,
      public: publicBody(), private: privateBody(),
      progression_pending_players: [],
      latest_resolved_round: backend.resolvedPayload === null ? null : {
        schema_version: "ranked_duel.resolved_round.v2",
        projection_type: "resolved_round", match_id: "m1", round_number: 3,
        server_time: "2026-07-18T12:00:00+00:00",
        payload: backend.resolvedPayload,
      },
      result: null,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T12:00:00Z"));
  backend = {
    presenceBeats: 0, abilityDrafts: [], abilityConfirms: [],
    challengeSubmits: [], segmentState: icdSegmentState(),
    segmentMeta: icdSegmentMeta(), resolvedPayload: null,
    nextChallengeIndex: 0,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : null;
    if (u.endsWith("/resume")) return json(resumeEnvelope());
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) {
      backend.presenceBeats += 1;
      return json({ status: "active", match_id: "m1", active: true });
    }
    if (u.includes("/ability/confirm")) {
      backend.abilityConfirms.push(body);
      return json({ status: "confirmed", match_id: "m1", segment_number: 3,
        ability_id: body?.ability_id ?? null, confirmed: true, idempotent: false });
    }
    if (u.endsWith("/ability")) {
      backend.abilityDrafts.push(body);
      return json({ status: "draft", match_id: "m1", segment_number: 3,
        ability_id: body?.ability_id ?? null, confirmed: false, idempotent: false });
    }
    const challenge = u.match(/\/challenges\/(\d+)$/);
    if (challenge) {
      const index = Number(challenge[1]);
      backend.challengeSubmits.push({ index, body });
      return json({ status: "accepted", match_id: "m1", segment_number: 3,
        challenge_index: index, idempotent: false, conflicting: false,
        segment_resolved: false, next_challenge_index: backend.nextChallengeIndex });
    }
    if (/\/rounds\/\d+\/resolved$/.test(u)) {
      if (backend.resolvedPayload === null) return json({}, 409);
      return json({
        schema_version: "ranked_duel.resolved_round.v2",
        projection_type: "resolved_round", match_id: "m1", round_number: 3,
        server_time: "2026-07-18T12:00:00+00:00",
        payload: backend.resolvedPayload });
    }
    if (/\/matches\/m1$/.test(u) && method === "GET") return json(publicBody());
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const settle = async (ms = 20) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

describe("useRankedMatch — multi-challenge segments", () => {
  it("exposes the authoritative segment state from the ordinary poll", async () => {
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    const state = result.current.segmentState!;
    expect(state.moduleId).toBe("item_cost_duel");
    expect(state.phase).toBe("ability");
    expect(state.segmentNumber).toBe(3);
    expect(result.current.publicRound?.segment.phase).toBe("ability");
  });

  it("keeps a stable round header during the ability window", async () => {
    // A phased segment in its ability window has no engine round by design.
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    expect(result.current.roundNumber).toBe(3);
  });

  it("exposes no segment ability commands at all", async () => {
    // R3: Item Cost Duel has no ability interaction, so the controller offers
    // no way to reach one. The only segment command is a challenge submission.
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    const controller = result.current as unknown as Record<string, unknown>;
    expect(controller.draftSegmentAbility).toBeUndefined();
    expect(controller.confirmSegmentAbility).toBeUndefined();
    expect(typeof result.current.submitSegmentChallenge).toBe("function");
  });

  it("submits a v1 challenge with only the item id", async () => {
    backend.segmentState = icdChallengeState(1);
    backend.segmentMeta = icdSegmentMeta({ phase: "challenges", challenge_index: 1 });
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    act(() => result.current.submitSegmentChallenge(1, { itemId: "Item 3" }));
    await settle();
    expect(backend.challengeSubmits).toEqual([
      { index: 1, body: { item_id: "Item 3" } },
    ]);
  });

  it("never advances the challenge index itself", async () => {
    backend.segmentState = icdChallengeState(1);
    backend.nextChallengeIndex = 2;
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    act(() => result.current.submitSegmentChallenge(1, { itemId: "Item 3" }));
    await settle();
    // The ack said "next is 2", but the controller still reports 1 because the
    // SNAPSHOT still says 1. Only the authoritative state moves the segment.
    expect(result.current.segmentState?.ownNextChallengeIndex).toBe(1);
    backend.segmentState = icdChallengeState(2);
    await settle(1600);
    expect(result.current.segmentState?.ownNextChallengeIndex).toBe(2);
  });

  it("treats a stale phase or index as a re-poll, not an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url);
      if (u.endsWith("/resume")) return json(resumeEnvelope());
      if (u.endsWith("/private")) return json(privateBody());
      if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
      if (u.includes("/challenges/")) {
        return json({ detail: { code: "RANKED_WRONG_CHALLENGE_INDEX",
          message: "expected challenge index 2" } }, 409);
      }
      if (/\/matches\/m1$/.test(String(u)) && (init.method ?? "GET") === "GET") {
        return json(publicBody());
      }
      return json({}, 200);
    }) as unknown as typeof fetch);
    backend.segmentState = icdChallengeState(1);
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    act(() => result.current.submitSegmentChallenge(1, { itemId: "Item 3" }));
    await settle();
    expect(result.current.actionError).toBeNull();
  });

  it("surfaces a real action error", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url);
      if (u.endsWith("/resume")) return json(resumeEnvelope());
      if (u.endsWith("/private")) return json(privateBody());
      if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
      if (u.includes("/challenges/")) {
        return json({ detail: { code: "RANKED_INVALID_CHOICE",
          message: "that item is not in this pair" } }, 422);
      }
      if (/\/matches\/m1$/.test(String(u)) && (init.method ?? "GET") === "GET") {
        return json(publicBody());
      }
      return json({}, 200);
    }) as unknown as typeof fetch);
    backend.segmentState = icdChallengeState(1);
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    act(() => result.current.submitSegmentChallenge(1, { itemId: "Item 99" }));
    await settle();
    expect(result.current.actionError).toMatch(/not in this pair/);
  });

  it("recovers the transcript of a resolved segment on resume", async () => {
    backend.resolvedPayload = icdResolvedPayload();
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    const settlement = result.current.lastSegmentSettlement!;
    expect(settlement.reveal.challenges).toHaveLength(5);
    expect(settlement.damageByPlayerId.userA).toBe(15);
  });

  it("has no segment state for a quiz segment", async () => {
    backend.segmentState = null;
    backend.segmentMeta = { module_id: "quiz", module_version: 1,
      challenge_count: 1, challenge_index: 0 };
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    expect(result.current.segmentState).toBeNull();
    expect(result.current.publicRound?.segment.moduleId).toBe("quiz");
  });
});

describe("presence heartbeat across a multi-challenge segment", () => {
  it("keeps beating in every phase, including while controls are disabled", async () => {
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle();

    const phases: unknown[] = [
      icdSegmentState(),                                        // ability
      icdSegmentState({ own_ability: {                          // ability, locked
        selected_ability_id: "tank.fortify", confirmed: true,
        available_ability_ids: ["tank.fortify"], unavailable_ability_ids: {} } }),
      icdChallengeState(0),                                     // challenges
      icdChallengeState(3),
      icdChallengeState(5, { own_finished: true }),             // waiting
      null,                                                     // next quiz segment
    ];
    for (const phase of phases) {
      backend.segmentState = phase;
      const before = backend.presenceBeats;
      await settle(HEARTBEAT_MS + 100);
      expect(backend.presenceBeats).toBeGreaterThan(before);
    }
    // ...and the controller never entered a terminal/fatal state.
    expect(result.current.error).toBeNull();
  });

  it("beats on the same cadence regardless of quiz answer state", async () => {
    // The heartbeat must not be coupled to the quiz timer or submission
    // state: a phased segment never sets `hasSubmitted` until settlement.
    renderHook(() => useRankedMatch("m1", "userA"));
    await settle();
    const start = backend.presenceBeats;
    await settle(HEARTBEAT_MS * 3 + 100);
    expect(backend.presenceBeats - start).toBeGreaterThanOrEqual(3);
  });

  it("stops beating only when the match view unmounts", async () => {
    const { unmount } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle(HEARTBEAT_MS + 100);
    const beats = backend.presenceBeats;
    unmount();
    await settle(HEARTBEAT_MS * 2 + 100);
    expect(backend.presenceBeats).toBe(beats);
  });
});
