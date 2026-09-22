/**
 * DCMOD-E — A HOSTED MATCH, through the real controller and the real arena.
 *
 * The same canonical match, run as one step of a parent flow. What changes is
 * ONLY what surrounds it: no duel intro card, no Victory/Defeat outro, no end
 * screen, no Ranked rules scroll — the match is handed back to its host at the
 * instant the outro would have begun, after the final round's own reveal.
 * Harness copied from `QuizRankedMatch.rfx1b3.test.tsx`, the suite whose beats
 * these assertions are the hosted complement of.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import type { HostedMatchSettlement, MatchHost } from "@/lib/ranked-core/flow/matchHost";
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
          latest_resolved_round: null,
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

const hostOf = (overrides: Partial<MatchHost> = {}): MatchHost & {
  settled: HostedMatchSettlement[]; phases: string[];
} => {
  const settled: HostedMatchSettlement[] = [];
  const phases: string[] = [];
  return {
    eyebrow: "Daily Challenge",
    settlingMessage: "Stage complete…",
    onMatchSettled: (s) => { settled.push(s); },
    onPresentationPhase: (p) => { phases.push(p); },
    settled, phases,
    ...overrides,
  };
};

describe("DCMOD-E — a hosted match keeps the whole canonical match", () => {
  it("draws no duel intro card on a fresh entry, and still reaches the live question",
    async () => {
      const host = hostOf();
      render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" host={host} />);
      expect(intro()).toBeNull();
      await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
      expect(intro()).toBeNull();
      // Ranked's own rules scroll is Ranked's copy, not the host's.
      expect(screen.queryByLabelText("View Ranked scoring rules")).toBeNull();
    }, 25000);

  it("reports the presented phase to its host", async () => {
    startedAt = Date.now() - 4000;
    const host = hostOf();
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" host={host} />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
    await waitFor(() => expect(host.phases).toContain("answering"));
  }, 25000);
});

describe("DCMOD-E — a hosted match is handed back, never closed by Ranked", () => {
  it("plays the final round's own reveal, then hands back once — no outro, no end screen",
    async () => {
      startedAt = Date.now() - 4000;
      const host = hostOf();
      render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" host={host} />);
      await screen.findByTestId("answer-grid", undefined, { timeout: 6000 });
      liveOver = true;
      let sawReveal = false;
      let sawOutro = false;
      let sawEnd = false;
      const deadline = Date.now() + 12_000;
      while (Date.now() < deadline && host.settled.length === 0) {
        await new Promise((r) => setTimeout(r, 15));
        if (phaseOf() === "revealing") sawReveal = true;
        if (outro() !== null) sawOutro = true;
        if (endScreen() !== null) sawEnd = true;
      }
      expect(host.settled).toEqual([
        { matchId: "m1", terminalReason: expect.anything(), completionReason: expect.anything() },
      ]);
      // The final verdict was presented BEFORE the handback, not skipped by it.
      expect(sawReveal).toBe(true);
      // Keep watching past where the outro and the end screen would have been.
      const until = Date.now() + MATCH_OUTRO_MS + 1500;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, 25));
        if (outro() !== null) sawOutro = true;
        if (endScreen() !== null) sawEnd = true;
      }
      expect(sawOutro).toBe(false);
      expect(sawEnd).toBe(false);
      // Handed back exactly once, however much the arena re-rendered after.
      expect(host.settled).toHaveLength(1);
    }, 30000);

  it("a recovered match that is already over is handed back immediately, with no end screen",
    async () => {
      overMatch = true;
      const host = hostOf();
      render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={host} />);
      await waitFor(() => expect(host.settled).toHaveLength(1), { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 300));
      expect(endScreen()).toBeNull();
      expect(outro()).toBeNull();
      expect(screen.getByText("Stage complete…")).toBeInTheDocument();
      expect(host.settled).toHaveLength(1);
    }, 25000);

  it("an ordinary match (no host) keeps its rules scroll", () => {
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    expect(screen.getByLabelText("View Ranked scoring rules")).toBeInTheDocument();
  });

  it("an ordinary match (no host) still gets its outro and end screen", async () => {
    startedAt = Date.now() - 4000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 6000 });
    liveOver = true;
    await screen.findByTestId("ranked-match-outro", undefined, { timeout: 8000 });
    await screen.findByTestId("ranked-match-over", undefined, { timeout: 8000 });
  }, 30000);
});
