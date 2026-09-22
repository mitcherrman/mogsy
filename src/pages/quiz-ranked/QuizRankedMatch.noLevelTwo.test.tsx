/**
 * There is NO leveling system. An ordinary Ranked match (no host) plays from
 * round to round and never draws a Level 2 prompt — not on a settlement that
 * still reports a level change, and not when an older backend still sends the
 * retired `progression_enabled` / `progression_pending_players` keys naming
 * the viewer as owing a choice. The client never calls the retired
 * level-two-choice route.
 *
 * Harness modelled on `QuizRankedMatch.revealBeat.test.tsx`, which advances a
 * real controller + arena through round boundaries.
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
  /** Send the retired keys, as a not-yet-updated backend would. */
  legacyKeys: boolean;
  calls: string[];
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function resolvedPayload(round: number) {
  const player = (id: string) => ({
    player_id: id, class_id: id === "userA" ? "tank" : "mage",
    outcome: "correct", submitted_at: T, answered_first: id === "userA", timed_out: false,
    selected_ability_id: null,
    damage: {
      base_damage_dealt: 10, outgoing_bonus: 0, final_damage_dealt: 10,
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: 10,
    },
    hp_before: 170, hp_after: 160, reached_zero_hp: false,
    xp_gained: 10, total_xp_after: 10 * round,
    // A settlement that still says the viewer levelled up — the moment the
    // old client would have opened the Level 2 choice.
    level_before: 1, level_after: id === "userA" ? 2 : 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null,
    remaining_charges: { "tank.fortify": 3 },
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 1 },
    combat_lab_unlock_delta_seconds: 0,
  });
  return {
    match_id: "m1", round_number: round, question_id: `q${round}`,
    end_reason: "both_answered",
    started_at: T, original_deadline: T, final_deadline: T, pressure_applied: false,
    players: [player("userA"), player("userB")],
    next_round_duration_seconds: 30, next_round_duration_delta: 0,
    match_over: false, winner_id: null, completion_reason: null,
  };
}

function withLegacy(payload: Record<string, unknown>) {
  if (backend.legacyKeys) {
    payload.progression_enabled = true;
    payload.progression_pending_players = backend.activeRound > 1 ? ["userA"] : [];
  }
  return payload;
}

function publicBody() {
  const body = publicRoundV2();
  const payload = withLegacy(body.payload as Record<string, unknown>);
  payload.completed_rounds = backend.activeRound - 1;
  (payload.active_round as Record<string, unknown>).round_number = backend.activeRound;
  (payload.question as Record<string, unknown>).question_id = `q${backend.activeRound}`;
  (payload.question as Record<string, unknown>).prompt =
    `Round ${backend.activeRound} — which item grants Immolate?`;
  return body;
}

function privateBody() {
  const body = privatePlayerV2("userA");
  withLegacy(body.payload as Record<string, unknown>);
  return body;
}

beforeEach(() => {
  backend = { activeRound: 1, resolved: {}, legacyKeys: false, calls: [] };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    backend.calls.push(`${init.method ?? "GET"} ${u}`);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: backend.activeRound, server_time: T,
        payload: withLegacy({
          match_status: "active", match_over: false,
          public: publicBody(), private: privateBody(),
          latest_resolved_round: null, result: null,
        }),
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
    if (/\/matches\/m1$/.test(u) && (init.method ?? "GET") === "GET") return json(publicBody());
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

function advanceRound() {
  backend.resolved[backend.activeRound] = resolvedPayload(backend.activeRound);
  backend.activeRound += 1;
}

/** Anything the retired Level 2 prompt ever drew. */
function levelTwoPromptVisible(): boolean {
  if (document.querySelector(
    '[data-testid="ranked-progression"], [data-testid="level-up-panel"], [data-kind="level2-choice"]'))
    return true;
  if (document.querySelector('[data-testid^="level-option-"]')) return true;
  return /level 2|choose your|level-up choice/i.test(document.body.textContent ?? "");
}

async function playThreeRounds() {
  render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  let sawPrompt = levelTwoPromptVisible();
  for (let next = 2; next <= 4; next += 1) {
    advanceRound();
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline
      && !(screen.queryByTestId("ranked-question")?.textContent ?? "").includes(`Round ${next}`)) {
      await new Promise((r) => setTimeout(r, 20));
      sawPrompt ||= levelTwoPromptVisible();
    }
    await waitFor(() =>
      expect(screen.getByTestId("ranked-question")).toHaveTextContent(`Round ${next}`),
    { timeout: 1000 });
    sawPrompt ||= levelTwoPromptVisible();
  }
  return sawPrompt;
}

describe("an ordinary Ranked match has no Level 2 prompt", () => {
  it("plays across rounds without ever rendering a Level 2 prompt", async () => {
    const sawPrompt = await playThreeRounds();
    expect(sawPrompt).toBe(false);
    // Still the ordinary match, still live and answerable.
    expect(screen.getByTestId("answer-grid")).toBeInTheDocument();
    expect(backend.calls.some((c) => c.includes("level-two-choice"))).toBe(false);
  }, 30000);

  it("ignores the retired progression keys from an older backend", async () => {
    backend.legacyKeys = true;
    const sawPrompt = await playThreeRounds();
    expect(sawPrompt).toBe(false);
    // The legacy layer those keys used to switch on stays off too.
    expect(screen.queryByTestId("ranked-abilities")).toBeNull();
    expect(screen.getByTestId("combatant-userA")).toHaveAttribute("data-progression", "false");
    expect(backend.calls.some((c) => c.includes("level-two-choice"))).toBe(false);
  }, 30000);
});
