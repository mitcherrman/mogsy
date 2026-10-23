/**
 * GR1 — fault injection for the live-match controller.
 *
 * A small STATEFUL fake of the backend's submission contract (identical
 * retry → `idempotent: true`; a different answer after one is stored →
 * `conflicting: true`, stored answer wins), with per-endpoint faults:
 *
 *   * `502`         — the platform answers instead of the app (Railway edge);
 *   * `drop`        — the server STORES the write, then the response is lost
 *                     (the ambiguous success);
 *   * `hang`        — the request never answers (only the client deadline
 *                     ends it);
 *   * `delay:<ms>`  — answers, late.
 *
 * Ordinary questions and Stat Check (Meta Reflex segment cards) are verified
 * in SEPARATE suites because they take different routes, different guards and
 * different confirmation signals (`has_submitted` vs the server's card index).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const sfx = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfx }));
vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import {
  INTERRUPTED_BACKOFF_CAP_MS, useRankedMatch,
} from "./useRankedMatch";
import { REQUEST_TIMEOUT_MS } from "@/lib/ranked-public/client";
import {
  metaReflexSegmentMeta, metaReflexState, privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";
import { clearTimingRecords, timingRecords } from "@/lib/gameplay-timing/recorder";

type Fault = "ok" | "502" | "drop" | "hang" | "404" | `delay:${number}`;

interface Server {
  /** Every submission body that REACHED the server, in order. */
  received: { round: number; answer: number }[];
  /** The durable store: round → answer index. */
  stored: Map<number, number>;
  activeRound: number;
  completedRounds: number;
  /** Faults consumed one per request, then `steady`. */
  submitFaults: Fault[];
  readFaults: Fault[];
  resolvedFaults: Fault[];
  steadySubmit: Fault;
  steadyRead: Fault;
  publicReads: number[];   // fake-clock instants of public reads
  resumeFaults: Fault[];
  resumeCalls: number;
  // ---- Stat Check
  segment: boolean;
  cardIndex: number;
  cardSubmits: { index: number; cardId: string }[];
  cardStored: Map<number, string>;
}
let server: Server;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const html502 = () => new Response("<html>Application failed to respond</html>",
  { status: 502, headers: { "Content-Type": "text/html" } });

const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });

/** Apply a fault around `work` (which performs the server-side effect). */
function withFault(fault: Fault, init: RequestInit, work: () => Response): Promise<Response> {
  if (fault === "502") return Promise.resolve(html502());
  if (fault === "404") return Promise.resolve(json({ detail: "Not Found" }, 404));
  if (fault === "drop") { work(); return Promise.reject(new TypeError("Failed to fetch")); }
  if (fault === "hang") {
    return new Promise((_res, rej) => {
      if (init.signal?.aborted) { rej(abortError()); return; }
      init.signal?.addEventListener("abort", () => rej(abortError()));
    });
  }
  if (fault.startsWith("delay:")) {
    const ms = Number(fault.slice(6));
    return new Promise((res, rej) => {
      const id = setTimeout(() => res(work()), ms);
      init.signal?.addEventListener("abort", () => { clearTimeout(id); rej(abortError()); });
    });
  }
  return Promise.resolve(work());
}

function publicBody() {
  const body = publicRoundV2();
  const p = body.payload as Record<string, unknown>;
  p.round_number = server.activeRound;
  p.completed_rounds = server.completedRounds;
  (p.active_round as Record<string, unknown>).round_number = server.activeRound;
  (body as Record<string, unknown>).round_number = server.activeRound;
  const me = (p.players as Record<string, unknown>[])[0];
  me.has_submitted = server.segment ? false : server.stored.has(server.activeRound);
  if (server.segment) {
    p.segment = metaReflexSegmentMeta({ challenge_index: server.cardIndex });
    p.segment_state = metaReflexState(server.cardIndex);
  }
  return body;
}

function privateBody() {
  const body = privatePlayerV2("userA");
  const p = body.payload as Record<string, unknown>;
  const pub = publicBody().payload as Record<string, unknown>;
  Object.assign(p, { players: pub.players, active_round: pub.active_round,
    completed_rounds: pub.completed_rounds, segment: pub.segment, segment_state: pub.segment_state });
  return body;
}

function resolvedBody(n: number) {
  const player = (id: string) => ({
    player_id: id, class_id: id === "userA" ? "tank" : "mage",
    outcome: "correct", submitted_at: "2026-07-18T12:00:00+00:00",
    answered_first: id === "userA", timed_out: false, selected_ability_id: null,
    damage: { base_damage_dealt: 10, outgoing_bonus: 0, final_damage_dealt: 10,
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: 10 },
    hp_before: 170, hp_after: 160, reached_zero_hp: false, xp_gained: 0, total_xp_after: 0,
    level_before: 1, level_after: 1, level_up_events: [], charge_consumed: false,
    consumed_ability_id: null, remaining_charges: {},
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 1 },
    combat_lab_unlock_delta_seconds: 0,
  });
  return {
    schema_version: "ranked_duel.resolved_round.v2", projection_type: "resolved_round",
    match_id: "m1", round_number: n, server_time: "2026-07-18T12:00:00+00:00",
    payload: {
      match_id: "m1", round_number: n, question_id: "q1", end_reason: "both_answered",
      started_at: "2026-07-18T12:00:00+00:00", original_deadline: "2026-07-18T12:00:30+00:00",
      final_deadline: "2026-07-18T12:00:30+00:00", pressure_applied: false,
      players: [player("userA"), player("userB")],
      next_round_duration_seconds: 30, next_round_duration_delta: 0,
      match_over: false, winner_id: null, completion_reason: null,
    },
  };
}

const next = (q: Fault[], steady: Fault): Fault => q.length ? q.shift()! : steady;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T12:00:05Z"));
  clearTimingRecords();
  server = {
    received: [], stored: new Map(), activeRound: 1, completedRounds: 0,
    submitFaults: [], readFaults: [], resolvedFaults: [], steadySubmit: "ok", steadyRead: "ok",
    publicReads: [], resumeFaults: [], resumeCalls: 0,
    segment: false, cardIndex: 0, cardSubmits: [], cardStored: new Map(),
  };
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    if (u.endsWith("/resume")) {
      server.resumeCalls += 1;
      return withFault(next(server.resumeFaults, "ok"), init, () => json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: server.activeRound,
        server_time: "2026-07-18T12:00:00+00:00",
        payload: { match_status: "active", match_over: false, public: publicBody(),
          private: privateBody(), latest_resolved_round: null, result: null },
      }));
    }
    if (u.endsWith("/private")) return Promise.resolve(json(privateBody()));
    if (u.includes("/presence")) return Promise.resolve(json({ status: "active", match_id: "m1", active: true }));
    const sub = /\/rounds\/(\d+)\/submission$/.exec(u);
    if (sub) {
      const body = JSON.parse(init.body as string) as { round_number: number; answer: number };
      return withFault(next(server.submitFaults, server.steadySubmit), init, () => {
        server.received.push({ round: body.round_number, answer: body.answer });
        const prior = server.stored.get(body.round_number);
        if (prior !== undefined) {
          return json({ status: "accepted", round_number: body.round_number,
            idempotent: true, conflicting: prior !== body.answer, round_resolved: false });
        }
        if (body.round_number !== server.activeRound) {
          return json({ detail: { code: "RANKED_STALE_ROUND", message: "stale" } }, 409);
        }
        server.stored.set(body.round_number, body.answer);
        return json({ status: "accepted", round_number: body.round_number,
          idempotent: false, conflicting: false, round_resolved: false });
      });
    }
    const card = /\/segments\/\d+\/challenges\/(\d+)$/.exec(u);
    if (card) {
      const index = Number(card[1]);
      const body = JSON.parse(init.body as string) as { card_id: string };
      return withFault(next(server.submitFaults, server.steadySubmit), init, () => {
        server.cardSubmits.push({ index, cardId: body.card_id });
        const prior = server.cardStored.get(index);
        if (prior === undefined) {
          if (index !== server.cardIndex) {
            return json({ detail: { code: "RANKED_WRONG_CHALLENGE_INDEX", message: "x" } }, 409);
          }
          server.cardStored.set(index, body.card_id);
          server.cardIndex = index + 1;
        }
        return json({ status: "accepted", match_id: "m1", segment_number: 4,
          challenge_index: index, idempotent: prior !== undefined,
          conflicting: prior !== undefined && prior !== body.card_id,
          segment_resolved: false, next_challenge_index: server.cardIndex });
      });
    }
    const resolved = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (resolved) {
      const n = Number(resolved[1]);
      return withFault(next(server.resolvedFaults, "ok"), init, () =>
        (n >= 1 && n <= server.completedRounds ? json(resolvedBody(n))
          : json({ detail: { code: "RANKED_ROUND_NOT_RESOLVED", message: "x" } }, 409)));
    }
    if (/\/matches\/m1$/.test(u) && method === "GET") {
      server.publicReads.push(Date.now());
      return withFault(next(server.readFaults, server.steadyRead), init, () => json(publicBody()));
    }
    return Promise.resolve(json({}));
  }) as unknown as typeof fetch);
  sfx.play.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const settle = async (ms = 20) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

async function mountMatch() {
  const hook = renderHook(() => useRankedMatch("m1", "userA"));
  await settle();
  expect(hook.result.current.phase).toBe("active");
  return hook;
}

// ───────────────────────────────────────────────────────── ordinary questions
describe("GR1 ordinary questions — submission reconciliation", () => {
  it("ambiguous success (stored, response lost): keeps the pick, re-sends the SAME answer, never releases", async () => {
    server.submitFaults = ["drop"];
    const { result } = await mountMatch();
    act(() => result.current.answer("1", 1));
    await settle(10);
    expect(result.current.answerReconciling).toBe(true);
    expect(result.current.selectedOptionId).toBe("1");
    expect(result.current.actionError).toBeNull();
    // A second click during reconciliation — e.g. on another option — sends nothing.
    act(() => result.current.answer("2", 2));
    await settle(3000);
    expect(server.received.every((r) => r.answer === 1)).toBe(true);
    expect(server.stored.get(1)).toBe(1);
    expect(result.current.answerReconciling).toBe(false);
    expect(result.current.phase).toBe("locked");
    expect(result.current.actionError).toBeNull();
    expect(sfx.play).toHaveBeenCalledWith("ranked.answer.lock", { eventId: "ranked:m1:round:1:lock" });
    expect(timingRecords().some((r) => r.name === "answer.reconcile" && r.detail?.surface === "round"))
      .toBe(true);
  });

  it("502 on submit (Railway edge) then recovery: the same answer is delivered once stored", async () => {
    server.submitFaults = ["502", "502", "502"];
    const { result } = await mountMatch();
    act(() => result.current.answer("3", 3));
    await settle(8000);
    expect(server.received).toEqual([{ round: 1, answer: 3 }]);
    expect(result.current.phase).toBe("locked");
    expect(result.current.actionError).toBeNull();
  });

  it("a hung submit ends at the write deadline and is reconciled, not left on 'Submitting…'", async () => {
    server.submitFaults = ["hang"];
    const { result } = await mountMatch();
    act(() => result.current.answer("1", 1));
    await settle(REQUEST_TIMEOUT_MS.write - 100);
    expect(result.current.submitting).toBe(true);
    await settle(3000);
    expect(server.stored.get(1)).toBe(1);
    expect(result.current.submitting).toBe(false);
    expect(result.current.phase).toBe("locked");
  });

  it("a hung submit whose answer the SNAPSHOT already shows is released immediately (no deadline wait)", async () => {
    server.submitFaults = ["hang"];
    const { result } = await mountMatch();
    act(() => result.current.answer("1", 1));
    await settle(10);
    server.stored.set(1, 1);   // e.g. the response is stuck behind a proxy, the write landed
    await settle(2000);        // one poll + one watch tick
    expect(result.current.submitting).toBe(false);
    expect(result.current.phase).toBe("locked");
  });

  it("a definitive refusal still releases the grid (unchanged behaviour)", async () => {
    server.activeRound = 2;   // the client still believes round 1 is open
    const { result } = await mountMatch();
    server.activeRound = 2;
    act(() => result.current.answer("1", 1));
    await settle(10);
    expect(result.current.answerReconciling).toBe(false);
    expect(result.current.submitting).toBe(false);
  });

  it("the round closes while the outcome is unknown: the local pick is dropped, no error is invented", async () => {
    server.steadySubmit = "502";
    const { result } = await mountMatch();
    act(() => result.current.answer("1", 1));
    await settle(600);
    expect(result.current.answerReconciling).toBe(true);
    server.completedRounds = 1;
    server.activeRound = 2;
    await settle(5000);
    expect(result.current.answerReconciling).toBe(false);
    expect(result.current.answeredSelection).toBeNull();
    expect(result.current.actionError).toBeNull();
    expect(server.received).toHaveLength(0);
  });

  it("double click: one request, even when the first is slow", async () => {
    server.submitFaults = ["delay:1200"];
    const { result } = await mountMatch();
    act(() => { result.current.answer("1", 1); result.current.answer("2", 2); });
    await settle(50);
    act(() => result.current.answer("2", 2));
    await settle(2000);
    expect(server.received).toEqual([{ round: 1, answer: 1 }]);
  });
});

describe("GR1 ordinary questions — polling through an outage", () => {
  it("a hung snapshot read ends at the read deadline and surfaces 'reconnecting'", async () => {
    const { result } = await mountMatch();
    server.readFaults = ["hang"];
    await settle(1600);                       // the next poll starts and hangs
    expect(result.current.connectionInterrupted).toBe(false);
    await settle(REQUEST_TIMEOUT_MS.read);
    expect(result.current.connectionInterrupted).toBe(true);
    expect(result.current.phase).toBe("active");   // the question stays on screen
    await settle(4000);
    expect(result.current.connectionInterrupted).toBe(false);
  });

  it("outage backoff is capped at 3 s, so a ~10 s redeploy is noticed within ~3 s", async () => {
    await mountMatch();
    server.steadyRead = "502";
    await settle(10_000);
    const outageReads = server.publicReads.slice(-3);
    const gaps = outageReads.slice(1).map((t, i) => t - outageReads[i]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(INTERRUPTED_BACKOFF_CAP_MS + 50);
    server.steadyRead = "ok";
    const backAt = Date.now();
    await settle(INTERRUPTED_BACKOFF_CAP_MS + 100);
    expect(server.publicReads.some((t) => t >= backAt)).toBe(true);
  });

  it("an uncoded 404 (route skew / edge) is transient, not 'Match ended'", async () => {
    const { result } = await mountMatch();
    server.readFaults = ["404", "404"];
    await settle(9000);   // two failed reads, then a successful one (3 s backoff ceiling)
    expect(result.current.error).toBeNull();
    expect(result.current.phase).toBe("active");
    expect(result.current.connectionInterrupted).toBe(false);
  });

  it("a failed /resolved read at the round boundary is retried, so the reveal is not lost", async () => {
    const { result } = await mountMatch();
    server.completedRounds = 1;
    server.activeRound = 2;
    server.resolvedFaults = ["502"];
    await settle(1600);
    expect(result.current.lastResolved).toBeNull();
    await settle(1600);
    expect(result.current.lastResolved?.roundNumber).toBe(1);
  });

  it("mid-question deployment: 502 burst on every route, answer sent during it, delivered once, no different answer", async () => {
    const { result } = await mountMatch();
    server.steadyRead = "502";
    server.steadySubmit = "502";
    await settle(2000);
    act(() => result.current.answer("2", 2));
    await settle(6000);                      // still deploying
    expect(result.current.answerReconciling).toBe(true);
    act(() => result.current.answer("0", 0));  // impatient click on another option
    server.steadyRead = "ok";
    server.steadySubmit = "ok";
    await settle(4000);
    expect(server.received).toEqual([{ round: 1, answer: 2 }]);
    expect(result.current.phase).toBe("locked");
    expect(result.current.connectionInterrupted).toBe(false);
  });

  it("reload during an outage: a failed /resume is retried once the server is back", async () => {
    server.completedRounds = 2;
    server.activeRound = 3;
    server.resumeFaults = ["502"];
    const { result } = renderHook(() => useRankedMatch("m1", "userA"));
    await settle(50);
    // The failed resume recovered nothing, so the first snapshot showing
    // settled rounds runs it again (it used to be marked done regardless).
    expect(server.resumeCalls).toBe(2);
    await settle(3000);
    expect(server.resumeCalls).toBe(2);   // once recovered, never again
    expect(result.current.phase).toBe("active");
  });
});

// ─────────────────────────────────────────────────────────────── Stat Check
describe("GR1 Stat Check (Meta Reflex cards) — submission reconciliation", () => {
  beforeEach(() => { server.segment = true; });

  it("ambiguous success on a card: the same card is re-sent and confirmed by the server's index", async () => {
    server.submitFaults = ["drop"];
    const { result } = await mountMatch();
    let accepted: boolean | null = null;
    act(() => { void result.current.submitSegmentChallenge(0, { cardId: "c0:left" }).then((v) => { accepted = v; }); });
    await settle(10);
    expect(result.current.answerReconciling).toBe(true);
    expect(result.current.submitting).toBe(true);    // the module keeps both cards locked
    await settle(2500);
    expect(accepted).toBe(true);
    expect(server.cardStored.get(0)).toBe("c0:left");
    expect(server.cardSubmits.every((s) => s.index === 0 && s.cardId === "c0:left")).toBe(true);
    expect(result.current.actionError).toBeNull();
    expect(timingRecords().some((r) => r.name === "answer.reconcile" && r.detail?.surface === "segment"))
      .toBe(true);
  });

  it("502 on a card is reconciled, never painted as 'request failed (502)'", async () => {
    server.submitFaults = ["502", "502"];
    const { result } = await mountMatch();
    let accepted: boolean | null = null;
    act(() => { void result.current.submitSegmentChallenge(0, { cardId: "c0:right" }).then((v) => { accepted = v; }); });
    await settle(4000);
    expect(accepted).toBe(true);
    expect(server.cardSubmits).toEqual([{ index: 0, cardId: "c0:right" }]);
    expect(result.current.actionError).toBeNull();
  });

  it("a hung card submit does not lock the NEXT card: the server's index moving releases it", async () => {
    server.submitFaults = ["hang"];
    const { result } = await mountMatch();
    let accepted: boolean | null = null;
    act(() => { void result.current.submitSegmentChallenge(0, { cardId: "c0:left" }).then((v) => { accepted = v; }); });
    await settle(10);
    // The card's own window ends server-side; the server moves the viewer on.
    server.cardIndex = 1;
    await settle(2000);
    expect(accepted).toBe(true);
    expect(result.current.submitting).toBe(false);   // card 1 is playable now, not after 10 s
    act(() => { void result.current.submitSegmentChallenge(1, { cardId: "c1:left" }); });
    await settle(50);
    expect(server.cardStored.get(1)).toBe("c1:left");
  });

  it("double activation in one batch sends one card (ref guard)", async () => {
    const { result } = await mountMatch();
    act(() => {
      void result.current.submitSegmentChallenge(0, { cardId: "c0:left" });
      void result.current.submitSegmentChallenge(0, { cardId: "c0:right" });
    });
    await settle(50);
    expect(server.cardSubmits).toEqual([{ index: 0, cardId: "c0:left" }]);
  });

  it("a definitive refusal is released silently as before (a timing race)", async () => {
    const { result } = await mountMatch();
    let accepted: boolean | null = null;
    act(() => { void result.current.submitSegmentChallenge(3, { cardId: "c3:left" }).then((v) => { accepted = v; }); });
    await settle(50);
    expect(accepted).toBe(false);
    expect(result.current.answerReconciling).toBe(false);
    expect(result.current.actionError).toBeNull();
  });
});
