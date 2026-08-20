/**
 * AI1 Phase 2B — proving the mascot actually moves on a REAL Ranked round.
 *
 * The owner could not tell whether `attack` and `hit` were firing at all, and
 * "make the animation bigger" is not an answer to that question — a distance is
 * only visible if the trigger fires in the first place. So this file drives the
 * whole chain, from a backend payload to a class on a DOM node:
 *
 *   backend resolved round  (the fetch mock below, contract-shaped)
 *     -> useRankedMatch      `lastResolved` + the reveal hold
 *       -> projectMascotReactions
 *         -> CombatantPanel  `reaction`
 *           -> RoleCrest     an intent
 *             -> RoleMascot  `role-mascot-attack` / `role-mascot-hit`
 *
 * Nothing is stubbed between the wire and the class. There is no test-only
 * trigger anywhere in the product code, so if these pass in CI the animation
 * fires in the product for the same reason.
 *
 * The verdict is: the Phase 2 triggers were ALREADY correct. The `attack` and
 * `hit` classes landed on the right mascots on the right beat. What the owner
 * could not see was 6.4px of travel inside a 56px frame.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

const T = "2026-07-18T12:00:00+00:00";

interface Backend {
  activeRound: number;
  resolved: Record<number, unknown>;
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });

/**
 * One settled round, in the backend's own shape. `userA` (Top) hurts `userB`
 * (Mid) for 24 and takes nothing back — the ordinary round, where one mascot
 * lunges and the other recoils as two halves of one event.
 */
function resolvedPayload(round: number) {
  const player = (id: string, dealt: number, received: number, hpAfter: number) => ({
    player_id: id, class_id: id === "userA" ? "tank" : "mage",
    outcome: dealt > 0 ? "correct" : "incorrect",
    submitted_at: T, answered_first: dealt > 0, timed_out: false,
    selected_ability_id: null,
    damage: {
      base_damage_dealt: dealt, outgoing_bonus: 0, final_damage_dealt: dealt,
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: received,
    },
    hp_before: hpAfter + received, hp_after: hpAfter, reached_zero_hp: false,
    xp_gained: 10, total_xp_after: 10, level_before: 1, level_after: 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null,
    remaining_charges: { "tank.fortify": 3 },
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 1 },
    combat_lab_unlock_delta_seconds: 0,
  });
  return {
    match_id: "m1", round_number: round, question_id: `q${round}`,
    end_reason: "both_answered",
    started_at: T, original_deadline: T, final_deadline: T, pressure_applied: false,
    players: [player("userA", 24, 0, 170), player("userB", 0, 24, 150 - 24 * round)],
    next_round_duration_seconds: 30, next_round_duration_delta: 0,
    match_over: false, winner_id: null, completion_reason: null,
  };
}

/** The public round, with the R1 ROLES the arena needs to draw a mascot. */
function publicBody() {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.completed_rounds = backend.activeRound - 1;
  (payload.active_round as Record<string, unknown>).round_number = backend.activeRound;
  (payload.question as Record<string, unknown>).question_id = `q${backend.activeRound}`;
  const roles: Record<string, string> = { userA: "top", userB: "mid" };
  for (const p of payload.players as Record<string, unknown>[]) {
    p.role = roles[p.player_id as string];
  }
  return body;
}

function privateBody() {
  const body = privatePlayerV2("userA");
  const payload = body.payload as Record<string, unknown>;
  const roles: Record<string, string> = { userA: "top", userB: "mid" };
  for (const p of payload.players as Record<string, unknown>[]) {
    p.role = roles[p.player_id as string];
  }
  return body;
}

beforeEach(() => {
  backend = { activeRound: 1, resolved: {} };
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(),
    dispatchEvent: vi.fn(), onchange: null,
  })));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: backend.activeRound, server_time: T,
        payload: {
          match_status: "active", match_over: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [], latest_resolved_round: null, result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (u.includes("/submission")) return json({ status: "accepted" });
    const resolvedMatch = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (resolvedMatch) {
      const round = Number(resolvedMatch[1]);
      const payload = backend.resolved[round];
      if (!payload) return json({ detail: "not ready" }, 404);
      return json({
        schema_version: "ranked_duel.resolved_round.v2", projection_type: "resolved_round",
        match_id: "m1", round_number: round, server_time: T, payload,
      });
    }
    if (/\/matches\/m1$/.test(u) && (init.method ?? "GET") === "GET") return json(publicBody());
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function mount() {
  const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  return view;
}

/** Settle the current round on the server and move it on, exactly as the
 *  reveal-beat harness does. Nothing here touches the mascot. */
function advanceRound() {
  backend.resolved[backend.activeRound] = resolvedPayload(backend.activeRound);
  backend.activeRound += 1;
}

/** The action layer inside a given duelist's panel. */
const layerFor = (playerId: string) =>
  screen.getByTestId(`combatant-${playerId}`)
    .querySelector(`[data-testid="role-crest-mascot-action"]`) as HTMLElement;

describe("AI1 — a settled Ranked round moves both mascots", () => {
  it("draws a mascot for each duelist's frozen role", async () => {
    await mount();
    expect(screen.getByTestId("combatant-userA")
      .querySelector('[data-testid="role-crest-mascot"]')).toHaveAttribute("data-role", "top");
    expect(screen.getByTestId("combatant-userB")
      .querySelector('[data-testid="role-crest-mascot"]')).toHaveAttribute("data-role", "mid");
  });

  it("lunges the dealer and recoils the damaged one, off the real settlement",
    async () => {
      await mount();
      // Nothing is playing before a round settles.
      expect(layerFor("userA").dataset.playing).toBeUndefined();
      expect(layerFor("userB").dataset.playing).toBeUndefined();

      advanceRound();

      // userA dealt 24 -> attack. userB received 24 -> hit. Both on the beat
      // the round resolves, from the same row the HP bar reads.
      await waitFor(
        () => expect(layerFor("userA").dataset.playing).toBe("attack"),
        { timeout: 4000 });
      expect(layerFor("userA").classList.contains("role-mascot-attack")).toBe(true);
      expect(layerFor("userB").dataset.playing).toBe("hit");
      expect(layerFor("userB").classList.contains("role-mascot-hit")).toBe(true);
    });

  it("faces the two mascots at each other, so forward means opposite things",
    async () => {
      await mount();
      // The ONLY direction the arena states. `attack` and `hit` derive forward
      // and backward from it, which is why no keyframe says "move right".
      expect(screen.getByTestId("combatant-userA")
        .querySelector('[data-testid="role-crest-mascot"]'))
        .toHaveAttribute("data-facing", "right");
      expect(screen.getByTestId("combatant-userB")
        .querySelector('[data-testid="role-crest-mascot"]'))
        .toHaveAttribute("data-facing", "left");
    });

  it("retriggers on the NEXT round, because the id is the round number",
    async () => {
      await mount();
      advanceRound();
      await waitFor(() => expect(layerFor("userA").dataset.playing).toBe("attack"),
        { timeout: 4000 });

      // End round 1's animation the way the browser would.
      layerFor("userA").dispatchEvent(new Event("animationend"));
      layerFor("userB").dispatchEvent(new Event("animationend"));
      await waitFor(() => expect(layerFor("userA").dataset.playing).toBeUndefined());

      advanceRound();
      // Round 2 is the same ACTION with a different id, which is the whole
      // reason playback is edge-triggered on the id and not on the action.
      await waitFor(() => expect(layerFor("userA").dataset.playing).toBe("attack"),
        { timeout: 4000 });
      expect(layerFor("userB").dataset.playing).toBe("hit");
    });
});
