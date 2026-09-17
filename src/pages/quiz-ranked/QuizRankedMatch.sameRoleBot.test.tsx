/**
 * RBOT2 — a bot match is a same-role duel.
 *
 * The backend now freezes the human's role onto the bot seat. Nothing in the
 * frontend special-cases a bot: a role-bearing bot takes the ordinary
 * `RoleMascot` path, so these pin that it does — the same art on both columns,
 * both facing the arena centre, and the RD2 reactions on the bot's own mascot
 * rather than on the neutral-emblem fallback.
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
/** The round a RESUME reports as already settled, or null for a fresh entry. */
let resumeLatest: number | null = null;
/** Seat roles; a bot seat is `null`, exactly as the backend serves one. */
let roles: Record<string, string | null> = {};

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
  for (const p of env.payload.players as Record<string, unknown>[]) {
    const pid = p.player_id as string;
    p.role = pid in roles ? roles[pid] : "top";
  }
  // RBOT2 — the opponent seat is the server's bot, exactly as a bot match
  // projects it; its role is whatever the backend froze for it.
  env.payload.playtest = {
    question_bank_mode: "shared_bank", is_placeholder: false,
    is_bot_match: true, session_preset: null,
  };
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
  roles = { userA: "jungle", userB: "jungle" };
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
          match_status: "active", match_over: false, progression_enabled: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [],
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




const column = (pid: string) => screen.getByTestId(`combatant-${pid}`);
const mascot = (pid: string) => within(column(pid)).getByTestId("role-crest-mascot");
const art = (pid: string) =>
  within(column(pid)).getByTestId("role-crest-mascot-plate").querySelector("img")!
    .getAttribute("src");
const playing = (pid: string) =>
  within(column(pid)).getByTestId("role-crest-mascot-action").dataset.playing ?? null;

describe("same-role bot match", () => {
  it.each([
    ["jungle", "/mascot/ranked/jgmogzy.png"],
    ["mid", "/mascot/ranked/midmogzy.png"],
  ])("a %s bot match draws %s on BOTH columns, facing each other", async (role, path) => {
    roles = { userA: role, userB: role };
    await mount();
    // It really is projected as a bot match.
    expect(screen.getByTestId("ranked-presence")).toHaveTextContent(/vs Bot/i);
    expect(art("userA")).toBe(path);
    expect(art("userB")).toBe(path);
    expect(mascot("userA")).toHaveAttribute("data-role", role);
    expect(mascot("userB")).toHaveAttribute("data-role", role);
    // The viewer's column faces right, the mirrored bot column faces left:
    // both toward the arena centre, so their lunges/hops read as a pair.
    expect(mascot("userA")).toHaveAttribute("data-facing", "right");
    expect(mascot("userB")).toHaveAttribute("data-facing", "left");
    // A role-bearing bot is NOT on the neutral fallback.
    expect(within(column("userB")).queryByTestId("role-crest-neutral")).toBeNull();
  });

  it("the bot's own mascot cheers for its score", async () => {
    backend.scores = { userA: 9, userB: 2 };
    backend.awards = {
      userA: { base: 0, speed: 0, before: 9 },
      userB: { base: 2, speed: 0, before: 2 },
    };
    await mount();
    settleModule({ userA: 9, userB: 4 });
    await waitFor(() => expect(playing("userB")).toBe("cheer"), { timeout: 4000 });
    expect(playing("userA")).toBeNull();
  });

  it("the bot celebrates taking the lead", async () => {
    backend.scores = { userA: 6, userB: 5 };
    backend.awards = {
      userA: { base: 0, speed: 0, before: 6 },
      userB: { base: 2, speed: 0, before: 5 },
    };
    await mount();
    settleModule({ userA: 6, userB: 7 });
    await waitFor(() => expect(playing("userB")).toBe("celebrate"), { timeout: 4000 });
    expect(playing("userA")).toBeNull();
  });

  it("both same-role mascots lock in when the final module begins", async () => {
    backend.activeRound = 9;
    backend.scores = { userA: 20, userB: 20 };
    backend.awards = {
      userA: { base: 0, speed: 0, before: 20 },
      userB: { base: 0, speed: 0, before: 20 },
    };
    await mount();
    settleModule({ userA: 20, userB: 20 });
    await waitFor(() => expect(playing("userB")).toBe("focus"), { timeout: 6000 });
    expect(playing("userA")).toBe("focus");
  });

  it("a genuinely role-less seat (a historical bot match) keeps the neutral fallback", async () => {
    roles = { userA: "jungle", userB: null };
    await mount();
    expect(within(column("userB")).queryByTestId("role-crest-mascot")).toBeNull();
    expect(within(column("userB")).getByTestId("role-crest-neutral")).toBeInTheDocument();
  });
});
