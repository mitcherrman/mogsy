/**
 * RD1 — the duel's standing, wired through the live arena.
 *
 * `duelState.test` pins the projection's rules. These pin what a player meets:
 * the score colours carried as `data-standing` on both columns, the header's
 * standing and final-modules copy, and — the one that matters most — that the
 * lead-change glow is a REVEAL event that a reconnect cannot replay, even when
 * the settlement it would describe is handed straight back by resume and then
 * backfilled into the ledger.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { privatePlayerV2, publicRoundV2, withPointsScoring } from "@/lib/ranked-public/fixtures";

const T = "2026-07-18T12:00:00+00:00";

interface Award {
  base: number; speed: number; before: number;
}
interface Backend {
  activeRound: number;
  /** The backend's own cumulative scores — the ONLY source of the tally. */
  scores: Record<string, number>;
  resolved: Record<number, unknown>;
  /** Awards written into the settlement for round N. */
  awards: Record<string, Award>;
  /** Card counts, when the settled module was a slice. */
  slice: Record<string, number> | null;
}
let backend: Backend;
/** The round a RESUME reports as already settled, or null for a fresh entry. */
let resumeLatest: number | null = null;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

const modulePoints = () => Object.fromEntries(
  Object.entries(backend.awards).map(([pid, a]) => [pid, {
    base_points: a.base, speed_bonus_points: a.speed,
    points_awarded: a.base + a.speed, score_before: a.before,
    score_after: a.before + a.base + a.speed,
  }]));

function resolvedPayload(round: number) {
  const player = (id: string) => ({
    player_id: id, class_id: id === "userA" ? "tank" : "mage",
    outcome: (backend.awards[id]?.base ?? 0) > 0 ? "correct" : "incorrect",
    submitted_at: T, answered_first: (backend.awards[id]?.speed ?? 0) > 0,
    timed_out: false, selected_ability_id: null,
    // The engine's transport for a v2 award. A points client must never read
    // these, and the arena asserted below never shows them.
    damage: {
      base_damage_dealt: backend.awards[id]?.base ?? 0, outgoing_bonus: 0,
      final_damage_dealt: (backend.awards[id]?.base ?? 0) + (backend.awards[id]?.speed ?? 0),
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: 0,
    },
    hp_before: 170, hp_after: 170, reached_zero_hp: false,
    xp_gained: 0, total_xp_after: 0, level_before: 1, level_after: 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null,
    remaining_charges: {},
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 1 },
    combat_lab_unlock_delta_seconds: 0,
  });
  const payload: Record<string, unknown> = {
    match_id: "m1", round_number: round, question_id: "q1",
    end_reason: "both_answered", started_at: T, original_deadline: T,
    final_deadline: T, pressure_applied: false,
    players: [player("userA"), player("userB")],
    next_round_duration_seconds: 30, next_round_duration_delta: 0,
    match_over: false, winner_id: null, completion_reason: null,
    module_points: modulePoints(),
  };
  if (backend.slice) {
    payload.segment_reveal = {
      module_id: "item_cost_duel", module_version: 4, challenge_count: 5,
      scoring: "points", challenges: [],
      players: Object.fromEntries(Object.entries(backend.slice).map(([pid, correct]) => [
        pid, {
          segment_result: "win", correct, incorrect: 5 - correct, unanswered: 0,
          total_response_ms: 4000, per_challenge_ms: [800, 800, 800, 800, 800],
          choices: [], perfect: correct === 5,
          speed_bonus: backend.awards[pid]?.speed ?? 0,
          damage_dealt: 0,
        },
      ])),
    };
  }
  return payload;
}

function shape<T extends { payload: Record<string, unknown> }>(env: T): T {
  for (const p of env.payload.players as Record<string, unknown>[]) p.role = "top";
  (env.payload.active_round as Record<string, unknown>).round_number = backend.activeRound;
  env.payload.completed_rounds = backend.activeRound - 1;
  return withPointsScoring(env, {
    moduleNumber: backend.activeRound, matchLength: 10,
    modulesCompleted: backend.activeRound - 1, scores: backend.scores,
  }) as T;
}
const publicBody = () => shape(publicRoundV2());
const privateBody = () => shape(privatePlayerV2("userA"));

beforeEach(() => {
  resumeLatest = null;
  // The viewer starts ONE point behind; a +3 module takes the lead.
  backend = {
    activeRound: 1, scores: { userA: 5, userB: 6 }, resolved: {},
    awards: { userA: { base: 2, speed: 1, before: 5 }, userB: { base: 0, speed: 0, before: 6 } },
    slice: null,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: backend.activeRound, server_time: T,
        payload: {
          match_status: "active", match_over: false,
          public: publicBody(), private: privateBody(),
          latest_resolved_round: resumeLatest === null ? null
            : { round_number: resumeLatest, payload: backend.resolved[resumeLatest] },
          result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    const resolved = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (resolved) {
      const payload = backend.resolved[Number(resolved[1])];
      if (!payload) return json({ detail: "not ready" }, 404);
      return json({
        schema_version: "ranked_duel.resolved_round.v2", projection_type: "resolved_round",
        match_id: "m1", round_number: Number(resolved[1]), server_time: T, payload,
      });
    }
    if (/\/matches\/m1$/.test(u)) return json(publicBody());
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mount() {
  const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  return view;
}

/**
 * Settle the open module and open the next one — the ONLY way a score moves.
 * `scores` is what the backend now reports as cumulative; passing the old map
 * is how a settlement that the backend has not yet banked is simulated.
 */
function settleModule(scores?: Record<string, number>) {
  backend.resolved[backend.activeRound] = resolvedPayload(backend.activeRound);
  backend.activeRound += 1;
  if (scores) backend.scores = scores;
}


const standingLine = () => screen.getByTestId("central-duel-standing");

describe("the score columns", () => {
  it("carry each side's standing, and the new leader's column glows once", async () => {
    await mount();
    expect(screen.getByTestId("score-userA")).toHaveAttribute("data-standing", "trailing");
    expect(screen.getByTestId("score-userB")).toHaveAttribute("data-standing", "leading");

    settleModule({ userA: 8, userB: 6 });
    await waitFor(() =>
      expect(screen.getByTestId("ranked-lead-pulse-userA")).toHaveAttribute("data-event", "lead:1"),
      { timeout: 4000 });
    expect(screen.getByTestId("score-userA")).toHaveAttribute("data-standing", "leading");
    expect(screen.getByTestId("score-userB")).toHaveAttribute("data-standing", "trailing");
    // The header says what just happened, over the verdict and award.
    expect(screen.getByTestId("central-duel-event")).toHaveTextContent("YOU TAKE THE LEAD");
    expect(screen.getByTestId("central-result-verdict")).toHaveTextContent("CORRECT +2");
    // The column that lost the lead gets no glow at all.
    expect(screen.queryByTestId("ranked-lead-pulse-userB")).toBeNull();
    // And the glow is gone with the beat.
    await waitFor(() => expect(screen.queryByTestId("ranked-lead-pulse-userA")).toBeNull(),
      { timeout: 4000 });
    // ...and so is the phrase; the persistent standing takes the line back.
    await waitFor(() => expect(standingLine()).toHaveTextContent("AHEAD BY 2 PTS"),
      { timeout: 6000 });
    expect(screen.queryByTestId("central-duel-event")).toBeNull();
  });

  it("does not glow when a module moves the score but not the lead", async () => {
    backend.scores = { userA: 9, userB: 6 };
    backend.awards.userA = { base: 2, speed: 0, before: 9 };
    await mount();
    settleModule({ userA: 11, userB: 6 });
    await waitFor(() =>
      expect(screen.getByTestId("score-userA")).toHaveAttribute("data-score", "11"),
      { timeout: 4000 });
    await waitFor(() =>
      expect(screen.getByTestId("ranked-last-result-verdict")).toHaveTextContent("CORRECT +2"),
      { timeout: 4000 });
    expect(screen.queryByTestId("ranked-lead-pulse-userA")).toBeNull();
    expect(screen.queryByTestId("ranked-lead-pulse-userB")).toBeNull();
    // Still leading, no bonus: no transient phrase at all.
    expect(screen.queryByTestId("central-duel-event")).toBeNull();
  });
});

describe("a reconnect", () => {
  it("renders the standing at once and never replays the lead change", async () => {
    // Round 1 already settled — and it was the module that took the lead.
    backend.resolved[1] = resolvedPayload(1);
    backend.activeRound = 2;
    backend.scores = { userA: 8, userB: 6 };
    resumeLatest = 1;
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    await mount();

    await waitFor(() =>
      expect(screen.getByTestId("score-userA")).toHaveAttribute("data-standing", "leading"));
    // Wait for the resume BACKFILL to have re-read the settled round, which is
    // the rehydration that must not count as a reveal.
    await waitFor(() => expect(fetchMock.mock.calls.some(
      ([u]) => /\/rounds\/1\/resolved$/.test(String(u)))).toBe(true));
    await waitFor(() => expect(screen.getByTestId("module-history-userA"))
      .toHaveAttribute("data-history-total", "1"));
    expect(screen.queryByTestId("ranked-lead-pulse-userA")).toBeNull();
    expect(screen.queryByTestId("ranked-lead-pulse-userB")).toBeNull();
    // No transient phrase either — only the persistent standing.
    expect(screen.queryByTestId("central-duel-event")).toBeNull();
    await waitFor(() => expect(standingLine()).toHaveTextContent("AHEAD BY 2 PTS"));
  });
});

describe("the header", () => {
  it("states the viewer's standing under the clock", async () => {
    await mount();
    await waitFor(() => expect(standingLine()).toHaveTextContent("BEHIND BY 1 PT"),
      { timeout: 4000 });
    expect(standingLine()).toHaveAttribute("data-standing", "trailing");
  });

  it.each([
    [4, "4 / 10", false],
    [8, "8 / 10 · FINAL 3", true],
    [10, "10 / 10 · FINAL", true],
  ])("module %i reads %s", async (round, copy, final) => {
    backend.activeRound = round as number;
    await mount();
    const title = screen.getByTestId("ranked-header-title");
    expect(title.textContent).toBe(copy);
    expect(screen.queryByTestId("ranked-header-final") !== null).toBe(final);
  });
});
