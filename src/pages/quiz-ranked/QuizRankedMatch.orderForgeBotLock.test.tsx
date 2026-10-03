/**
 * OF4-FIX2 — THE ORDER FORGE REVEAL IN A BOT PLAYTEST, FROM REAL BACKEND BODIES.
 *
 * The OF4-FIX1 real-host test hand-built a backend that, on the poll after the
 * lock, projects the round still open with the viewer's `own_challenge_reveals`.
 * A bot match never projects that state. The bot is driven inline on every
 * request: it has locked before the player does (or is driven right after the
 * player's submit, inside the same POST), so the lock POST itself settles the
 * segment and opens the next round. The backend's own wire-contract test has to
 * switch the inline bot off to capture `own_challenge_reveals` at all.
 *
 * The only copy of the viewer's reveal is the lock response's inline
 * `challenge_reveal`. Before FIX2 the client dropped it, the arena stayed frozen
 * on the pre-lock snapshot through the hold, and the cards stayed `locked`.
 *
 * This feeds the REAL `QuizRankedMatch` + `useRankedMatch` + `CanonicalArena` +
 * `orderForgeModule` + `OrderForge` the bodies the real backend served for a
 * wrong lock against the bot, in production request order (match
 * rkb_50f40a7c63c0222ee7eab3ea: POST challenge -> GET match -> GET resolved ->
 * GET private). Fixture: `orderForgeBotLockCapture.json`, from
 * League_Combat_Simulator origin/master d2d34b98.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { REVEAL_TIMING } from "@/components/interaction-grammar/OrderForge";
import capture from "@/lib/ranked-public/__fixtures__/orderForgeBotLockCapture.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;
const VIEWER = C.public_before_lock.payload.players[0].player_id as string;
const MID = C.public_before_lock.match_id as string;
const REVEAL = C.submit.challenge_reveal as {
  order: string[]; canonical_order: string[]; position_correct: boolean[];
  is_correct: boolean; entries: { entry_id: string; value_display: string }[];
};
const VALUES = Object.fromEntries(REVEAL.entries.map((e) => [e.entry_id, e.value_display]));
/** Server marks, per card (the mark of the slot the player locked it in). */
const MARKS = Object.fromEntries(REVEAL.order.map((id, p) => [id, REVEAL.position_correct[p] ? "right" : "wrong"]));
/** "was N" for every card the server's canonical order moves. */
const WAS = Object.fromEntries(REVEAL.order.flatMap((id, p) =>
  REVEAL.canonical_order.indexOf(id) === p ? [] : [[id, p + 1]]));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

interface Backend {
  /** What the lock POST does. */
  post: "accept" | "refuse" | "network";
  postDelayMs: number;
  /** Public GETs served after an accepted lock, in order (the last repeats). */
  afterLock: unknown[];
  locked: boolean;
  postResolvedAt: number | null;
  nextRoundServedAt: number | null;
}
let backend: Backend;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(C.public_before_lock.server_time));
  backend = { post: "accept", postDelayMs: 0, afterLock: [C.public_after_lock], locked: false,
    postResolvedAt: null, nextRoundServedAt: null };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume", match_id: MID,
        round_number: 1, server_time: C.public_before_lock.server_time,
        payload: { match_status: "active", match_over: false, public: C.public_before_lock,
          private: C.private_before, latest_resolved_round: null, result: null },
      });
    }
    if (/\/rounds\/1\/resolved$/.test(u)) return backend.locked ? json(C.resolved) : json({}, 404);
    if (u.endsWith("/private")) return json(backend.locked ? C.private_after : C.private_before);
    if (u.includes("/presence")) return json({ status: "active", match_id: MID, active: true });
    if (/\/segments\/1\/challenges\/0$/.test(u) && method === "POST") {
      if (backend.postDelayMs) await new Promise((r) => setTimeout(r, backend.postDelayMs));
      backend.postResolvedAt = Date.now();
      if (backend.post === "network") throw new TypeError("Failed to fetch");
      if (backend.post === "refuse") {
        return json({ detail: { code: "RANKED_INVALID_CHOICE", message: "order must list every entry id exactly once" } }, 422);
      }
      backend.locked = true;
      return json(C.submit);
    }
    if (u.endsWith(`/matches/${MID}`) && method === "GET") {
      if (!backend.locked) return json(C.public_before_lock);
      const body = backend.afterLock.length > 1 ? backend.afterLock.shift() : backend.afterLock[0];
      if ((body as any).payload.active_round?.round_number === 2 && backend.nextRoundServedAt === null) {
        backend.nextRoundServedAt = Date.now();
      }
      return json(body);
    }
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

interface Frame {
  t: number; hold: string | null; phase: string | null; step: string | null; order: string[];
  values: Record<string, string>; marks: Record<string, string>; notes: Record<string, string>;
  /** Any reveal-only text anywhere in the arena. */
  leaks: boolean;
}
function frame(t0: number): Frame {
  const list = document.querySelector('[data-testid="forge-reveal-list"]')
    ?? document.querySelector('[data-testid="forge-list-locked"]')
    ?? document.querySelector('[data-testid="forge-list"]');
  const rows = list ? [...list.children] as HTMLElement[] : [];
  const tokens = rows.map((r) => r.dataset.testid!.replace(/^forge-(reveal|locked|card)-/, ""));
  const values: Record<string, string> = {};
  const marks: Record<string, string> = {};
  const notes: Record<string, string> = {};
  rows.forEach((r, i) => {
    const v = r.querySelector('[data-testid$="-value"]');
    if (v) values[tokens[i]] = v.textContent ?? "";
    if (r.dataset.mark && r.dataset.mark !== "neutral") marks[tokens[i]] = r.dataset.mark;
    const from = r.querySelector('[data-testid$="-from"]');
    if (from) notes[tokens[i]] = from.textContent ?? "";
  });
  const text = document.body.textContent ?? "";
  return {
    t: Date.now() - t0,
    hold: document.querySelector('[data-testid="ranked-match"]')?.getAttribute("data-reveal-hold") ?? null,
    phase: document.querySelector('[data-testid="order-forge-phase"]')?.getAttribute("data-phase") ?? null,
    step: document.querySelector('[data-testid="forge-reveal"]')?.getAttribute("data-step") ?? null,
    order: tokens, values, marks, notes,
    leaks: Object.values(VALUES).some((v) => text.includes(v)),
  };
}

async function mountOpen(): Promise<void> {
  render(<QuizRankedMatch matchId={MID} viewerUserId={VIEWER} />);
  for (let i = 0; i < 30 && !document.querySelector('[data-testid="forge-lock"]'); i += 1) await advance(100);
  expect(screen.getByTestId("order-forge-phase")).toHaveAttribute("data-phase", "open");
}

async function lockAndWatch(ms: number, before: Frame[] = []): Promise<{ frames: Frame[]; t0: number }> {
  await mountOpen();
  // A few polls of the open segment: nothing reveal-only is on screen.
  for (let i = 0; i < 20; i += 1) { await advance(100); before.push(frame(Date.now())); }
  const t0 = Date.now();
  fireEvent.click(screen.getByTestId("forge-lock"));
  const frames: Frame[] = [];
  for (let t = 0; t < ms; t += 10) { await advance(10); frames.push(frame(t0)); }
  return { frames, t0 };
}

describe("OF4-FIX2 — Order Forge reveal against the bot, from real backend bodies", () => {
  it("the backend payload is right, and no POLLED snapshot of the segment carries the reveal", () => {
    expect(C.submit.segment_resolved).toBe(true);
    expect(REVEAL.is_correct).toBe(false);
    expect(REVEAL.canonical_order).not.toEqual(REVEAL.order);
    expect([...REVEAL.canonical_order].sort()).toEqual([...REVEAL.order].sort());
    expect(REVEAL.position_correct).toEqual(REVEAL.order.map((id, i) => id === REVEAL.canonical_order[i]));
    // The pre-lock poll already shows the bot locked; nothing answer-bearing.
    expect(C.public_before_lock.payload.segment_state.opponent_finished).toBe(true);
    for (const body of [C.public_before_lock, C.private_before]) {
      const blob = JSON.stringify(body);
      expect(blob).not.toContain("canonical_order");
      for (const v of Object.values(VALUES)) expect(blob).not.toContain(v);
    }
    // The first poll after the lock is the NEXT round, with no Order Forge reveal.
    expect(C.public_after_lock.payload.active_round.round_number).toBe(2);
    expect(C.public_after_lock.payload.segment_state.segment_number).toBe(2);
    expect(C.public_after_lock.payload.segment_state.own_challenge_reveals).toEqual([]);
    expect(C.resolved.payload.segment_reveal.canonical_order).toEqual(REVEAL.canonical_order);
  });

  it("teaches the reveal: submitted order with values and marks, then the canonical order, held through the hold", async () => {
    const before: Frame[] = [];
    const { frames, t0 } = await lockAndWatch(2500, before);

    // 1. Before the lock: no value, no mark, no reveal step anywhere.
    for (const f of before) {
      expect(f.leaks).toBe(false);
      expect(f.step).toBeNull();
      expect(f.marks).toEqual({});
    }

    // 3. The first reveal frame is the player's submitted order, with the
    //    server's values and marks.
    const first = frames.find((f) => f.step !== null);
    expect(first, `the reveal never reached the screen; frames: ${JSON.stringify(
      frames.filter((f, i) => i === 0 || f.phase !== frames[i - 1].phase || f.hold !== frames[i - 1].hold)
        .map(({ t, hold, phase, step, order }) => ({ t, hold, phase, step, order })))}`)
      .toBeTruthy();
    expect(first!.phase).toBe("revealed");
    expect(first!.step).toBe("mine");
    expect(first!.order).toEqual(REVEAL.order);
    expect(first!.values).toEqual(VALUES);
    expect(first!.marks).toEqual(MARKS);

    // 4. Then the server's canonical order, on the existing FIX1 beat.
    const assembled = frames.find((f) => f.step === "assembled")!;
    expect(assembled.order).toEqual(REVEAL.canonical_order);
    expect(assembled.t - first!.t).toBeGreaterThanOrEqual(REVEAL_TIMING.assembleAtMs - 10);
    expect(assembled.t - first!.t).toBeLessThanOrEqual(REVEAL_TIMING.assembleAtMs + 50);

    // 6 + 7. The settlement is discovered and the NEXT round is polled while the
    //    reveal is up; the frozen reveal survives both and stays canonical until
    //    the hold releases the surface.
    const holdOn = frames.find((f) => f.hold === "true")!;
    const holdOff = frames.find((f) => f.t > holdOn.t && f.hold === "false")!;
    expect(holdOn && holdOff).toBeTruthy();
    expect(backend.nextRoundServedAt).not.toBeNull();
    expect(backend.nextRoundServedAt! - t0).toBeLessThan(holdOff.t);
    const held = frames.filter((f) => f.t >= assembled.t && f.t < holdOff.t);
    expect(held.length).toBeGreaterThan(40);
    for (const f of held) {
      expect(f.order, `left the canonical order at ${f.t}ms`).toEqual(REVEAL.canonical_order);
      expect(f.values).toEqual(VALUES);
    }
    expect(holdOff.t - (assembled.t + REVEAL_TIMING.moveMs)).toBeGreaterThanOrEqual(400);

    // 5. "was N" on every card the canonical order moved, and on none other.
    const last = held[held.length - 1];
    expect(Object.keys(WAS).length).toBeGreaterThan(0);
    for (const [id, n] of Object.entries(WAS)) expect(last.notes[id]).toMatch(new RegExp(`was ${n}`, "i"));
    for (const id of REVEAL.order.filter((x) => !(x in WAS))) expect(last.notes[id]).toBeUndefined();
    expect(last.marks).toEqual(MARKS);

    // After the release the next segment replaces it; the stale reveal does not follow.
    const after = frames.filter((f) => f.t > holdOff.t + 50);
    expect(after.length).toBeGreaterThan(0);
    for (const f of after) { expect(f.step).toBeNull(); expect(f.values).toEqual({}); }
  });

  it("2. the reveal is installed only once the lock POST has been ACCEPTED", async () => {
    backend.postDelayMs = 400;
    const { frames } = await lockAndWatch(1200);
    const resolvedAt = backend.postResolvedAt!;
    const first = frames.find((f) => f.step !== null)!;
    expect(first).toBeTruthy();
    for (const f of frames.filter((x) => x.t < 400)) {
      expect(f.step).toBeNull();
      expect(f.leaks).toBe(false);
    }
    expect(resolvedAt).toBeGreaterThan(0);
    expect(first.t).toBeGreaterThanOrEqual(400);
  });

  it("a refused lock installs no reveal and reopens the input", async () => {
    backend.post = "refuse";
    const { frames } = await lockAndWatch(1500);
    for (const f of frames) { expect(f.step).toBeNull(); expect(f.leaks).toBe(false); expect(f.marks).toEqual({}); }
    expect(frames[frames.length - 1].phase).toBe("open");
  });

  it("a failed (network) lock installs no reveal", async () => {
    backend.post = "network";
    const { frames } = await lockAndWatch(1500);
    for (const f of frames) { expect(f.step).toBeNull(); expect(f.leaks).toBe(false); expect(f.marks).toEqual({}); }
  });

  it("a polled snapshot that already carries the same reveal is not doubled or contradicted", async () => {
    // The slower-opponent lifecycle: the first poll after the lock is still
    // segment 1, carrying the viewer's own reveal; the next is round 2.
    const own = clone(C.public_before_lock);
    const s = own.payload.segment_state;
    s.own_submitted_choices = [{ order: REVEAL.order }];
    s.own_next_challenge_index = 1;
    s.own_challenges_completed = 1;
    s.own_finished = true;
    s.own_challenge_reveals = [clone(REVEAL)];
    backend.afterLock = [own, C.public_after_lock];
    const { frames } = await lockAndWatch(2500);
    const revealed = frames.filter((f) => f.step !== null);
    expect(revealed.length).toBeGreaterThan(0);
    for (const f of revealed) {
      expect(f.order).toHaveLength(5);
      expect(new Set(f.order).size).toBe(5);
      expect(f.marks).toEqual(MARKS);
    }
    expect(revealed[0].order).toEqual(REVEAL.order);
    expect(frames.find((f) => f.step === "assembled")!.order).toEqual(REVEAL.canonical_order);
  });
});
