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
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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
import {
  pantheonStandardFinalWindow, pantheonSurvivalFinalChild, type DerivedSnapshot,
} from "@/lib/journey/__fixtures__/j5/finalWindow";

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
/** DC-SURV-UX — the public `ruleset` block, or null for a standard match. */
let rulesetOverride: Record<string, unknown> | null;
/** JOURNEY-UI2/UI3 — a REAL captured Journey `segment` + `segment_state` (J3). */
let journeyEnvelope: { segment: unknown; segment_state: unknown } | null;
/** The round the server currently reports as active. */
let activeRound: number;
/** Round-trip cost on the two reads the ending needs. Production has one. */
let endingLatencyMs: number;
/** JOURNEY5-LIVE — round-trip cost of `/private` (measured live: 8 s). */
let privateLatencyMs: number;
/** JOURNEY5-LIVE — every answer POST, and the scripted responses to segment ones. */
let posts: string[];
let segmentReplies: { status: number; body: unknown }[];

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
      { segment_number: activeRound, ...(segmentOverride.state as object ?? {}) });
    payload.question = null;
  }
  if (journeyEnvelope && !done) {
    payload.segment = journeyEnvelope.segment;
    payload.segment_state = journeyEnvelope.segment_state;
    payload.question = null;
  }
  payload.ruleset = rulesetOverride;
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
  rulesetOverride = null;
  journeyEnvelope = null;
  activeRound = 1;
  endingLatencyMs = 0;
  privateLatencyMs = 0;
  posts = [];
  segmentReplies = [];
  startedAt = Date.now() + LEAD_ON_ARRIVAL;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (privateLatencyMs && u.endsWith("/private")) await new Promise((r) => setTimeout(r, privateLatencyMs));
    if (/\/submission$|\/challenges\/\d+$/.test(u)) {
      posts.push(u.replace(/^.*\/matches\/m1/, ""));
      const seg = /\/segments\/(\d+)\/challenges\/(\d+)$/.exec(u);
      if (seg) {
        const reply = segmentReplies.shift() ?? { status: 200, body: null };
        return json(reply.body ?? {
          status: "accepted", segment_number: Number(seg[1]), challenge_index: Number(seg[2]),
          idempotent: false, conflicting: false, segment_resolved: false, next_challenge_index: Number(seg[2]) + 1,
        }, reply.status);
      }
      return json({ status: "accepted" });
    }
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

/* ══════════════════════════════════════════════════════════════════════════ */
/* DCMOD — a hosted step does not present itself as a Ranked duel             */
/* ══════════════════════════════════════════════════════════════════════════ */

const duelLabel = () => Array.from(document.querySelectorAll(".ranked-eyebrow"))
  .some((el) => /ranked duel/i.test(el.textContent ?? ""));
const versusLine = () => /vs/i.test(screen.queryByTestId("ranked-presence")?.textContent ?? "");

describe("DCMOD — hosted chrome", () => {
  it("a hosted Bot Ranked step draws no RANKED DUEL / vs Bot label and no Forfeit control",
    async () => {
      startedAt = Date.now() - 4000;
      isBotMatch = true;
      render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" host={hostOf()} />);
      await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
      expect(duelLabel()).toBe(false);
      expect(screen.queryByText(/ranked duel/i)).toBeNull();
      expect(versusLine()).toBe(false);
      expect(screen.queryByText(/vs bot/i)).toBeNull();
      expect(screen.queryByTestId("ranked-forfeit")).toBeNull();
      expect(screen.queryByText(/forfeit/i)).toBeNull();
      // Everything else about the step is the canonical match.
      expect(screen.getByTestId("ranked-header-title")).toBeInTheDocument();
      expect(screen.getByTestId("submission-status")).toBeInTheDocument();
    }, 25000);

  it("an ordinary Bot Ranked match (no host) keeps both", async () => {
    startedAt = Date.now() - 4000;
    isBotMatch = true;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
    expect(duelLabel()).toBe(true);
    expect(screen.getByTestId("ranked-presence")).toHaveTextContent(/vs bot/i);
    expect(screen.getByTestId("ranked-forfeit")).toHaveTextContent(/forfeit match/i);
  }, 25000);

  it("an ordinary queue match (no host) keeps RANKED DUEL, vs Opponent and Forfeit", async () => {
    startedAt = Date.now() - 4000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
    expect(duelLabel()).toBe(true);
    expect(screen.getByTestId("ranked-presence")).toHaveTextContent(/^vs /i);
    expect(screen.getByTestId("ranked-forfeit")).toBeInTheDocument();
  }, 25000);
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* DC-SURV-UX — Survival ends for the PLAYER at strike 3                      */
/* ══════════════════════════════════════════════════════════════════════════ */

const survivalRuleset = (strikes: number, over: Record<string, unknown> = {}) => ({
  ruleset_id: "survival", version: 1, time_bank_ms: null, time_bank_remaining_ms: null,
  time_bank_draining: false, max_strikes: 3, strikes, questions_settled: 12,
  stage_ended: false, ended_reason: null, ...over,
});

/** A five-card block in play: the human on card `index`, the bot on none. */
function survivalBlock(index: number, state: Record<string, unknown> = {}) {
  activeRound = 2;
  moduleNumber = 2;
  matchLength = 175;
  segmentOverride = { challenge_index: index, state };
}

describe("DC-SURV-UX — a hosted Survival stage", () => {
  it("own_finished = false: gameplay stays up and the player is not reported finished", async () => {
    startedAt = Date.now() - 4000;
    rulesetOverride = survivalRuleset(1);
    survivalBlock(1);
    const finished: string[] = [];
    const host = hostOf({ onPlayerFinished: (id) => { finished.push(id); } });
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={host} />);
    await screen.findByTestId("ranked-match", undefined, { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(finished).toEqual([]);
    expect(screen.queryByTestId("ranked-match")).not.toBeNull();
  }, 25000);

  it("strike 3 mid-block: gameplay ends at once, the rest of the block and the bot's cards are never drawn, and the parent is not told the match settled", async () => {
    startedAt = Date.now() - 4000;
    // Card 2 of 5 was the third strike: PRE-4 stops the block. The bot has
    // not finished, so the segment (and the match) is NOT settled.
    rulesetOverride = survivalRuleset(2);
    survivalBlock(2, {
      own_finished: true, own_challenges_completed: 2, own_next_challenge_index: 5,
      own_card_index: null, own_card_started_at: null, own_card_deadline: null,
      opponent_challenges_completed: 1, opponent_finished: false,
    });
    const finished: string[] = [];
    const statuses: unknown[] = [];
    const host = hostOf({
      onPlayerFinished: (id) => { finished.push(id); },
      onSurvivalStatus: (st) => { statuses.push(st); },
    });
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={host} />);
    await waitFor(() => expect(finished).toEqual(["m1"]), { timeout: 8000 });
    // The arena presents only the host's placeholder — no question, no card,
    // no opponent progress.
    expect(screen.queryByTestId("ranked-match")).toBeNull();
    expect(screen.queryByTestId("answer-grid")).toBeNull();
    expect(document.body).toHaveTextContent("Stage complete…");
    // Not settled: the handback waits for the server.
    expect(host.settled).toEqual([]);
    // Server truth relayed, not recomputed.
    expect(statuses).toContainEqual({ answered: 12, strikesUsed: 2, maxStrikes: 3 });
    await new Promise((r) => setTimeout(r, 300));
    expect(finished).toHaveLength(1);
  }, 25000);

  it("a one-card finish that is not the third strike is NOT the end: own_finished alone is not the signal", async () => {
    startedAt = Date.now() - 4000;
    rulesetOverride = survivalRuleset(1);
    survivalBlock(5); // every card played; own_finished true; ledger not ended
    const finished: string[] = [];
    const host = hostOf({ onPlayerFinished: (id) => { finished.push(id); } });
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={host} />);
    await screen.findByTestId("ranked-match", undefined, { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(finished).toEqual([]);
  }, 25000);

  it("Standard and Time Trial never report a player finish, whatever own_finished says", async () => {
    for (const rs of [null, { ruleset_id: "time_trial", stage_ended: false }]) {
      startedAt = Date.now() - 4000;
      rulesetOverride = rs;
      survivalBlock(2, { own_finished: true, own_challenges_completed: 2 });
      const finished: string[] = [];
      const host = hostOf({ onPlayerFinished: (id) => { finished.push(id); } });
      const { unmount } = render(
        <QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={host} />);
      await screen.findByTestId("ranked-match", undefined, { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 200));
      expect(finished).toEqual([]);
      unmount();
    }
  }, 40000);
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* JOURNEY-UI3 — a hosted Journey, on REAL J3 captures                         */
/* ══════════════════════════════════════════════════════════════════════════ */

type CapturePayload = Record<string, unknown>;
function captureSnap(name: string, label: string) {
  const all = JSON.parse(readFileSync(join(resolve(process.cwd(), "src/lib/journey/__fixtures__/j3"),
    `${name}.json`), "utf8")) as { label: string; at: string; envelope: { payload: CapturePayload } }[];
  const s = all.find((x) => x.label === label);
  if (!s) throw new Error(`${name}: ${label}`);
  return s;
}
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(\+00:00|Z)$/;
/**
 * The capture, moved in time so its capture instant is NOW: every server
 * instant keeps its distance from the moment it was read. Nothing else moves.
 */
function capture(name: string, label: string): CapturePayload {
  const s = captureSnap(name, label);
  const shift = Date.now() - Date.parse(s.at);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string" && ISO.test(v)) return new Date(Date.parse(v) + shift).toISOString();
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(s.envelope.payload) as CapturePayload;
}
const clockText = () => screen.getAllByTestId("timer-value")[0];

describe("JOURNEY-UI3 — a hosted Journey module", () => {
  it("a live Journey: champion crests replace the role mascots, and the board is in the arena", async () => {
    startedAt = Date.now() - 4000;
    const p = capture("zed.standard", "child1-open");
    journeyEnvelope = { segment: p.segment, segment_state: p.segment_state };
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={hostOf()} />);
    await screen.findByTestId("journey-board", undefined, { timeout: 8000 });
    expect(screen.getByTestId("journey-crest-subject")).toHaveAccessibleName(/^Zed, level 3/);
    expect(screen.getByTestId("journey-crest-opponent")).toHaveAccessibleName(/^Ahri, level 3/);
    expect(screen.queryByTestId("role-crest")).toBeNull();
  }, 25000);

  it("Standard: the header is the POOLED Journey clock — the server's remainder, never the round deadline", async () => {
    startedAt = Date.now() - 4000;
    // Child 2 open for 2 s: 140 s of 150 left and running (the round's own
    // deadline in this fixture is 30 s away — it must NOT be what is shown).
    const p = capture("zed.standard", "child1-live");
    journeyEnvelope = { segment: p.segment, segment_state: p.segment_state };
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={hostOf()} />);
    await screen.findByTestId("journey-board", undefined, { timeout: 8000 });
    await waitFor(() => expect(clockText()).toHaveTextContent(/^2:(19|20)$/), { timeout: 4000 });
    expect(clockText()).toHaveAttribute("data-timer-state", "running");
    // (The clock's secondary line shows the duel standing, which outranks the
    // "of 2:30 Journey time" note in the existing header — see the handoff.)
  }, 25000);

  it("Standard: during a reveal and during a transition beat the pool is HELD (server `running: false`)", async () => {
    startedAt = Date.now() - 4000;
    for (const label of ["child2-reveal", "child3-beat"]) {
      const p = capture("zed.standard", label);
      expect((p.segment_state as CapturePayload).active_time_running).toBe(false);
      expect((p.segment_state as CapturePayload).active_time_remaining_ms).toBe(126_000);
      journeyEnvelope = { segment: p.segment, segment_state: p.segment_state };
      const { unmount } = render(
        <QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={hostOf()} />);
      await screen.findByTestId("journey-board", undefined, { timeout: 8000 });
      await waitFor(() => expect(clockText()).toHaveTextContent("2:06"), { timeout: 4000 });
      expect(clockText()).toHaveAttribute("data-timer-state", "paused");
      // A second later it has not moved: nothing burns while nothing is answerable.
      await new Promise((r) => setTimeout(r, 1100));
      expect(clockText()).toHaveTextContent("2:06");
      unmount();
    }
  }, 40000);

  it("Survival: the header is the CHILD's own 30 s window, not the block", async () => {
    startedAt = Date.now() - 4000;
    const p = capture("olaf.survival", "child1-live");
    journeyEnvelope = { segment: p.segment, segment_state: p.segment_state };
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={hostOf()} />);
    await screen.findByTestId("journey-board", undefined, { timeout: 8000 });
    await waitFor(() => expect(clockText()).toHaveTextContent(/^0:(27|28)$/), { timeout: 4000 });
    // The round's projected block deadline here is ~51 s; the child's is 30 s.
    expect(clockText()).not.toHaveTextContent(/^0:(4|5)\d$/);
  }, 25000);

  it("Survival strike-out mid-Journey (real capture): gameplay ends at once — no board, no beat, no future child", async () => {
    startedAt = Date.now() - 4000;
    // The strike lands on child 2 of 3. The capture's own post-strike read is a
    // settled match (the bot had already finished), so the live child's segment
    // state is paired with the post-strike ruleset the server returned.
    const live = capture("pantheon.survival.strikeout", "child1-live");
    const after = capture("pantheon.survival.strikeout", "child1-reveal");
    journeyEnvelope = { segment: live.segment, segment_state: live.segment_state };
    rulesetOverride = after.ruleset as Record<string, unknown>;
    expect(rulesetOverride.own_stage_finished).toBe(true);
    const finished: string[] = [];
    const host = hostOf({ onPlayerFinished: (id) => { finished.push(id); } });
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={host} />);
    await waitFor(() => expect(finished).toEqual(["m1"]), { timeout: 8000 });
    expect(screen.queryByTestId("ranked-match")).toBeNull();
    expect(screen.queryByTestId("journey-board")).toBeNull();
    expect(screen.queryByTestId("journey-beat")).toBeNull();
    expect(document.body).toHaveTextContent("Stage complete…");
    expect(host.settled).toEqual([]);
  }, 25000);

  it("no transition after own_stage_finished — even with a transition on the wire", async () => {
    startedAt = Date.now() - 4000;
    // The purchase beat's segment state, as if strike 3 had just landed.
    const p = capture("zed.standard", "child3-beat");
    journeyEnvelope = { segment: p.segment, segment_state: p.segment_state };
    rulesetOverride = survivalRuleset(3, { live_strikes: 3, own_stage_finished: true, stage_ended: false });
    const finished: string[] = [];
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered"
      host={hostOf({ onPlayerFinished: (id) => { finished.push(id); } })} />);
    await waitFor(() => expect(finished).toEqual(["m1"]), { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByTestId("journey-beat")).toBeNull();
    expect(screen.queryByTestId("journey-board")).toBeNull();
    expect(document.body.textContent).not.toContain("Serrated Dirk");
  }, 25000);
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* JOURNEY5 — the FINAL child reveals before the module completes              */
/* (envelopes DERIVED from real J4 captures: lib/journey/__fixtures__/j5)      */
/* ══════════════════════════════════════════════════════════════════════════ */

/** A derived snapshot, moved in time so its instant is NOW (like `capture`). */
function shiftToNow(s: DerivedSnapshot): CapturePayload {
  const shift = Date.now() - Date.parse(s.at);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string" && ISO.test(v)) return new Date(Date.parse(v) + shift).toISOString();
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(s.envelope.payload) as CapturePayload;
}
const shownPhase = () => screen.queryByTestId("mastery-slice-challenge-phase");

describe("JOURNEY5 — a hosted Journey's final child", () => {
  it("Standard: the final reveal plays in the final window (clock held), the arena stays until the match completes, then hands back — nothing after", async () => {
    startedAt = Date.now() - 4000;
    const p = shiftToNow(pantheonStandardFinalWindow("correct"));
    journeyEnvelope = { segment: p.segment, segment_state: p.segment_state };
    const finished: string[] = [];
    const host = hostOf({ onPlayerFinished: (id) => { finished.push(id); } });
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={host} />);
    await screen.findByTestId("journey-board", undefined, { timeout: 8000 });
    await waitFor(() => expect(shownPhase()).toHaveAttribute("data-revealing", "true"), { timeout: 4000 });
    expect(shownPhase()).toHaveAttribute("data-challenge-index", "4");
    expect(screen.getByTestId("journey-combat-working")).toHaveTextContent("Answer 90");
    // The pool's frozen remainder, PAUSED — own_finished no longer un-pauses it.
    await waitFor(() => expect(clockText()).toHaveTextContent("1:50"), { timeout: 4000 });
    expect(clockText()).toHaveAttribute("data-timer-state", "paused");
    await new Promise((r) => setTimeout(r, 1100));
    expect(clockText()).toHaveTextContent("1:50");
    // own_finished alone never hands back: the match has not completed.
    expect(host.settled).toEqual([]);
    expect(finished).toEqual([]);
    expect(screen.queryByTestId("ranked-match")).not.toBeNull();

    // The server resolves the segment at own_reveal_until: the match completes.
    liveOver = true;
    let extra = false;
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && host.settled.length === 0) {
      await new Promise((r) => setTimeout(r, 15));
      const ph = shownPhase();
      if (screen.queryByTestId("journey-next-pending") || screen.queryByTestId("journey-beat")
          || (ph && ph.getAttribute("data-challenge-index") !== "4")) extra = true;
    }
    expect(host.settled).toHaveLength(1);
    expect(extra).toBe(false);
  }, 30000);

  it("Standard: child 5 TIMED OUT still reveals its correct answer", async () => {
    startedAt = Date.now() - 4000;
    const p = shiftToNow(pantheonStandardFinalWindow("timeout"));
    journeyEnvelope = { segment: p.segment, segment_state: p.segment_state };
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={hostOf()} />);
    await screen.findByTestId("journey-board", undefined, { timeout: 8000 });
    await waitFor(() => expect(shownPhase()).toHaveAttribute("data-revealing", "true"), { timeout: 4000 });
    expect(screen.getByTestId("mastery-reveal-answer")).toHaveTextContent("90");
    expect(screen.getByTestId("mastery-inline-reveal")).toHaveAttribute("data-correct", "false");
  }, 25000);

  it("a reconnect after the window (match already complete) is handed back with no reveal replayed", async () => {
    overMatch = true;
    const p = shiftToNow(pantheonStandardFinalWindow("correct"));
    journeyEnvelope = { segment: p.segment, segment_state: p.segment_state };
    const host = hostOf();
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={host} />);
    await waitFor(() => expect(host.settled).toHaveLength(1), { timeout: 8000 });
    expect(shownPhase()).toBeNull();
    expect(screen.queryByTestId("mastery-inline-reveal")).toBeNull();
  }, 25000);

  it("Survival: the last child reveals in its window; gameplay stays, no player finish, no round clock", async () => {
    startedAt = Date.now() - 4000;
    const p = shiftToNow(pantheonSurvivalFinalChild());
    journeyEnvelope = { segment: p.segment, segment_state: p.segment_state };
    rulesetOverride = p.ruleset as Record<string, unknown>;
    const finished: string[] = [];
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered"
      host={hostOf({ onPlayerFinished: (id) => { finished.push(id); } })} />);
    await screen.findByTestId("journey-board", undefined, { timeout: 8000 });
    await waitFor(() => expect(shownPhase()).toHaveAttribute("data-revealing", "true"), { timeout: 4000 });
    expect(shownPhase()).toHaveAttribute("data-challenge-index", "2");
    // The round's projected block deadline (0:2x here) is never the Journey's clock.
    expect(screen.queryByTestId("timer-value")).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(finished).toEqual([]);
  }, 25000);

  it("Survival strike 3 ON THE FINAL child: gameplay exits at once — no final hold, no reveal", async () => {
    startedAt = Date.now() - 4000;
    const p = shiftToNow(pantheonSurvivalFinalChild({ strikeOut: true }));
    journeyEnvelope = { segment: p.segment, segment_state: p.segment_state };
    rulesetOverride = p.ruleset as Record<string, unknown>;
    const finished: string[] = [];
    const host = hostOf({ onPlayerFinished: (id) => { finished.push(id); } });
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={host} />);
    await waitFor(() => expect(finished).toEqual(["m1"]), { timeout: 8000 });
    expect(screen.queryByTestId("ranked-match")).toBeNull();
    expect(screen.queryByTestId("journey-board")).toBeNull();
    expect(screen.queryByTestId("mastery-inline-reveal")).toBeNull();
    expect(document.body).toHaveTextContent("Stage complete…");
    expect(host.settled).toEqual([]);
  }, 25000);
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* JOURNEY5-LIVE — a Splash round settles into a Survival Journey round        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The capture moved so that ITS `started_at` lands on `openAt`: every server
 * instant keeps its distance from the child's open. The same shift for every
 * snapshot of one capture keeps the timeline consistent.
 */
function captureOpeningAt(name: string, label: string, openAt: number, file = "j4"): CapturePayload {
  const all = JSON.parse(readFileSync(join(resolve(process.cwd(), `src/lib/journey/__fixtures__/${file}`),
    `${name}.json`), "utf8")) as { label: string; envelope: { payload: CapturePayload } }[];
  const first = all[0].envelope.payload.active_round as { started_at: string };
  const shift = openAt - Date.parse(first.started_at);
  const s = all.find((x) => x.label === label);
  if (!s) throw new Error(`${name}: ${label}`);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string" && ISO.test(v)) return new Date(Date.parse(v) + shift).toISOString();
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(s.envelope.payload) as CapturePayload;
}

describe("JOURNEY5-LIVE — Splash settles, then a Survival Journey round opens child 0 at started_at", () => {
  /**
   * The live sequence (Daily Survival slot 6, reproduced twice on the real
   * stack): round 5 (a Splash quiz) settles; round 6 is created with a 2.9 s
   * presentation lead-in and its Journey's child 0 opens AT `started_at`
   * (`open_delays_ms: [0]`). The first round-6 snapshot the client reads is
   * the lead-in, whose reached prefix is empty. On the live stack `/private`
   * answered in ~8 s; it was awaited inside the poll, so the next public read
   * — the one carrying the open child — waited behind it while the surface
   * sat on the lead-in's "Mastery Slice complete — Waiting for the opponent".
   * Counters use the corrected backend semantics (0 finished at the start).
   */
  it("child 0 is on screen within a poll of opening — never 'complete' — even when /private is slow", async () => {
    startedAt = Date.now() - 4000;
    activeRound = 5;
    moduleNumber = 5;
    rulesetOverride = survivalRuleset(1, { live_strikes: 1, own_stage_finished: false });
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" host={hostOf()} />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });

    const openAt = Date.now() + 2900;
    const leadIn = captureOpeningAt("pantheon.survival", "child0-leadin", openAt);
    const open = captureOpeningAt("pantheon.survival", "child0-open", openAt);
    for (const p of [leadIn, open]) {
      const seg = p.segment_state as CapturePayload;
      seg.own_challenges_completed = 0;
      seg.opponent_challenges_completed = 0;
      seg.opponent_finished = false;
    }
    privateLatencyMs = 8000;
    activeRound = 6;
    moduleNumber = 6;
    startedAt = openAt;
    journeyEnvelope = { segment: leadIn.segment, segment_state: leadIn.segment_state };
    const swap = setTimeout(() => {
      journeyEnvelope = { segment: open.segment, segment_state: open.segment_state };
    }, openAt - Date.now());

    const seen: { t: number; v: string }[] = [];
    const until = openAt + 6000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
      const ph = screen.queryByTestId("mastery-slice-challenge-phase");
      seen.push({ t: Date.now() - openAt, v: screen.queryByTestId("mastery-slice-waiting") ? "complete"
        : ph ? `child${ph.getAttribute("data-challenge-index")}`
          : screen.queryByTestId("journey-next-pending") ? "opening" : "other" });
    }
    clearTimeout(swap);
    expect(seen.map((x) => x.v)).not.toContain("complete");
    // Visible within ~one poll interval of the server's open instant, not
    // after the 8 s private read.
    const firstChild = seen.find((x) => x.v === "child0");
    expect(firstChild, JSON.stringify(seen.map((x) => `${x.t}:${x.v}`))).toBeDefined();
    expect(firstChild!.t).toBeLessThan(2500);
    expect(screen.getByTestId("journey-board")).toBeInTheDocument();
  }, 30000);
});

describe("JOURNEY5-LIVE — no answer is sent before the server opens it; a refusal can be answered again", () => {
  it("Splash (quiz) lead-in: tablets clicked before started_at send nothing; after it, one click sends one answer", async () => {
    startedAt = Date.now() + 3000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={hostOf()} />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 8000 });
    for (const b of screen.getByTestId("answer-grid").querySelectorAll("button")) (b as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 300));
    expect(posts).toEqual([]);
    await waitFor(() => expect(screen.getByTestId("answer-grid")).toHaveAttribute("data-answers-state", "open"),
      { timeout: 6000 });
    (screen.getByTestId("answer-grid").querySelector("button") as HTMLButtonElement).click();
    await waitFor(() => expect(posts).toEqual(["/rounds/1/submission"]));
  }, 25000);

  it("a Journey child refused with 409 RANKED_CARD_NOT_OPEN stays answerable with no red line, and the second submit is sent", async () => {
    startedAt = Date.now() - 4000;
    const p = capture("review.reask", "reask-live");
    journeyEnvelope = { segment: p.segment, segment_state: p.segment_state };
    segmentReplies = [{ status: 409, body: { detail: {
      code: "RANKED_CARD_NOT_OPEN", message: "challenge 0 opens at the round's start" } } }];
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" host={hostOf()} />);
    await screen.findByTestId("journey-board", undefined, { timeout: 8000 });
    const answer = async () => {
      (screen.getAllByRole("radio")[1] as HTMLElement).click();
      await waitFor(() => expect(screen.getByTestId("mastery-submit-button")).not.toBeDisabled());
      (screen.getByTestId("mastery-submit-button") as HTMLButtonElement).click();
    };
    await waitFor(() => expect(screen.getByTestId("mastery-slice-challenge-phase")).not.toHaveAttribute("data-not-open"));
    await answer();
    await waitFor(() => expect(posts).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("mastery-submit-button")).not.toBeDisabled());
    expect(screen.queryByTestId("mastery-slice-error")).toBeNull();
    expect(document.body.textContent).not.toMatch(/could not reach the ranked service/);
    await answer();
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toMatch(/\/segments\/\d+\/challenges\/0$/);
  }, 25000);
});
