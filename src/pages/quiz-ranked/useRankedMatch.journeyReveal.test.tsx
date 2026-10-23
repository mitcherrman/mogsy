/**
 * QRT1 — the controller's half of a Journey reveal's visible duration.
 *
 *   1. An accepted Journey answer's reveal is applied FROM THE SUBMIT RESPONSE
 *      (`challenge_reveal_timing` + `challenge_reveal`), while the poll it
 *      triggers is still in flight — and only for that match and segment.
 *   2. An ack without the block (an older backend, a malformed one) changes
 *      nothing: the reveal arrives with the next poll, exactly as before.
 *   3. A child that expires unanswered is polled for AT its deadline, not on
 *      the next ordinary 1.5 s tick.
 *
 * Driven by the real JP5 captures (the Zed/Ahri reference Journey).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const sfx = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfx }));
vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { useRankedMatch } from "./useRankedMatch";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const REF: CaptureSnapshot[] = JSON.parse(readFileSync(join(FIX, "jp5/zed_ahri.reference.json"), "utf8"));
const snap = (label: string) => REF.find((x) => x.label === label)!;
type Wire = Record<string, unknown>;
const segWire = (env: unknown) => ((env as { payload: { segment_state: Wire } }).payload.segment_state);
const MATCH = (snap("child1-live").envelope as { match_id: string }).match_id;

function ackFor(reveal: CaptureSnapshot, index: number, withTiming = true): Wire {
  const seg = segWire(reveal.envelope);
  return {
    status: "accepted", match_id: MATCH, segment_number: seg.segment_number, challenge_index: index,
    idempotent: false, conflicting: false, segment_resolved: false,
    next_challenge_index: seg.own_next_challenge_index, reveal_window_ms: seg.reveal_window_ms,
    challenge_reveal_window_ms: seg.own_reveal_window_ms,
    challenge_reveal: (seg.own_challenge_reveals as Wire[]).find((r) => r.challenge_index === index),
    ...(withTiming ? {
      challenge_reveal_timing: {
        revealing_card_index: index, reveal_until: seg.own_reveal_until,
        reveal_window_ms: seg.own_reveal_window_ms ?? seg.reveal_window_ms,
        next_challenge_index: seg.own_next_challenge_index,
        next_card_started_at: seg.own_card_started_at, next_card_deadline: seg.own_card_deadline,
        challenges_completed: seg.own_challenges_completed, finished: seg.own_finished,
      },
    } : {}),
  };
}

interface Backend {
  envelope: unknown;
  /** How long a public read takes to answer (the live stack's latency). */
  publicDelayMs: number;
  publicReads: number[];
  ack: Wire;
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const later = <T,>(ms: number, value: () => T) =>
  new Promise<T>((r) => { setTimeout(() => r(value()), ms); });

beforeEach(() => {
  vi.useFakeTimers();
  const live = snap("child1-live");
  vi.setSystemTime(Date.parse(live.at));
  backend = { envelope: live.envelope, publicDelayMs: 0, publicReads: [], ack: ackFor(snap("child1-reveal"), 1) };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    if (u.includes("/presence")) return json({ status: "active", match_id: MATCH, active: true });
    if (/\/challenges\/\d+$/.test(u) && method === "POST") return json(backend.ack);
    if (u.endsWith(`/matches/${MATCH}`) && method === "GET") {
      backend.publicReads.push(Date.now());
      const env = backend.envelope;            // the state AT request time
      return backend.publicDelayMs
        ? later(backend.publicDelayMs, () => json(env)) : json(env);
    }
    // resume / private / anything else: transient, never part of this test.
    return json({ error: { code: "UNAVAILABLE" } }, 503);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const settle = async (ms = 20) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

describe("QRT1 — a Journey answer's reveal comes from its response", () => {
  it("applies the server's reveal while the triggered poll is still in flight", async () => {
    const { result } = renderHook(() => useRankedMatch(MATCH, "userA", { entry: "fresh" }));
    await settle();
    expect(result.current.segmentState?.ownNextChallengeIndex).toBe(1);
    expect(result.current.segmentState?.ownRevealingCardIndex).toBeNull();

    // From here every public read takes 1.2 s and returns the PRE-answer state.
    backend.publicDelayMs = 1200;
    act(() => { void result.current.submitSegmentChallenge(1, { selected: "85" }); });
    await settle(30);                              // the ack is back; the poll is not
    const seg = segWire(snap("child1-reveal").envelope);
    const state = result.current.segmentState!;
    expect(state.ownRevealingCardIndex).toBe(1);
    expect(state.ownRevealUntil).toBe(seg.own_reveal_until);
    expect(state.ownCardStartedAt).toBe(seg.own_card_started_at);
    expect(state.ownChallengeReveals.map((r) => r.challengeIndex)).toEqual([0, 1]);
    expect(state.ownChallengeReveals[1].isCorrect).toBe(true);   // the server's verdict, unchanged
    expect(result.current.journeyAckReveal?.matchId).toBe(MATCH);

    // The stale poll lands: it does not take the reveal away.
    await settle(1300);
    expect(result.current.segmentState!.ownRevealingCardIndex).toBe(1);
    // The catching-up snapshot wins outright (the overlay is then a no-op).
    backend.envelope = snap("child1-reveal").envelope;
    backend.publicDelayMs = 0;
    await settle(1600);
    expect(result.current.segmentState).toBe(result.current.publicRound!.segmentState);
  });

  it("an ack without the timing block (an older backend) changes nothing", async () => {
    backend.ack = ackFor(snap("child1-reveal"), 1, false);
    const { result } = renderHook(() => useRankedMatch(MATCH, "userA", { entry: "fresh" }));
    await settle();
    backend.publicDelayMs = 1200;
    act(() => { void result.current.submitSegmentChallenge(1, { selected: "85" }); });
    await settle(30);
    expect(result.current.journeyAckReveal).toBeNull();
    expect(result.current.segmentState!.ownRevealingCardIndex).toBeNull();
  });

  it("an ack for another segment is ignored", async () => {
    backend.ack = { ...ackFor(snap("child1-reveal"), 1), segment_number: 99 };
    const { result } = renderHook(() => useRankedMatch(MATCH, "userA", { entry: "fresh" }));
    await settle();
    backend.publicDelayMs = 1200;
    act(() => { void result.current.submitSegmentChallenge(1, { selected: "85" }); });
    await settle(30);
    expect(result.current.journeyAckReveal).toBeNull();
    expect(result.current.segmentState!.ownRevealingCardIndex).toBeNull();
  });
});

describe("QRT1 — a timeout is polled for at its deadline", () => {
  it("reads the state AT the open card's deadline, not on the next ordinary tick", async () => {
    // The live child expires 700 ms after the first read.
    const env = structuredClone(snap("child1-live").envelope) as Wire;
    segWire(env).own_card_deadline = new Date(Date.now() + 700).toISOString();
    backend.envelope = env;
    renderHook(() => useRankedMatch(MATCH, "userA", { entry: "fresh" }));
    await settle();
    const first = backend.publicReads.length;
    await settle(700 + 60 + 20);
    // A read at the deadline (+60 ms), well before the 1.5 s cadence.
    expect(backend.publicReads.length).toBe(first + 1);
    expect(backend.publicReads[first] - backend.publicReads[0]).toBeLessThan(1500);
    expect(backend.publicReads[first] - backend.publicReads[0]).toBeGreaterThanOrEqual(700);
  });

  it("schedules nothing for a deadline already past or a finished Journey", async () => {
    const env = structuredClone(snap("child3-reveal").envelope) as Wire;   // own_finished: true
    backend.envelope = env;
    renderHook(() => useRankedMatch(MATCH, "userA", { entry: "fresh" }));
    await settle();
    const first = backend.publicReads.length;
    await settle(1000);
    expect(backend.publicReads.length).toBe(first);                        // only the cadence remains
  });
});
