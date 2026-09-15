/**
 * RM1 Pass 2B — the header's display and the columns' payouts, in the live
 * arena.
 *
 * The components' own rules are pinned beside them (`CentralStage.test`,
 * `AwardPops.test`, `centralStage.test`). What these add is the wiring a
 * player actually meets: the viewer's result reaching the header's centre from
 * the settlement, BOTH columns receiving their own independent payout, and the
 * one thing this feature must never do — pay an award twice.
 *
 * The harness is `QuizRankedMatch.pointsFeedback.test`'s, deliberately: these
 * are new assertions about the same live match, and a second fixture of the
 * same backend would be a second thing to keep true.
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
  /** RM1 — the player the backend settled as timed out, if any. */
  timedOut: string | null;
  /** RM1 — an unrated match against the practice bot. */
  botMatch: boolean;
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
    outcome: backend.timedOut === id ? "timeout"
      : (backend.awards[id]?.base ?? 0) > 0 ? "correct" : "incorrect",
    submitted_at: backend.timedOut === id ? null : T,
    answered_first: (backend.awards[id]?.speed ?? 0) > 0,
    timed_out: backend.timedOut === id, selected_ability_id: null,
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
  if (backend.botMatch) {
    env.payload.playtest = {
      ...(env.payload.playtest as Record<string, unknown> ?? {}),
      is_bot_match: true,
    };
  }
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
    slice: null, timedOut: null, botMatch: false,
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


const stage = () => screen.getByTestId("timer-display").getAttribute("data-stage");
const pops = (playerId: string) => within(screen.getByTestId(`award-pops-${playerId}`))
  .queryAllByTestId(/^award-pop-/)
  .map((el) => `${el.getAttribute("data-testid")}=${el.getAttribute("data-points")}`);

describe("the header's centre carries the viewer's result", () => {
  it("turns from the clock to CORRECT / +2 POINTS", async () => {
    await mount();
    expect(stage()).toBe("timer");
    settleModule({ userA: 12, userB: 6 });
    await waitFor(() => expect(stage()).toBe("result"), { timeout: 4000 });
    expect(screen.getByTestId("central-result-verdict")).toHaveTextContent("CORRECT");
    // The BASE, not the 3 that was banked: the bonus has its own mark.
    expect(screen.getByTestId("central-result-points")).toHaveTextContent("+2 POINTS");
  });

  it("states a wrong module as INCORRECT / +0 POINTS", async () => {
    backend.awards = {
      userA: { base: 0, speed: 0, before: 9 },
      userB: { base: 2, speed: 0, before: 6 },
    };
    await mount();
    settleModule({ userA: 9, userB: 8 });
    await waitFor(() => expect(stage()).toBe("result"), { timeout: 4000 });
    expect(screen.getByTestId("central-result-verdict")).toHaveTextContent("INCORRECT");
    expect(screen.getByTestId("central-result-points")).toHaveTextContent("+0 POINTS");
  });

  it("returns the centre to a RUNNING clock for the next module", async () => {
    // The whole point of the sequence: the display hands the centre back, and
    // the next module's clock is live in it.
    await mount();
    settleModule({ userA: 12, userB: 6 });
    await waitFor(() => expect(stage()).toBe("result"), { timeout: 4000 });
    await waitFor(() => expect(stage()).toBe("timer"), { timeout: 6000 });
    expect(screen.getByTestId("timer-value")).toHaveAttribute("data-timer-state", "running");
  });

  it("shows the viewer's OWN result, never the opponent's", async () => {
    // Asymmetric: the viewer was wrong and the opponent was right. A display
    // reading the settlement's first player would say CORRECT here.
    backend.awards = {
      userA: { base: 0, speed: 0, before: 9 },
      userB: { base: 3, speed: 1, before: 6 },
    };
    await mount();
    settleModule({ userA: 9, userB: 10 });
    await waitFor(() => expect(stage()).toBe("result"), { timeout: 4000 });
    expect(screen.getByTestId("central-result-verdict")).toHaveTextContent("INCORRECT");
  });
});

describe("both columns are paid, independently", () => {
  it("pops each player's OWN base and bonus", async () => {
    // Deliberately asymmetric in base AND in bonus.
    backend.awards = {
      userA: { base: 2, speed: 1, before: 9 },
      userB: { base: 3, speed: 0, before: 6 },
    };
    await mount();
    settleModule({ userA: 12, userB: 9 });
    await waitFor(() => expect(pops("userA")).toContain("award-pop-base-userA=2"),
      { timeout: 4000 });
    // The opponent is paid from its own award on the same settlement — a duel
    // in which only the viewer's score visibly moves reads as a solo run.
    expect(pops("userB")).toContain("award-pop-base-userB=3");
    await waitFor(() => expect(pops("userA")).toContain("award-pop-bonus-userA=1"),
      { timeout: 2000 });
    // ...and the opponent earned no bonus, so it gets none.
    expect(pops("userB").some((p) => p.includes("bonus"))).toBe(false);
  });

  it("pays a +0 module as +0, for the player who earned it", async () => {
    backend.awards = {
      userA: { base: 0, speed: 0, before: 9 },
      userB: { base: 2, speed: 1, before: 6 },
    };
    await mount();
    settleModule({ userA: 9, userB: 9 });
    await waitFor(() => expect(pops("userA")).toContain("award-pop-base-userA=0"),
      { timeout: 4000 });
    expect(pops("userB")).toContain("award-pop-base-userB=2");
  });

  it("never recomputes a total: the tally is the backend's own figure",
    async () => {
      await mount();
      expect(screen.getByTestId("score-userA")).toHaveAttribute("data-score", "9");
      // The settlement lands but the backend has NOT yet banked the new
      // cumulative score. The payout may pop; the tally must not move.
      settleModule();
      await waitFor(() => expect(pops("userA")).toContain("award-pop-base-userA=2"),
        { timeout: 4000 });
      expect(screen.getByTestId("score-userA")).toHaveAttribute("data-score", "9");
      // Only when the backend says so.
      backend.scores = { userA: 12, userB: 6 };
      await waitFor(
        () => expect(screen.getByTestId("score-userA")).toHaveAttribute("data-score", "12"),
        { timeout: 4000 });
    });
});

describe("a payout cannot be shown twice", () => {
  it("survives the poll: an award pops once, not on every refresh", async () => {
    await mount();
    settleModule({ userA: 12, userB: 6 });
    await waitFor(() => expect(pops("userA")).toContain("award-pop-base-userA=2"),
      { timeout: 4000 });
    // Let the pop expire, then keep polling the same settled state.
    await waitFor(() => expect(pops("userA")).toHaveLength(0), { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 1200));
    expect(pops("userA")).toHaveLength(0);
  });

  it("the module's permanent bubble states the BASE, and outlives the pop",
    async () => {
      // The durable record and the momentary feedback are different surfaces:
      // the bubble is still there when the pop has gone.
      await mount();
      settleModule({ userA: 12, userB: 6 });
      await waitFor(
        () => expect(screen.getByTestId("module-bubble-userA-1")).toBeInTheDocument(),
        { timeout: 4000 });
      const bubble = screen.getByTestId("module-bubble-userA-1");
      expect(bubble).toHaveAttribute("data-base-points", "2");
      expect(bubble).toHaveAttribute("data-speed-bonus", "true");
      await waitFor(() => expect(pops("userA")).toHaveLength(0), { timeout: 4000 });
      expect(screen.getByTestId("module-bubble-userA-1")).toBeInTheDocument();
    });
});

describe("a timed-out module", () => {
  it("states TIME EXPIRED / +0 POINTS and pays a zero", async () => {
    backend.awards = {
      userA: { base: 0, speed: 0, before: 9 },
      userB: { base: 0, speed: 0, before: 6 },
    };
    backend.timedOut = "userA";
    await mount();
    settleModule();
    await waitFor(() => expect(stage()).toBe("result"), { timeout: 4000 });
    // The arena's OWN word for this outcome. The rails and the persistent
    // plate have said "TIMED OUT" since the verdict row was written, and the
    // display must not be the one surface that says something else.
    expect(screen.getByTestId("central-result-verdict")).toHaveTextContent("TIMED OUT");
    expect(screen.getByTestId("central-result-points")).toHaveTextContent("+0 POINTS");
    expect(pops("userA")).toContain("award-pop-base-userA=0");
  });
});

describe("a Meta Reflex block", () => {
  it("pays the BLOCK's base once, and marks the bonus separately", async () => {
    // 4/5 with no bonus, then 5/5 with one. The per-card `+1`s this client
    // shows during the block are reconciled against the base the backend
    // published — see the payout projection — so the settlement never pays the
    // same points a second time.
    backend.slice = { userA: 4, userB: 2 };
    backend.awards = {
      userA: { base: 4, speed: 0, before: 9 },
      userB: { base: 2, speed: 0, before: 6 },
    };
    await mount();
    settleModule({ userA: 13, userB: 8 });
    await waitFor(() => expect(pops("userA")).toContain("award-pop-base-userA=4"),
      { timeout: 4000 });
    // The block's own scoreline reaches the centre as its verdict: a block has
    // no single correct/incorrect, and "4 / 5" IS the verdict there.
    expect(screen.getByTestId("central-result-verdict")).toHaveTextContent("4 / 5");
    expect(screen.getByTestId("central-result-points")).toHaveTextContent("+4 POINTS");
  });

  it("gives a perfect, first-finished block its own bonus mark", async () => {
    backend.slice = { userA: 5, userB: 3 };
    backend.awards = {
      userA: { base: 5, speed: 1, before: 9 },
      userB: { base: 3, speed: 0, before: 6 },
    };
    await mount();
    settleModule({ userA: 15, userB: 9 });
    await waitFor(() => expect(pops("userA")).toContain("award-pop-base-userA=5"),
      { timeout: 4000 });
    await waitFor(() => expect(pops("userA")).toContain("award-pop-bonus-userA=1"),
      { timeout: 2000 });
    // The BASE in the figure, the bonus as its own mark — the same rule
    // everywhere.
    expect(screen.getByTestId("central-result-points")).toHaveTextContent("+5 POINTS");
  });

  it("settles the block's permanent bubble at its final BASE total", async () => {
    backend.slice = { userA: 5, userB: 3 };
    backend.awards = {
      userA: { base: 5, speed: 1, before: 9 },
      userB: { base: 3, speed: 0, before: 6 },
    };
    await mount();
    settleModule({ userA: 15, userB: 9 });
    await waitFor(
      () => expect(screen.getByTestId("module-bubble-userA-1")).toBeInTheDocument(),
      { timeout: 4000 });
    const bubble = screen.getByTestId("module-bubble-userA-1");
    expect(bubble).toHaveAttribute("data-base-points", "5");
    expect(bubble).toHaveAttribute("data-speed-bonus", "true");
    expect(bubble).toHaveTextContent("+5");
  });
});

describe("a reconnect cannot re-pay a module", () => {
  it("pays nothing for rounds recovered by the resume backfill", async () => {
    // A player refreshes into a match with three modules already settled. The
    // backfill fills the history — the bubbles appear — and pays nothing: it
    // sets no `lastResolved` and starts no reveal beat, which is the same
    // property that keeps it from replaying a reveal.
    backend.activeRound = 4;
    for (const r of [1, 2, 3]) backend.resolved[r] = resolvedPayload(r);
    await mount();
    await waitFor(
      () => expect(screen.getByTestId("module-bubble-userA-1")).toBeInTheDocument(),
      { timeout: 4000 });
    expect(screen.getByTestId("module-bubble-userA-3")).toBeInTheDocument();
    // Three modules of history, and not one payout animation for any of them.
    expect(pops("userA")).toHaveLength(0);
    expect(pops("userB")).toHaveLength(0);
    // ...and the centre is a clock, not a result recovered from history.
    expect(stage()).toBe("timer");
  });
});

describe("a bot / unrated match", () => {
  it("names the opponent in the header and still pays both columns", async () => {
    backend.botMatch = true;
    await mount();
    expect(screen.getByTestId("ranked-header")).toHaveTextContent(/vs Bot/i);
    settleModule({ userA: 12, userB: 6 });
    await waitFor(() => expect(pops("userA")).toContain("award-pop-base-userA=2"),
      { timeout: 4000 });
    // The bot is a duelist like any other: it is paid from its own award.
    expect(screen.getByTestId("award-pops-userB")).toBeInTheDocument();
  });
});
