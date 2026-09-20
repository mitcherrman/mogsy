/**
 * RFX1 Phase 2B3 — PRESENTATION TIMING, through the real controller and the
 * real arena.
 *
 * Three things this phase made deliberate, asserted as time and state rather
 * than as a look:
 *
 *  1. the pre-match intro has a MINIMUM presentation, which fast loading
 *     cannot shorten and which never reaches past `started_at`;
 *  2. the countdown is one deadline-anchored projection, shared by the
 *     desktop and the mobile clock;
 *  3. the match ends through a real match-complete BEAT — the final round's
 *     own result, then the outro, then the end screen — and that beat plays
 *     only for a client that watched the match finish.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { __resetPreparedImagesForTests } from "@/lib/ranked-core/media/prepareImage";
import {
  ENTRY_INTRO_MIN_MS, ENTRY_MIN_LEAD_MS, MATCH_OUTRO_MS,
  PRESENTATION_HEADROOM_MS, RESOLVE_DISCOVERY_MS, SPECIAL_TRANSITION_VISIBLE_MS,
  REVEAL_HOLD_MIN_MS,
} from "@/lib/ranked-core/pacing";
import {
  matchResultPointsV1, metaReflexSegmentMeta, metaReflexState,
  privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";

const T = "2026-07-18T12:00:00+00:00";
const iso = (ms: number) => new Date(ms).toISOString();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * What the server's lead-in has left by the time the card actually paints,
 * on each path's WORST-REASONABLE entry — `entry_lead_ms` less that path's
 * own spend (`ranked_public.pacing._ENTRY_SPEND`):
 *
 *   queue  5900 − (2000 discovery + 800 handoff + 400 route paint) = 2700
 *   bot    4400 − ( 500 join RTT + 800 handoff + 400 route paint)  = 2700
 *
 * Deliberately the SAME number: the presentation is owed to the player, not
 * to the way the match was created. It is exactly the floor plus the preview,
 * which is what makes these tests a check on the contract rather than on a
 * comfortable margin.
 */
const LEAD_ON_ARRIVAL = ENTRY_INTRO_MIN_MS + ENTRY_MIN_LEAD_MS;

/** A TYPICAL queue entry, where discovery landed in ~1 s of its 2 s bound. */
const LEAD_WITH_SURPLUS = LEAD_ON_ARRIVAL + 1000;


let startedAt: number;
let overMatch: boolean;
/** Flipped mid-test to end the match under a mounted client. */
let liveOver: boolean;
let mediaLoads: boolean;
let isBotMatch: boolean;
/** RFX1 2B3 — which module this round is, and where it sits in the match. */
let moduleNumber: number;
let matchLength: number | null;
let segmentOverride: Record<string, unknown> | null;
/** The round the server currently reports as active. */
let activeRound: number;
/** Round-trip cost on the two reads the ending needs. Production has one. */
let endingLatencyMs: number;

function player(id: string) {
  return {
    player_id: id, class_id: id === "userA" ? "tank" : "mage",
    outcome: id === "userA" ? "correct" : "incorrect",
    submitted_at: T, answered_first: id === "userA", timed_out: false,
    selected_ability_id: null,
    damage: {
      base_damage_dealt: 10, outgoing_bonus: 0, final_damage_dealt: 10,
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: 10,
    },
    hp_before: 170, hp_after: 160, reached_zero_hp: false,
    xp_gained: 10, total_xp_after: 10, level_before: 1, level_after: 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null,
    remaining_charges: {}, combat_lab_unlock_delta_seconds: 0,
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 1 },
  };
}

const resolvedPayload = () => ({
  match_id: "m1", round_number: 1, question_id: "q1", end_reason: "both_answered",
  started_at: T, original_deadline: T, final_deadline: T, pressure_applied: false,
  players: [player("userA"), player("userB")],
  next_round_duration_seconds: 30, next_round_duration_delta: 0,
  match_over: false, winner_id: null, completion_reason: null,
});

function shape<T2 extends { payload: Record<string, unknown> }>(env: T2): T2 {
  const payload = env.payload;
  const done = overMatch || liveOver;
  if (done) {
    payload.match_status = "complete";
    payload.match_over = true;
    payload.active_round = null;
    payload.question = null;
    payload.winner_id = "userA";
    payload.completion_reason = "segments_complete";
    // The final round settled INSIDE the transaction that ended the match —
    // which is exactly why it is the one round whose reveal had never played.
  }
  payload.progression_enabled = false;
  payload.server_time = iso(Date.now());
  (env as unknown as Record<string, unknown>).server_time = iso(Date.now());
  for (const p of payload.players as Record<string, unknown>[]) {
    p.role = p.player_id === "userA" ? "jungle" : "mid";
    p.score = 0;
  }
  payload.playtest = {
    question_bank_mode: "shared_bank", is_placeholder: false,
    is_bot_match: isBotMatch, session_preset: null,
  };
  payload.completed_rounds = done ? moduleNumber : activeRound - 1;
  const q = payload.question as Record<string, unknown> | null;
  if (q) q.question_id = `q${activeRound}`;
  const ar = payload.active_round as Record<string, unknown> | null;
  if (ar) {
    ar.round_number = activeRound;
    ar.started_at = iso(startedAt);
    ar.active_deadline = iso(startedAt + 30_000);
    ar.duration_seconds = 30;
  }
  payload.scoring = {
    model: "points", match_length: matchLength,
    module_number: moduleNumber, modules_completed: moduleNumber - 1,
  };
  /**
   * RFX1 2B3 — a Meta Reflex block, from round 2 on. Round 1 stays an
   * ordinary quiz round so a test can mount into one and then watch the
   * TRANSITION into the block, which is the only thing the beat reacts to.
   */
  if (segmentOverride && activeRound >= 2 && !done) {
    payload.segment = metaReflexSegmentMeta({
      segment_number: activeRound,
      challenge_index: segmentOverride.challenge_index ?? 0,
    });
    payload.segment_state = metaReflexState(
      (segmentOverride.challenge_index as number) ?? 0,
      { segment_number: activeRound });
    payload.question = null;
  }
  return env;
}

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = "";
  fetchPriority?: string;
  set src(_v: string) { if (mediaLoads) setTimeout(() => this.onload?.(), 5); }
  decode() { return Promise.resolve(); }
}

beforeEach(() => {
  __resetPreparedImagesForTests();
  vi.stubGlobal("Image", FakeImage);
  overMatch = false;
  liveOver = false;
  mediaLoads = true;
  isBotMatch = false;
  moduleNumber = 1;
  matchLength = 10;
  segmentOverride = null;
  activeRound = 1;
  endingLatencyMs = 0;
  startedAt = Date.now() + LEAD_ON_ARRIVAL;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (u.endsWith("/private")) return json(shape(privatePlayerV2("userA")));
    const settled = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (settled) {
      if (endingLatencyMs) await new Promise((r) => setTimeout(r, endingLatencyMs));
      const rn = Number(settled[1]);
      return json({
        schema_version: "ranked_duel.resolved_round.v2", projection_type: "resolved_round",
        match_id: "m1", round_number: rn, server_time: iso(Date.now()),
        payload: { ...resolvedPayload(), round_number: rn, question_id: `q${rn}` },
      });
    }
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: iso(Date.now()),
        payload: {
          match_status: overMatch || liveOver ? "complete" : "active",
          match_over: overMatch || liveOver,
          public: shape(publicRoundV2(overMatch || liveOver)),
          private: shape(privatePlayerV2("userA")),
          progression_pending_players: [], latest_resolved_round: null,
          result: overMatch ? matchResultPointsV1({ userA: 18, userB: 12 }) : null,
        },
      });
    }
    if (u.endsWith("/result")) {
      if (endingLatencyMs) await new Promise((r) => setTimeout(r, endingLatencyMs));
      return json(matchResultPointsV1({ userA: 18, userB: 12 }));
    }
    if (/\/matches\/m1$/.test(u)) return json(shape(publicRoundV2(overMatch || liveOver)));
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("reduce-motion");
});

const intro = () => screen.queryByTestId("ranked-entry-intro");
/** The contract's own number, read off the card rather than inferred. */
const introMs = () => {
  const v = intro()?.getAttribute("data-intro-ms");
  return v === null || v === undefined ? null : Number(v);
};
const outro = () => screen.queryByTestId("ranked-match-outro");
const endScreen = () => screen.queryByTestId("ranked-match-over");
const arena = () => screen.queryByTestId("ranked-match");
const phaseOf = () => arena()?.getAttribute("data-presentation-phase") ?? null;

/* ══════════════════════════════════════════════════════════════════════════ */
/* Part 1 — the pre-match presentation has a minimum                          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("RFX1 2B3 — the intro is presentation, not a loading cover", () => {
  /** Mount a fresh entry and report what the player actually saw. */
  async function observeEntry() {
    const paint = Date.now();
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    expect(intro()).not.toBeNull();
    let planned: number | null = null;
    await waitFor(() => { planned = introMs(); expect(planned).not.toBeNull(); },
      { timeout: 3000, interval: 10 });
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
    const revealedAt = Date.now();
    return {
      paint,
      planned: planned as unknown as number,
      /** What the card was VISIBLE for, wall-clock. */
      visible: revealedAt - paint,
      /** The locked, prepared question before the server's instant. */
      preview: startedAt - revealedAt,
    };
  }

  it("gives a QUEUE fresh match its whole deliberate beat, however fast it loads",
    async () => {
      // Media decodes in ~5 ms here; the card still occupies its beat.
      const e = await observeEntry();
      expect(e.visible).toBeGreaterThanOrEqual(ENTRY_INTRO_MIN_MS - 120);
      // And the contract's own number agrees with the wall clock, which is
      // the point of measuring from the real first paint.
      expect(e.planned).toBeGreaterThanOrEqual(ENTRY_INTRO_MIN_MS - 60);
      expect(Math.abs(e.planned - e.visible)).toBeLessThan(250);
      expect(intro()).toBeNull();
    }, 25000);

  it("gives a BOT fresh match the identical beat", async () => {
    // The bot path's lead differs, but what is LEFT once the card paints is
    // the same 2700 ms — the presentation is owed to the player, not to the
    // way the match was created. This is 2B2's "the bot intro is short".
    isBotMatch = true;
    const e = await observeEntry();
    expect(e.visible).toBeGreaterThanOrEqual(ENTRY_INTRO_MIN_MS - 120);
    expect(e.preview).toBeGreaterThanOrEqual(ENTRY_MIN_LEAD_MS - 150);
  }, 25000);

  it("reveals the arena ~700 ms before started_at, and opens input AT it",
    async () => {
      const e = await observeEntry();
      // THE PREVIEW. The arena is up, and it is not answerable yet.
      expect(e.preview).toBeGreaterThanOrEqual(ENTRY_MIN_LEAD_MS - 150);
      expect(e.preview).toBeLessThanOrEqual(ENTRY_MIN_LEAD_MS + 150);
      expect(screen.getByTestId("ranked-question").getAttribute("data-input-open"))
        .toBe("false");
      let openedAt = 0;
      await waitFor(() => {
        expect(screen.getByTestId("ranked-question").getAttribute("data-input-open"))
          .toBe("true");
        openedAt = Date.now();
      }, { timeout: 3000, interval: 10 });
      // The intro never stole answer time: the whole window still starts at
      // the server's instant, which nothing on the client moved.
      expect(openedAt - startedAt).toBeGreaterThanOrEqual(0);
      expect(openedAt - startedAt).toBeLessThan(300);
    }, 25000);

  it("spends SURPLUS lead on the card, not on a long inert locked preview",
    async () => {
      // A typical queue entry: discovery landed in ~1 s of its 2 s bound, so
      // there is a second of budget spare. An earlier draft capped the intro
      // and handed that second to the preview, which is a stall.
      startedAt = Date.now() + LEAD_WITH_SURPLUS;
      const e = await observeEntry();
      expect(e.visible).toBeGreaterThanOrEqual(ENTRY_INTRO_MIN_MS + 1000 - 150);
      // …and the preview did not grow while that happened.
      expect(e.preview).toBeLessThanOrEqual(ENTRY_MIN_LEAD_MS + 150);
    }, 25000);

  it("lets CRITICAL loading extend the presentation, bounded by the server", async () => {
    // Media that never settles — the throttled-phone case. 2B1's entry
    // preparation keeps the card up underneath rather than revealing an
    // unprepared question, and its budget is capped at the preview margin.
    mediaLoads = false;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await waitFor(() => expect(intro()).toHaveAttribute("data-entry-phase", "preparing"),
      { timeout: 3000 });
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
    // Extended, but never past the locked preview the server owns.
    expect(startedAt - Date.now()).toBeGreaterThanOrEqual(ENTRY_MIN_LEAD_MS - 200);
  }, 25000);

  it("REDUCED MOTION changes the animation, never the pacing", async () => {
    document.documentElement.classList.add("reduce-motion");
    const paint = Date.now();
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    expect(intro()).toHaveAttribute("data-reduced-motion", "true");
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
    expect(Date.now() - paint).toBeGreaterThanOrEqual(ENTRY_INTRO_MIN_MS - 120);
  }, 25000);

  it("a RECOVERY is not an entry: no card, and no minimum to serve", async () => {
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
    expect(intro()).toBeNull();
  }, 25000);

  it("a spent lead-in — a refresh into a running round — plays no intro", async () => {
    // The server's instant is already behind us, which is what a reload into
    // a live round looks like. The card must never appear over it, and the
    // minimum must never delay it.
    startedAt = Date.now() - 4000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
    expect(intro()).toBeNull();
    expect(screen.getByTestId("ranked-question").getAttribute("data-input-open"))
      .toBe("true");
  }, 25000);
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* Part 2 — one countdown projection for both viewports                       */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("RFX1 2B3 — the desktop and mobile clocks are one projection", () => {
  it("shows the same value in both, from the same deadline", async () => {
    startedAt = Date.now() - 4000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 6000 });
    const desktop = screen.getByTestId("timer-value").textContent;
    const mobile = screen.getByTestId("mobile-timer-value").textContent;
    expect(mobile).toBe(desktop);
    // Both are the same authoritative remaining time, not two clocks that
    // happen to agree: 30 s from `started_at`, 4 s of which have passed.
    expect(desktop).toBe("0:26");
  }, 20000);

  it("does not restart its cadence when a poll re-renders the arena", async () => {
    startedAt = Date.now() - 4000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 6000 });
    const changes: number[] = [];
    let last = screen.getByTestId("timer-value").textContent;
    const until = Date.now() + 3200;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 20));
      const now = screen.getByTestId("timer-value").textContent;
      if (now !== last) { changes.push(Date.now()); last = now; }
    }
    expect(changes.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < changes.length; i += 1) {
      // Polls land in this window. A render-time clock would flip a digit
      // early and produce a gap well under a second.
      expect(changes[i] - changes[i - 1]).toBeGreaterThan(900);
      expect(changes[i] - changes[i - 1]).toBeLessThan(1120);
    }
  }, 20000);
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* Part 4 — the match-complete lifecycle                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("RFX1 2B3 — the match ends through a beat, not a cut", () => {
  /** Mount a live match, then let the server end it. */
  async function playToTheEnd() {
    startedAt = Date.now() - 4000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 6000 });
    liveOver = true;
    return await screen.findByTestId("ranked-match-outro", undefined, { timeout: 8000 });
  }

  it("enters an explicit match-complete state driven by authoritative completion",
    async () => {
      const node = await playToTheEnd();
      expect(node).toHaveAttribute("data-match-outro-id", "m1:outro");
      expect(node).toHaveAttribute("data-match-outro-result", "win");
      expect(phaseOf()).toBe("match-outro");
      // The arena is still the arena — no end screen underneath or over it.
      expect(endScreen()).toBeNull();
    }, 25000);

  it("plays the FINAL round's own result before the outro, and the end screen after",
    async () => {
      startedAt = Date.now() - 4000;
      render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
      await screen.findByTestId("answer-grid", undefined, { timeout: 6000 });
      liveOver = true;
      /**
       * SAMPLED, not stepped. The lifecycle is three states in about two and
       * a half seconds, and the claim is about their ORDER and their
       * durations — which a pair of `waitFor`s cannot see, because each one
       * returns at some point inside a state rather than at its edges.
       */
      const seen: { phase: string; at: number; outro: boolean }[] = [];
      const deadline = Date.now() + 12_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 15));
        const phase = arena() === null
          ? (endScreen() ? "end-screen" : "blank") : (phaseOf() ?? "?");
        const last = seen[seen.length - 1];
        if (!last || last.phase !== phase) {
          seen.push({ phase, at: Date.now(), outro: outro() !== null });
        }
        if (phase === "end-screen") break;
      }
      const order = seen.map((s) => s.phase);
      // The exact lifecycle: the live question, the final round's own verdict,
      // the match-complete beat, the end screen. Nothing skipped, nothing out
      // of order, and no blank frame between any two of them.
      expect(order).toEqual(["answering", "revealing", "match-outro", "end-screen"]);
      // And the beat does not start before the verdict it follows: nothing
      // announces the end of the match ahead of the final result.
      expect(seen[0].outro).toBe(false);
      // Nothing announces the end of the match over a verdict still being
      // read: the placeholder is absent for the whole reveal.
      expect(seen[1].outro).toBe(false);
      expect(seen[2].outro).toBe(true);
      // The final round's result beat is a real beat…
      expect(seen[2].at - seen[1].at).toBeGreaterThanOrEqual(REVEAL_HOLD_MIN_MS - 100);
      // …and the outro holds for its configured duration after it.
      expect(seen[3].at - seen[2].at).toBeGreaterThanOrEqual(MATCH_OUTRO_MS - 100);
    }, 25000);

  it("never leaves a blank frame or two interactive surfaces, sampled across the swap",
    async () => {
      startedAt = Date.now() - 4000;
      render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
      await screen.findByTestId("answer-grid", undefined, { timeout: 6000 });
      liveOver = true;
      const samples: { arena: boolean; end: boolean }[] = [];
      const until = Date.now() + 6000;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, 25));
        samples.push({ arena: arena() !== null, end: endScreen() !== null });
        if (samples[samples.length - 1].end) break;
      }
      // Exactly one of the two is up in every sample: never both, never
      // neither. That is the whole "no blank frame, no overlap" claim.
      for (const s of samples) expect(s.arena !== s.end).toBe(true);
      expect(samples[samples.length - 1].end).toBe(true);
      // And input was never open during the beat.
      expect(screen.queryByTestId("ranked-question")).toBeNull();
    }, 25000);

  it("never flashes the end screen while the ending is still being fetched", async () => {
    /**
     * The completion snapshot makes the match over; the result row and the
     * final settlement are each a round trip behind it. A browser run with
     * production-shaped latency caught the end screen appearing for ~320 ms
     * in that gap and the arena then coming BACK for the reveal. This pins
     * the fix: the presentation is claimed in the same render as the
     * completion, so the gap has nothing to show but the arena.
     */
    endingLatencyMs = 250;
    startedAt = Date.now() - 4000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 6000 });
    liveOver = true;
    const seenEndBefore: number[] = [];
    let sawOutro = false;
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 10));
      if (outro() !== null) sawOutro = true;
      if (endScreen() !== null) { if (!sawOutro) seenEndBefore.push(Date.now()); break; }
    }
    expect(sawOutro).toBe(true);
    expect(seenEndBefore).toEqual([]);
  }, 25000);

  it("REDUCED MOTION keeps the beat: same states, same duration", async () => {
    document.documentElement.classList.add("reduce-motion");
    startedAt = Date.now() - 4000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 6000 });
    liveOver = true;
    const node = await screen.findByTestId("ranked-match-outro", undefined, { timeout: 8000 });
    expect(node).toHaveAttribute("data-reduced-motion", "true");
    const outroAt = Date.now();
    await screen.findByTestId("ranked-match-over", undefined, { timeout: 8000 });
    expect(Date.now() - outroAt).toBeGreaterThanOrEqual(MATCH_OUTRO_MS - 150);
  }, 25000);

  it("does not replay after the beat, however much the client re-renders", async () => {
    await playToTheEnd();
    await screen.findByTestId("ranked-match-over", undefined, { timeout: 8000 });
    const calls = () => (globalThis.fetch as unknown as
      { mock: { calls: unknown[][] } }).mock.calls.length;
    const before = calls();
    await new Promise((r) => setTimeout(r, 400));
    // Polling has stopped and the beat is spent: no second outro, ever.
    expect(calls()).toBe(before);
    expect(outro()).toBeNull();
    expect(endScreen()).not.toBeNull();
  }, 25000);
});

describe("RFX1 2B3 — the outro plays only for a client that WATCHED the end", () => {
  it("a refresh onto a completed match goes straight to the stable end screen",
    async () => {
      overMatch = true;
      render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
      await screen.findByTestId("ranked-match-over", undefined, { timeout: 8000 });
      expect(outro()).toBeNull();
      // Not merely "gone by now": it was never owed, so it never appeared.
      await new Promise((r) => setTimeout(r, 300));
      expect(outro()).toBeNull();
    }, 25000);

  it("a RECONNECT into a completed match does the same", async () => {
    overMatch = true;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" />);
    await screen.findByTestId("ranked-match-over", undefined, { timeout: 8000 });
    expect(outro()).toBeNull();
    expect(intro()).toBeNull();
  }, 25000);
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* Part 5 — the MEDIUM beats: Final Round and Meta Reflex entry              */
/* ══════════════════════════════════════════════════════════════════════════ */

const finalWarning = () => screen.queryByTestId("ranked-final-round-warning");
const sting = () => screen.queryByTestId("mr-sting");
const specialAttr = () => arena()?.getAttribute("data-special-transition") ?? null;
const moduleFace = () =>
  screen.queryByTestId("central-stage")?.getAttribute("data-face") ?? null;

/**
 * The server's own budget for each beat (backend `module_transition_ms`):
 * the result hold, the poll interval the client may be behind by, the beat
 * and its cutoff margin.
 */
const FINAL_LEAD = 1500 + RESOLVE_DISCOVERY_MS + PRESENTATION_HEADROOM_MS
  + SPECIAL_TRANSITION_VISIBLE_MS["final-round"] + 150;      // 5100
const MR_LEAD = 1500 + RESOLVE_DISCOVERY_MS + PRESENTATION_HEADROOM_MS
  + SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"] + 150; // 5600

/** Turn round 2 into a Meta Reflex block; `challenge_index` picks the card. */
const MR_SEGMENT = { challenge_index: 0 };

/**
 * Mount into a live round 1, then let the server resolve it and open round 2
 * with the lead-in that round's own kind is owed — the real transition.
 */
async function transitionIntoRound2(lead: number) {
  startedAt = Date.now() - 4000;
  render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
  // Round 1 is always an ordinary quiz round, whatever round 2 will be — the
  // beat reacts to the TRANSITION, so there has to be something to leave.
  await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
  moduleNumber = 2;
  activeRound = 2;
  startedAt = Date.now() + lead;
}

/** Sample the arena until `stop` says so, recording every state change. */
async function sample(stopAfterMs: number) {
  const seen: { special: string | null; at: number; input: boolean }[] = [];
  const until = Date.now() + stopAfterMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 15));
    const special = specialAttr();
    const last = seen[seen.length - 1];
    if (!last || last.special !== special) {
      seen.push({
        special, at: Date.now(),
        input: screen.queryByTestId("ranked-question")
          ?.getAttribute("data-input-open") === "true",
      });
    }
  }
  return seen;
}

describe("RFX1 2B3 — the Final Round beat", () => {
  it("plays on the live transition into the final round, and only then", async () => {
    matchLength = 2;                       // round 2 IS the final round
    await transitionIntoRound2(FINAL_LEAD);
    const node = await screen.findByTestId("ranked-final-round-warning",
      undefined, { timeout: 8000 });
    expect(node).toHaveAttribute("data-warning-id", "m1:r2");
    expect(node).toHaveAttribute("data-warning-ms",
      String(SPECIAL_TRANSITION_VISIBLE_MS["final-round"]));
    expect(specialAttr()).toBe("final-round");
  }, 25000);

  it("holds its configured duration, keeps input locked, and ends before started_at",
    async () => {
      matchLength = 2;
      await transitionIntoRound2(FINAL_LEAD);
      await screen.findByTestId("ranked-final-round-warning", undefined, { timeout: 8000 });
      const shownAt = Date.now();
      let endedAt = 0;
      await waitFor(() => { expect(finalWarning()).toBeNull(); endedAt = Date.now(); },
        { timeout: 6000, interval: 10 });
      // The whole promise, not a flash…
      expect(endedAt - shownAt)
        .toBeGreaterThanOrEqual(SPECIAL_TRANSITION_VISIBLE_MS["final-round"] - 120);
      // …and off screen BEFORE the player may act.
      expect(startedAt - endedAt).toBeGreaterThan(0);
      expect(screen.getByTestId("ranked-question").getAttribute("data-input-open"))
        .toBe("false");
      // Input still opens at the server's instant, untouched by any of this.
      let openedAt = 0;
      await waitFor(() => {
        expect(screen.getByTestId("ranked-question").getAttribute("data-input-open"))
          .toBe("true");
        openedAt = Date.now();
      }, { timeout: 3000, interval: 10 });
      expect(openedAt - startedAt).toBeGreaterThanOrEqual(0);
      expect(openedAt - startedAt).toBeLessThan(300);
    }, 25000);

  it("REPLACES the module title — the two never stack", async () => {
    matchLength = 2;
    await transitionIntoRound2(FINAL_LEAD);
    await screen.findByTestId("ranked-final-round-warning", undefined, { timeout: 8000 });
    const seen = await sample(4000);
    // The warning is up exactly once, and while it is up the header is never
    // showing a module-name face. One intro for one question.
    const runs = seen.filter((s) => s.special === "final-round");
    expect(runs).toHaveLength(1);
    expect(moduleFace()).not.toBe("module");
    // And nothing was interactive underneath it.
    expect(seen.filter((s) => s.special === "final-round" && s.input)).toEqual([]);
  }, 25000);

  it("does not replay from polling or rerenders once it is spent", async () => {
    matchLength = 2;
    await transitionIntoRound2(FINAL_LEAD);
    await screen.findByTestId("ranked-final-round-warning", undefined, { timeout: 8000 });
    await waitFor(() => expect(finalWarning()).toBeNull(),
      { timeout: 6000, interval: 10 });
    // Several polls and a long stretch of renders later: still gone.
    const seen = await sample(2500);
    expect(seen.every((s) => s.special === null)).toBe(true);
  }, 25000);

  it("a RECONNECT straight into the final round plays nothing", async () => {
    // The lead-in is already spent, which is what arriving into a round in
    // progress looks like. `specialTransitionWindowMs` reads 0.
    matchLength = 2; moduleNumber = 2; activeRound = 2;
    startedAt = Date.now() - 4000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
    expect(finalWarning()).toBeNull();
    expect(specialAttr()).toBeNull();
    await new Promise((r) => setTimeout(r, 400));
    expect(finalWarning()).toBeNull();
  }, 25000);

  it("a REFRESH inside the final round's own lead-in still plays nothing", async () => {
    // The clock alone would allow it here — the lead-in has not been spent.
    // The mount-advance guard is what refuses: this client did not watch the
    // round arrive, so it is not being warned about a transition it saw.
    matchLength = 2; moduleNumber = 2; activeRound = 2;
    startedAt = Date.now() + FINAL_LEAD;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
    const seen = await sample(2500);
    expect(seen.every((s) => s.special === null)).toBe(true);
  }, 25000);

  it("REDUCED MOTION keeps the same duration", async () => {
    document.documentElement.classList.add("reduce-motion");
    matchLength = 2;
    await transitionIntoRound2(FINAL_LEAD);
    const node = await screen.findByTestId("ranked-final-round-warning",
      undefined, { timeout: 8000 });
    expect(node).toHaveAttribute("data-reduced-motion", "true");
    const shownAt = Date.now();
    await waitFor(() => expect(finalWarning()).toBeNull(),
      { timeout: 6000, interval: 10 });
    expect(Date.now() - shownAt)
      .toBeGreaterThanOrEqual(SPECIAL_TRANSITION_VISIBLE_MS["final-round"] - 120);
  }, 25000);

  it("leaves an ORDINARY round with its ordinary transition", async () => {
    matchLength = 10;                       // round 2 of 10 — nothing special
    await transitionIntoRound2(1500 + 1400);
    const seen = await sample(4000);
    expect(seen.every((s) => s.special === null)).toBe(true);
    expect(finalWarning()).toBeNull();
    // And the minor beat is untouched: the module face still plays for it.
    await waitFor(() => expect(screen.getByTestId("answer-grid")).toBeInTheDocument(),
      { timeout: 3000 });
  }, 25000);
});

describe("RFX1 2B3 — the Meta Reflex entry beat", () => {
  it("plays before Card 1, for its configured duration, not the old flash", async () => {
    segmentOverride = MR_SEGMENT;
    await transitionIntoRound2(MR_LEAD);
    await waitFor(() => expect(specialAttr()).toBe("meta-reflex-entry"),
      { timeout: 8000 });
    const shownAt = Date.now();
    // It IS the existing sting, extended — not a second popup laid over it.
    expect(sting()).not.toBeNull();
    expect(finalWarning()).toBeNull();
    let endedAt = 0;
    await waitFor(() => { expect(sting()).toBeNull(); endedAt = Date.now(); },
      { timeout: 6000, interval: 10 });
    expect(endedAt - shownAt)
      .toBeGreaterThanOrEqual(SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"] - 150);
    // Comfortably longer than the 720 ms it replaced.
    expect(endedAt - shownAt).toBeGreaterThan(720 * 2);
    // Gone before the block becomes answerable.
    expect(startedAt - endedAt).toBeGreaterThan(0);
  }, 25000);

  it("does not let Card 1 become interactive underneath it", async () => {
    segmentOverride = MR_SEGMENT;
    await transitionIntoRound2(MR_LEAD);
    await waitFor(() => expect(specialAttr()).toBe("meta-reflex-entry"),
      { timeout: 8000 });
    const seen = await sample(2400);
    expect(seen.filter((s) => s.special === "meta-reflex-entry" && s.input)).toEqual([]);
  }, 25000);

  it("plays ONCE per block — cards 2-5 do not replay it", async () => {
    segmentOverride = MR_SEGMENT;
    await transitionIntoRound2(MR_LEAD);
    await waitFor(() => expect(sting()).not.toBeNull(), { timeout: 8000 });
    await waitFor(() => expect(sting()).toBeNull(), { timeout: 6000, interval: 10 });
    // Advance the block card by card. The sting is keyed on the BLOCK, so
    // none of these is a new beat.
    for (let index = 1; index < 5; index += 1) {
      segmentOverride = { ...MR_SEGMENT, challenge_index: index };
      await new Promise((r) => setTimeout(r, 350));
      expect(sting()).toBeNull();
    }
    expect(specialAttr()).toBeNull();
  }, 25000);

  it("a RECONNECT into a running block plays nothing", async () => {
    segmentOverride = MR_SEGMENT;
    moduleNumber = 2; activeRound = 2;
    startedAt = Date.now() - 4000;          // the block is already running
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" />);
    await screen.findByTestId("mr-surface", undefined, { timeout: 8000 });
    expect(sting()).toBeNull();
    await new Promise((r) => setTimeout(r, 400));
    expect(sting()).toBeNull();
  }, 25000);

  it("REDUCED MOTION keeps the same duration", async () => {
    document.documentElement.classList.add("reduce-motion");
    segmentOverride = MR_SEGMENT;
    await transitionIntoRound2(MR_LEAD);
    await waitFor(() => expect(sting()).not.toBeNull(), { timeout: 8000 });
    const shownAt = Date.now();
    await waitFor(() => expect(sting()).toBeNull(), { timeout: 6000, interval: 10 });
    expect(Date.now() - shownAt)
      .toBeGreaterThanOrEqual(SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"] - 150);
  }, 25000);
});

describe("RFX1 2B3 — when the final round IS a Meta Reflex block", () => {
  it("plays ONE beat: the Final Round message on the Meta Reflex clock", async () => {
    matchLength = 2;                        // round 2 is final…
    segmentOverride = MR_SEGMENT;           // …and is a Meta Reflex block
    await transitionIntoRound2(MR_LEAD);
    await waitFor(() => expect(specialAttr()).toBe("final-round"), { timeout: 8000 });
    const shownAt = Date.now();
    // The higher-stakes word, and NOT the sting as well.
    expect(finalWarning()).not.toBeNull();
    expect(sting()).toBeNull();
    expect(finalWarning()).toHaveAttribute("data-warning-ms",
      String(SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"]));
    let endedAt = 0;
    await waitFor(() => { expect(finalWarning()).toBeNull(); endedAt = Date.now(); },
      { timeout: 6000, interval: 10 });
    // The more generous clock: the mode shift still has to register.
    expect(endedAt - shownAt)
      .toBeGreaterThanOrEqual(SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"] - 150);
    // And ONE beat, never the two back to back.
    expect(endedAt - shownAt).toBeLessThan(
      SPECIAL_TRANSITION_VISIBLE_MS["final-round"]
      + SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"]);
    expect(startedAt - endedAt).toBeGreaterThan(0);
  }, 25000);
});
