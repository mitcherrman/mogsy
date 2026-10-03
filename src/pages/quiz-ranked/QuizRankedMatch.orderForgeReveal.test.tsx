/**
 * OF4-FIX1 — THE ORDER FORGE TEACHING REVEAL, AGAINST THE REAL RANKED HOST.
 *
 * OF4 shipped a reveal that settles at 1200ms and was verified by the dev
 * probe (`?forge=live`), which serves its own reveal and holds it as long as the
 * test likes. Production does not: `useRankedMatch` holds a settled round for
 * `REVEAL_HOLD_MS` (1500) only when it learns of the settlement on time, and
 * `anchoredRevealHoldMs` may shorten it to `REVEAL_HOLD_MIN_MS` (900) so the
 * next module keeps its title window. The surface is then released and the next
 * module replaces it. A reveal that needs 1200ms is cut off at 900: the cards
 * never visibly assemble, or never rest on the correct order.
 *
 * So this runs the REAL `QuizRankedMatch` + `useRankedMatch` + `CanonicalArena`
 * + `orderForgeModule` + `OrderForge`, with only the network faked, on a fake
 * clock, and arranges the shortest legal lifecycle:
 *
 *   a regular poll is already in flight when the player locks in; the lock's
 *   own poke makes the loop re-run straight away (`rerunRef`); the first
 *   response carries the viewer's reveal (the surface adopts it), the re-run
 *   discovers the settlement one network round trip later. Reveal on screen and
 *   hold start are back to back, and the hold is the floor.
 *
 * Nothing here decides correctness: the order, the canonical order, the marks
 * and the values are all served by the (fake) server, exactly as on the wire.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { REVEAL_DWELL_MIN_MS, REVEAL_TIMING } from "@/components/interaction-grammar/OrderForge";
import { MODULE_TITLE_MS } from "@/lib/ranked-core/centralStage";
import { REVEAL_HOLD_MIN_MS, anchoredRevealHoldMs } from "@/lib/ranked-core/pacing";
import {
  orderForgeChallengeReveal, orderForgeSegmentMeta, orderForgeState,
  privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";
import capture from "@/lib/ranked-public/__fixtures__/orderForgeServerCapture.json";
import { REVEAL_HOLD_MS } from "./useRankedMatch";

/** The 5-card board of the acceptance case: locked A B C D E, server says E C A D B. */
const SUBMITTED = ["e0", "e1", "e2", "e3", "e4"];
const CANONICAL = ["e4", "e2", "e0", "e3", "e1"];
/** Server-supplied, per LOCKED slot: only the 4th card (D) was in the right place. */
const POSITION_CORRECT = [false, false, false, true, false];
const VALUES: Record<string, string> = {
  e0: "800 g", e1: "3600 g", e2: "350 g", e3: "2700 g", e4: "3250 g",
};
/** "was N": the slot the player gave each card that had to move. */
const WAS: Record<string, number> = { e0: 1, e1: 2, e2: 3, e4: 5 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A real captured Order Forge settlement, re-addressed to this harness's two players. */
const resolvedPayload = () => JSON.parse(JSON.stringify(capture.resolved_incorrect.payload)
  .replace(/0a11d111-0000-4000-8000-000000000001/g, "userA")
  .replace(/p_c6174516d7d17365/g, "userB"));

/** The shortest the re-run poll can take: the reveal is on screen this long before the hold starts. */
const ROUND_TRIP_MS = 80;

/** The server has long since opened the challenge: the input is live on the fake clock. */
const EARLY = "2026-07-18T11:59:00+00:00";
const OPEN = { challenge_started_at: EARLY };
const meta = (n = 2) => orderForgeSegmentMeta({ ...OPEN, segment_number: n });
const state = (over: Record<string, unknown> = {}, locked = false) =>
  orderForgeState({ ...OPEN, ...over }, locked);

const REVEAL_STATE = () => state({
  own_submitted_choices: [{ order: SUBMITTED }],
  own_challenge_reveals: [orderForgeChallengeReveal({
    is_correct: false, order: SUBMITTED, canonical_order: CANONICAL,
    position_correct: POSITION_CORRECT,
    entries: SUBMITTED.map((id) => ({ entry_id: id, label: id, value_display: VALUES[id] })),
  })],
}, true);

interface Backend {
  state: unknown; meta: unknown; resolved: unknown | null; activeRound: number;
  /** Hold the next public GET until released (a poll that is "in flight"). */
  gate: { on: boolean; held: boolean; release: (() => void) | null };
  /** Public GETs begun so far. */
  publicCalls: number;
  /** Run once, just before the public GET with this ordinal is built. */
  flipAt: { call: number; run: () => void } | null;
}
let backend: Backend;

function publicBody() {
  const body = publicRoundV2();
  const p = body.payload as Record<string, unknown>;
  p.segment = backend.meta;
  p.segment_state = backend.state;
  (p.active_round as Record<string, unknown>).round_number = backend.activeRound;
  (p.active_round as Record<string, unknown>).started_at = EARLY;
  return body;
}
function privateBody() {
  const body = privatePlayerV2("userA");
  const p = body.payload as Record<string, unknown>;
  p.segment = backend.meta;
  p.segment_state = backend.state;
  return body;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T12:00:30Z"));
  backend = {
    state: state(), meta: meta(), resolved: null, activeRound: 3,
    gate: { on: false, held: false, release: null }, publicCalls: 0, flipAt: null,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume", match_id: "m1",
        round_number: 3, server_time: "2026-07-18T12:00:30+00:00",
        payload: { match_status: "active", match_over: false, public: publicBody(),
          private: privateBody(), latest_resolved_round: null, result: null },
      });
    }
    if (/\/rounds\/\d+\/resolved$/.test(u)) {
      if (backend.resolved === null) return json({}, 404);
      return json({
        schema_version: "ranked_duel.resolved_round.v2", projection_type: "resolved_round",
        match_id: "m1", round_number: 3, server_time: "2026-07-18T12:00:30+00:00",
        payload: backend.resolved,
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (/\/matches\/m1$/.test(u) && method === "GET") {
      backend.publicCalls += 1;
      const call = backend.publicCalls;
            if (backend.gate.on && !backend.gate.held) {
        backend.gate.held = true;
        await new Promise<void>((go) => { backend.gate.release = go; });
      }
      if (backend.flipAt && call >= backend.flipAt.call) {
        const { run } = backend.flipAt; backend.flipAt = null;
        // The re-run poll still crosses the network: the reveal the previous poll
        // delivered is on screen for at least this long before the settlement is seen.
        await new Promise<void>((done) => setTimeout(done, ROUND_TRIP_MS));
        run();
      }
      return json(publicBody());
    }
    return json({}, 200);   // the lock POST: accepted
  }) as unknown as typeof fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.documentElement.classList.remove("reduce-motion");
});

const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

interface Frame {
  t: number; hold: string | null; phase: string | null; step: string | null;
  order: string[]; shown: number; values: Record<string, string>;
  marks: Record<string, string>; notes: Record<string, string>;
}
function frame(t0: number): Frame {
  const list = document.querySelector('[data-testid="forge-reveal-list"]');
  const rows = list ? [...list.children] as HTMLElement[] : [];
  const tokens = rows.map((r) => r.dataset.testid!.replace("forge-reveal-", ""));
  const marks: Record<string, string> = {};
  const notes: Record<string, string> = {};
  const values: Record<string, string> = {};
  rows.forEach((r, i) => {
    marks[tokens[i]] = r.dataset.mark ?? "";
    values[tokens[i]] = r.querySelector('[data-testid$="-value"]')?.textContent ?? "";
    const from = r.querySelector('[data-testid$="-from"]');
    if (from) notes[tokens[i]] = from.textContent ?? "";
  });
  return {
    t: Date.now() - t0,
    hold: document.querySelector('[data-testid="ranked-match"]')?.getAttribute("data-reveal-hold") ?? null,
    phase: document.querySelector('[data-testid="order-forge-phase"]')?.getAttribute("data-phase") ?? null,
    step: document.querySelector('[data-testid="forge-reveal"]')?.getAttribute("data-step") ?? null,
    order: tokens,
    shown: rows.filter((r) => r.querySelector('[data-testid$="-value"]')).length,
    values, marks, notes,
  };
}

/** Lock in, with a regular poll already in flight, and watch the reveal for `ms`. */
async function lockAndWatch(ms: number): Promise<Frame[]> {
  render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await advance(200);
  expect(screen.getByTestId("order-forge-phase")).toHaveAttribute("data-phase", "open");
  // A regular poll goes out and waits at the gate.
  backend.gate.on = true;
  for (let i = 0; i < 40 && !backend.gate.held; i += 1) await advance(100);
  expect(backend.gate.held, "a poll never went in flight").toBe(true);
  // The player locks in: the POST completes and its poke finds the loop busy, so
  // the loop is flagged to run again the moment this poll ends.
  fireEvent.click(screen.getByTestId("forge-lock"));
  await advance(20);
  // This poll's snapshot carries the viewer's reveal; the very next one finds the
  // round settled and the next segment open (the bot, or the opponent, has locked).
  backend.state = REVEAL_STATE();
  backend.flipAt = {
    call: backend.publicCalls + 1,   // the held poll is already counted; this is the one after it
    run: () => {
      backend.state = state({ segment_number: 3 });
      backend.meta = meta(3);
      backend.resolved = resolvedPayload();
      backend.activeRound = 4;
    },
  };
  backend.gate.on = false;
  const t0 = Date.now();
  const frames: Frame[] = [];
  await act(async () => { backend.gate.release?.(); await vi.advanceTimersByTimeAsync(0); });
  frames.push(frame(t0));
  for (let t = 0; t < ms; t += 10) { await advance(10); frames.push(frame(t0)); }
  return frames;
}

describe("OF4-FIX1 — the teaching reveal inside the REAL minimum Ranked reveal window", () => {
  it("is exercising the real shortest legal hold, not the nominal one", () => {
    // A settlement discovered late, next round already (nearly) answerable.
    expect(anchoredRevealHoldMs(REVEAL_HOLD_MS, -500, MODULE_TITLE_MS)).toBe(REVEAL_HOLD_MIN_MS);
    expect(REVEAL_HOLD_MIN_MS).toBeLessThan(REVEAL_HOLD_MS);
  });

  it("shows A B C D E with values and marks, MOVES to E C A D B, and rests there before the surface is released", async () => {
    const frames = await lockAndWatch(2400);
    const reveal = frames.find((f) => f.step !== null)!;
    const holdOn = frames.find((f) => f.hold === "true")!;
    const holdOff = frames.find((f) => f.t > holdOn.t && f.hold === "false")!;
    expect(reveal, "the reveal never reached the screen").toBeTruthy();
    expect(holdOn, "the settlement never started the reveal hold").toBeTruthy();
    expect(holdOff, "the reveal hold never ended").toBeTruthy();

    // The arrangement under test: the hold starts one network round trip after the
    // reveal arrived (the shortest possible gap), and the hold is the floor, not 1500.
    expect(holdOn.t - reveal.t, "reveal and hold are not back to back").toBeLessThanOrEqual(ROUND_TRIP_MS + 60);
    const window = holdOff.t - holdOn.t;
    expect(window).toBeGreaterThanOrEqual(REVEAL_HOLD_MIN_MS - 10);
    expect(window).toBeLessThan(REVEAL_HOLD_MS);

    // 1. The player's own submitted order, with the server's values and marks, first.
    expect(reveal.step).toBe("mine");
    expect(reveal.order).toEqual(SUBMITTED);
    expect(reveal.marks).toEqual({ e0: "wrong", e1: "wrong", e2: "wrong", e3: "right", e4: "wrong" });
    expect(reveal.values).toEqual(VALUES);   // the server's values, on screen with the first frame

    // 2. The cards then move into the server's canonical order, early enough ...
    const assembled = frames.find((f) => f.step === "assembled" && f.t >= reveal.t)!;
    expect(assembled.order).toEqual(CANONICAL);
    expect(assembled.t - reveal.t).toBeGreaterThanOrEqual(REVEAL_TIMING.assembleAtMs - 10);
    expect(assembled.t - reveal.t).toBeLessThanOrEqual(REVEAL_TIMING.assembleAtMs + 50);
    const landedAt = assembled.t + REVEAL_TIMING.moveMs;

    // 3. ... that the finished, correct order is on screen for a readable beat
    //    before the earliest legal release (and not one frame of it is the old order).
    const dwell = holdOff.t - landedAt;
    expect(dwell, `landed ${landedAt}ms, released ${holdOff.t}ms`).toBeGreaterThanOrEqual(REVEAL_DWELL_MIN_MS - 20);
    const held = frames.filter((f) => f.t >= assembled.t && f.t < holdOff.t);
    expect(held.length).toBeGreaterThan(10);
    for (const f of held) {
      expect(f.order, `left the canonical order at ${f.t}ms`).toEqual(CANONICAL);
      expect(f.shown).toBe(5);
    }

    // 4. Wrong cards keep "was N" for where the player put them; the right one has none.
    const last = held[held.length - 1];
    for (const [id, n] of Object.entries(WAS)) {
      expect(last.notes[id], `${id} lost its note`).toMatch(new RegExp(`was ${n}`, "i"));
    }
    expect(last.notes.e3).toBeUndefined();
    expect(last.marks).toEqual({ e4: "wrong", e2: "wrong", e0: "wrong", e3: "right", e1: "wrong" });
  });

  it("reduced motion: the canonical order, values, marks and notes are there from the first frame", async () => {
    document.documentElement.classList.add("reduce-motion");
    const frames = await lockAndWatch(1200);
    const reveal = frames.find((f) => f.step !== null)!;
    expect(reveal.step).toBe("assembled");
    expect(reveal.order).toEqual(CANONICAL);
    expect(reveal.shown).toBe(5);
    expect(reveal.values).toEqual(VALUES);
    expect(reveal.marks.e3).toBe("right");
    for (const [id, n] of Object.entries(WAS)) expect(reveal.notes[id]).toMatch(new RegExp(`was ${n}`, "i"));
    for (const f of frames.filter((x) => x.step !== null && x.hold !== "false")) expect(f.order).toEqual(CANONICAL);
  });

  it("a refresh or resume into an existing reveal shows the settled canonical order at once", async () => {
    backend.state = REVEAL_STATE();
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
    await advance(300);
    const f = frame(Date.now());
    expect(f.step).toBe("assembled");
    expect(f.order).toEqual(CANONICAL);
    expect(f.shown).toBe(5);
  });
});
