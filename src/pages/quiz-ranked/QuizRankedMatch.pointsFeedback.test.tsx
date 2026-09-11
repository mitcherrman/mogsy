/**
 * RP1 Step 4 — a settled module, in the live arena.
 *
 * The projection's own rules are pinned in `pointsFeedback.test`; what these
 * add is the wiring a player actually meets: the award reaching BOTH surfaces
 * that state it (the header plate on a wide screen, the rail at every width),
 * the slice's counts reaching them from the block transcript, and the one
 * thing the arena must never do — move a score before the backend has.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
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
  env.payload.progression_enabled = false;
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
  backend = {
    activeRound: 1, scores: { userA: 9, userB: 6 }, resolved: {},
    awards: { userA: { base: 2, speed: 1, before: 9 }, userB: { base: 0, speed: 0, before: 6 } },
    slice: null,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: backend.activeRound, server_time: T,
        payload: {
          match_status: "active", match_over: false, progression_enabled: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [], latest_resolved_round: null, result: null,
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

const verdictLine = () => screen.getByTestId("ranked-last-result-verdict");
const bonusLine = () => screen.getByTestId("ranked-last-result-consequence");

describe("a standard module settles", () => {
  it("states CORRECT +2 loud and FIRST +1 quiet, on the plate and the rail", async () => {
    await mount();
    settleModule({ userA: 12, userB: 6 });
    await waitFor(() => expect(verdictLine()).toHaveTextContent("CORRECT +2"),
      { timeout: 4000 });
    expect(bonusLine()).toHaveTextContent("FIRST +1");
    // The rail carries the same two facts — and it is the ONLY surface that
    // does below `md`, where the plate is hidden.
    const rail = screen.getByTestId("outcome-points-userA");
    expect(rail).toHaveTextContent("+2");
    expect(within(rail).getByTestId("outcome-speed-userA")).toHaveTextContent("+1");
  });

  it("shows no bonus at all for a correct answer that was not first", async () => {
    backend.awards.userA = { base: 2, speed: 0, before: 9 };
    await mount();
    settleModule({ userA: 11, userB: 6 });
    await waitFor(() => expect(verdictLine()).toHaveTextContent("CORRECT +2"),
      { timeout: 4000 });
    expect(bonusLine().textContent).toBe("");
    expect(screen.queryByTestId("outcome-speed-userA")).toBeNull();
  });

  it("states a wrong answer as INCORRECT +0, with no damage framing", async () => {
    backend.awards.userA = { base: 0, speed: 0, before: 9 };
    backend.awards.userB = { base: 2, speed: 1, before: 6 };
    await mount();
    settleModule({ userA: 9, userB: 9 });
    await waitFor(() => expect(verdictLine()).toHaveTextContent("INCORRECT +0"),
      { timeout: 4000 });
    expect(screen.getByTestId("ranked-match").textContent ?? "")
      .not.toMatch(/\bHP\b|\bDMG\b|damage|knockout/i);
  });

  it("gives the opponent's rail their own award, never the viewer's", async () => {
    await mount();
    settleModule({ userA: 12, userB: 6 });
    await waitFor(() =>
      expect(screen.getByTestId("outcome-points-userA")).toHaveTextContent("+2"),
      { timeout: 4000 });
    expect(screen.getByTestId("outcome-points-userB")).toHaveTextContent("+0");
    expect(screen.queryByTestId("outcome-speed-userB")).toBeNull();
  });
});

describe("a slice settles", () => {
  it("states 4 / 5 +4 with NO speed line, however fast it was", async () => {
    backend.slice = { userA: 4, userB: 2 };
    backend.awards = {
      userA: { base: 4, speed: 0, before: 9 },
      userB: { base: 2, speed: 0, before: 6 },
    };
    await mount();
    settleModule({ userA: 13, userB: 8 });
    await waitFor(() => expect(verdictLine()).toHaveTextContent("4 / 5 +4"),
      { timeout: 4000 });
    expect(bonusLine().textContent).toBe("");
    expect(screen.getByTestId("outcome-points-userA")).toHaveTextContent("+4");
    expect(screen.queryByTestId("outcome-speed-userA")).toBeNull();
    // And no perfect reward is named anywhere in the arena.
    expect(screen.getByTestId("ranked-match").textContent?.toLowerCase() ?? "")
      .not.toContain("perfect");
  });

  it("states 5 / 5 +5 over FINISHED FIRST +1 when the block earned it", async () => {
    backend.slice = { userA: 5, userB: 3 };
    backend.awards = {
      userA: { base: 5, speed: 1, before: 9 },
      userB: { base: 3, speed: 0, before: 6 },
    };
    await mount();
    settleModule({ userA: 15, userB: 9 });
    await waitFor(() => expect(verdictLine()).toHaveTextContent("5 / 5 +5"),
      { timeout: 4000 });
    expect(bonusLine()).toHaveTextContent("FINISHED FIRST +1");
    expect(screen.getByTestId("outcome-speed-userA")).toHaveTextContent("+1");
  });
});

describe("the cumulative score", () => {
  it("moves only when the BACKEND's own cumulative score moves", async () => {
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("score-userA")).toHaveAttribute("data-score", "9"));
    // The module settles and the settlement itself says score_after 12 — but
    // the backend's published cumulative score has NOT moved yet. The tally
    // must still read 9: `score_after` is a fact about the settlement, and the
    // running total is `players[].score`.
    settleModule();
    await waitFor(() => expect(verdictLine()).toHaveTextContent("CORRECT +2"),
      { timeout: 4000 });
    expect(screen.getByTestId("score-userA")).toHaveAttribute("data-score", "9");

    // Now the backend banks it, and only now does the tally move: 9 -> 12.
    backend.scores = { userA: 12, userB: 6 };
    await waitFor(() =>
      expect(screen.getByTestId("score-userA")).toHaveAttribute("data-score", "12"),
      { timeout: 4000 });
  });

  it("never moves on a submission", async () => {
    await mount();
    const before = screen.getByTestId("score-userB").getAttribute("data-score");
    // The opponent locks an answer for the OPEN module — no settlement.
    backend.scores = { ...backend.scores };
    await new Promise((r) => setTimeout(r, 40));
    expect(screen.getByTestId("score-userB").getAttribute("data-score")).toBe(before);
  });
});
