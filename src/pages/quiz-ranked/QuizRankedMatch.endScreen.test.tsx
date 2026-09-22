/**
 * RE1 — THE RANKED END SCREEN, through the real controller.
 *
 * A finished ten-module points match is served exactly as the backend serves
 * one after a refresh: a completed resume, the result row, and one resolved
 * settlement per module for the resume backfill to recover. What is asserted
 * is what a player sees:
 *
 *   * the outcome word and the RESULT ROW's final score (deliberately not the
 *     sum of the module history, which is set to disagree);
 *   * all ten modules for BOTH players, in one grid, placed by module number —
 *     module 10 included, whose settlement ends the match `segments_complete`;
 *   * a withheld settlement keeping its column, neutral, with nothing shifted;
 *   * the two role mascots, including a same-role bot and a role-less seat;
 *   * the opponent's name only where the backend states one.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import {
  matchResultPointsV1, modulePointsBlock, privatePlayerV2, publicRoundV2, withPointsScoring,
} from "@/lib/ranked-public/fixtures";

const T = "2026-07-18T12:00:00+00:00";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

/** Per-module [base, speed] for each seat. Module 5 is a +4 Meta Reflex. */
const VIEWER: [number, number][] = [
  [2, 1], [0, 0], [3, 0], [2, 1], [4, 0], [2, 0], [2, 1], [3, 0], [0, 0], [2, 1]];
const OPPONENT: [number, number][] = [
  [0, 0], [2, 1], [2, 0], [0, 0], [2, 0], [0, 0], [2, 1], [3, 0], [2, 0], [0, 0]];

let cfg: {
  finalScores: Record<string, number>;
  winner: string | null;
  bot: boolean;
  viewerRole: string | null;
  opponentRole: string | null;
  /** Modules whose settlement the backend will not serve (a partial backfill). */
  gaps: number[];
  opponentName: string | null;
};

function shape<E extends { payload: Record<string, unknown> }>(env: E): E {
  const p = env.payload;
  p.match_over = true;
  p.match_status = "complete";
  p.winner_id = cfg.winner;
  p.completion_reason = "segments_complete";
  p.active_round = null;
  p.completed_rounds = 10;
  p.playtest = { question_bank_mode: "production", is_placeholder: false, is_bot_match: cfg.bot };
  for (const player of p.players as Record<string, unknown>[]) {
    player.role = player.player_id === "userA" ? cfg.viewerRole : cfg.opponentRole;
  }
  return withPointsScoring(env, {
    moduleNumber: 10, matchLength: 10, modulesCompleted: 10, scores: cfg.finalScores,
  }) as E;
}

function settlement(round: number) {
  const seat = (id: string, [base]: [number, number]) => ({
    player_id: id, class_id: id === "userA" ? "tank" : "mage",
    outcome: base > 0 ? "correct" : "incorrect", submitted_at: T,
    answered_first: id === "userA", timed_out: false, selected_ability_id: null,
    damage: { base_damage_dealt: 0, outgoing_bonus: 0, final_damage_dealt: 0,
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: 0 },
    hp_before: 170, hp_after: 170, reached_zero_hp: false,
    xp_gained: 0, total_xp_after: 0, level_before: 1, level_after: 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null,
    remaining_charges: {},
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 0 },
    combat_lab_unlock_delta_seconds: 0,
  });
  const v = VIEWER[round - 1];
  const o = OPPONENT[round - 1];
  const last = round === 10;
  return {
    schema_version: "ranked_duel.resolved_round.v2", projection_type: "resolved_round",
    match_id: "m1", round_number: round, server_time: T,
    payload: {
      match_id: "m1", round_number: round, question_id: `q${round}`,
      end_reason: "both_answered", started_at: T, original_deadline: T, final_deadline: T,
      pressure_applied: false,
      players: [seat("userA", v), seat("userB", o)],
      next_round_duration_seconds: 30, next_round_duration_delta: 0,
      // The final module ends a points match the way the engine ends every
      // one — `segments_complete` — which the adapter must accept.
      match_over: last, winner_id: last ? cfg.winner : null,
      completion_reason: last ? "segments_complete" : null,
      module_points: modulePointsBlock({
        userA: { base: v[0], speed: v[1] }, userB: { base: o[0], speed: o[1] },
      }),
    },
  };
}

const resultRow = () => matchResultPointsV1(cfg.finalScores, {
  winner: cfg.winner, outcome: cfg.winner === null ? "draw" : "decisive",
});

/** The match review — what the collapsed module timeline is built from. */
const review = () => ({
  schema_version: "ranked_duel.match_review.v1", projection_type: "match_review",
  match_id: "m1", round_number: 10, server_time: T,
  payload: {
    match_id: "m1", final_round_number: 10, round_count: 10,
    rounds: VIEWER.map(([base], i) => ({
      round_number: i + 1, kind: "quiz", module_id: "quiz.v1", category: "items",
      canonical_question_ref: `ranked:t-${i + 1}`, revealed: true,
      icon_hint: { kind: "category", key: "items", icon: null },
      question: { prompt: `Module ${i + 1}`, options: ["A", "B", "C", "D"],
        correct_option_index: 0, explanation: null },
      challenges: null,
      viewer_submission: { answer_index: base > 0 ? 0 : 1, is_correct: base > 0,
        correct_count: null, answered_count: null, challenge_count: null },
    })),
  },
});

beforeEach(() => {
  cfg = {
    // NOT the sum of the history above (24 – 15): the screen must print the
    // result row's figures, never a total it computed from the bubbles.
    finalScores: { userA: 25, userB: 14 },
    winner: "userA", bot: false, viewerRole: "top", opponentRole: "mid",
    gaps: [], opponentName: "Rivalmogz",
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 10, server_time: T,
        payload: {
          match_status: "complete", match_over: true,
          public: shape(publicRoundV2()), private: shape(privatePlayerV2("userA")),
          latest_resolved_round: null,
          result: resultRow(),
        },
      });
    }
    const resolved = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (resolved) {
      const round = Number(resolved[1]);
      return cfg.gaps.includes(round) ? json({}, 404) : json(settlement(round));
    }
    if (u.endsWith("/result")) return json(resultRow());
    if (u.endsWith("/review")) return json(review());
    if (u.includes("/history")) {
      return json({
        schema_version: "ranked_duel.match_history.v1", projection_type: "match_history",
        match_id: null, round_number: null, server_time: T,
        payload: {
          count: 1,
          entries: [{
            match_id: "m1",
            viewer_outcome: cfg.winner === null ? "draw" : cfg.winner === "userA" ? "win" : "loss",
            terminal_reason: "combat", completion_reason: "segments_complete",
            final_round_number: 10, completed_at: T, is_bot_match: cfg.bot,
            viewer_class: "tank", opponent_class: "mage",
            viewer_role: cfg.viewerRole, opponent_role: cfg.opponentRole,
            opponent_display_name: cfg.opponentName, opponent_is_bot: cfg.bot,
            rating_delta: null, rating_after: null,
          }],
        },
      });
    }
    if (u.includes("/presence")) return json({ status: "complete", match_id: "m1", active: false });
    if (u.endsWith("/private")) return json(shape(privatePlayerV2("userA")));
    if (/\/matches\/m1$/.test(u)) return json(shape(publicRoundV2()));
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Mount, and wait until the backfill has placed the last scored module. */
async function endScreen(settledModule = 10) {
  render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match-over");
  await waitFor(() => {
    expect(screen.getByTestId(`module-duel-viewer-${settledModule}`).dataset.slotState)
      .toBe("scored");
    expect(screen.getByTestId(`module-duel-opponent-${settledModule}`).dataset.slotState)
      .toBe("scored");
  }, { timeout: 3000 });
  return screen.getByTestId("ranked-result-duel");
}

const bubble = (side: "viewer" | "opponent", module: number) =>
  screen.getByTestId(`module-duel-bubble-${side}-${module}`);

describe("the outcome is obvious, and the score is the result row's", () => {
  it.each([
    ["victory", "userA", /victory/i],
    ["defeat", "userB", /defeat/i],
  ] as const)("%s", async (_word, winner, heading) => {
    cfg.winner = winner;
    cfg.finalScores = winner === "userA" ? { userA: 25, userB: 14 } : { userA: 14, userB: 25 };
    await endScreen();
    expect(screen.getByTestId("match-over-frame").dataset.result).toBe(_word);
    expect(screen.getByTestId("match-over-heading")).toHaveTextContent(heading);
    expect(screen.getByTestId("final-score-you"))
      .toHaveTextContent(String(cfg.finalScores.userA));
    expect(screen.getByTestId("final-score-opponent"))
      .toHaveTextContent(String(cfg.finalScores.userB));
  });

  it("draw", async () => {
    cfg.winner = null;
    cfg.finalScores = { userA: 20, userB: 20 };
    await endScreen();
    expect(screen.getByTestId("match-over-frame").dataset.result).toBe("draw");
    expect(screen.getByTestId("match-over-heading")).toHaveTextContent(/draw/i);
    expect(screen.getByTestId("final-score-you")).toHaveTextContent("20");
    expect(screen.getByTestId("final-score-opponent")).toHaveTextContent("20");
  });

  it("prints the result row's score directly, never a total of the module history", async () => {
    await endScreen();
    // The bubbles sum to 24 – 15; the result row says 25 – 14.
    expect(screen.getByTestId("final-score-you")).toHaveTextContent("25");
    expect(screen.getByTestId("final-score-opponent")).toHaveTextContent("14");
  });
});

describe("the full match, head to head, aligned by module number", () => {
  it("keeps module 10, whose settlement ends the match `segments_complete`", async () => {
    await endScreen(10);
    expect(bubble("viewer", 10).dataset.basePoints).toBe("2");
    expect(bubble("viewer", 10).dataset.speedBonus).toBe("true");
    expect(bubble("opponent", 10).dataset.basePoints).toBe("0");
  });

  it("renders all ten modules for BOTH players", async () => {
    await endScreen();
    expect(screen.getByTestId("module-duel").dataset.moduleCount).toBe("10");
    for (let m = 1; m <= 10; m += 1) {
      expect(bubble("viewer", m).dataset.basePoints).toBe(String(VIEWER[m - 1][0]));
      expect(bubble("opponent", m).dataset.basePoints).toBe(String(OPPONENT[m - 1][0]));
    }
  });

  it("puts module N of both rows on the same grid track", async () => {
    await endScreen();
    const grid = screen.getByTestId("module-duel");
    const cells = Array.from(grid.querySelectorAll<HTMLElement>("[role='cell']"));
    const v = cells.filter((c) => c.dataset.testid?.startsWith("module-duel-viewer-"));
    const o = cells.filter((c) => c.dataset.testid?.startsWith("module-duel-opponent-"));
    // One grid, one row after the other: the i-th cell of each row sits on
    // track i, so equal module sequences ARE equal columns.
    expect(v.map((c) => Number(c.dataset.module))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(o.map((c) => c.dataset.module)).toEqual(v.map((c) => c.dataset.module));
    expect(grid.style.gridTemplateColumns).toContain("repeat(10,");
  });

  it("keeps a withheld module's column, neutral, and shifts nothing after it", async () => {
    cfg.gaps = [4, 7];
    await endScreen();
    for (const m of [4, 7]) {
      for (const side of ["viewer", "opponent"] as const) {
        expect(screen.getByTestId(`module-duel-${side}-${m}`).dataset.slotState).toBe("missing");
        // Neutral, never a fabricated zero.
        expect(bubble(side, m).dataset.basePoints).toBe("none");
        expect(bubble(side, m)).toHaveTextContent("—");
        expect(bubble(side, m).className).not.toContain("destructive");
      }
    }
    // Module 5 is still module 5 — the +4 did not slide into column 4.
    expect(bubble("viewer", 5).dataset.basePoints).toBe("4");
    expect(bubble("viewer", 8).dataset.basePoints).toBe("3");
    expect(bubble("opponent", 8).dataset.basePoints).toBe("3");
    expect(screen.getByTestId("module-duel").dataset.moduleCount).toBe("10");
  });

  it("keeps the bubble's meaning: base as the number, speed as a separate dot, +0 red", async () => {
    await endScreen();
    // Module 1: 2 base + 1 speed → "+2" with the dot, never "+3".
    expect(bubble("viewer", 1)).toHaveTextContent("+2");
    expect(bubble("viewer", 1)).not.toHaveTextContent("+3");
    expect(within(bubble("viewer", 1)).getByTestId("module-bubble-speed")).toBeTruthy();
    expect(bubble("viewer", 1).className).toContain("emerald");
    // Module 2: a zero is "+0", red, with no dot.
    expect(bubble("viewer", 2)).toHaveTextContent("+0");
    expect(bubble("viewer", 2).className).toContain("destructive");
    expect(within(bubble("viewer", 2)).queryByTestId("module-bubble-speed")).toBeNull();
  });
});

describe("both duelists, as themselves", () => {
  it("draws each seat's own role mascot, both turned to the centre", async () => {
    const duel = await endScreen();
    const you = within(duel).getByTestId("result-duelist-mascot");
    const opp = within(duel).getByTestId("result-duelist-mascot-opponent");
    expect(you.dataset.role).toBe("top");
    expect(you.dataset.facing).toBe("right");
    expect(opp.dataset.role).toBe("mid");
    expect(opp.dataset.facing).toBe("left");
    expect(within(duel).getByTestId("result-contestant")).toHaveTextContent(/top/i);
    expect(within(duel).getByTestId("result-contestant-opponent")).toHaveTextContent(/mid/i);
  });

  it("gives a same-role bot the viewer's own role art, and calls it Bot", async () => {
    cfg.bot = true;
    cfg.viewerRole = "adc";
    cfg.opponentRole = "adc";
    cfg.opponentName = null;
    const duel = await endScreen();
    expect(within(duel).getByTestId("result-duelist-mascot").dataset.role).toBe("adc");
    expect(within(duel).getByTestId("result-duelist-mascot-opponent").dataset.role).toBe("adc");
    expect(within(duel).queryByTestId("result-duelist-neutral-opponent")).toBeNull();
    expect(within(duel).getByTestId("result-contestant-opponent")).toHaveTextContent("Bot");
    expect(screen.getByTestId("match-over-frame").textContent).toContain("Unrated");
  });

  it("falls back to the neutral emblem only for a seat whose role is genuinely null", async () => {
    cfg.opponentRole = null;
    const duel = await endScreen();
    expect(within(duel).getByTestId("result-duelist-neutral-opponent")).toBeTruthy();
    expect(within(duel).queryByTestId("result-duelist-mascot-opponent")).toBeNull();
    expect(within(duel).getByTestId("result-duelist-figure-opponent").dataset.role).toBe("none");
    expect(within(duel).getByTestId("result-duelist-mascot").dataset.role).toBe("top");
  });

  it("names a human opponent only as the backend's own history row does", async () => {
    const duel = await endScreen();
    await waitFor(() => expect(within(duel).getByTestId("result-contestant-opponent"))
      .toHaveTextContent("Rivalmogz"));
  });

  it("invents no name when the backend withheld it", async () => {
    cfg.opponentName = null;
    const duel = await endScreen();
    await new Promise((r) => setTimeout(r, 30));
    expect(within(duel).getByTestId("result-contestant-opponent")).toHaveTextContent("Opponent");
  });
});

describe("the secondary content is compact", () => {
  it("folds report, timeline and discoveries into closed details; actions on one row", async () => {
    await endScreen();
    const details = screen.getByTestId("result-details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    // Everything is still there, one click away.
    expect(within(details).getByTestId("result-timeline")).toBeTruthy();
    expect(screen.getByTestId("result-details-toggle")).toHaveTextContent("10 modules");
    expect(screen.getByTestId("result-summary-strip")).toBeTruthy();
    expect(screen.getByTestId("result-actions").dataset.layout).toBe("inline");
    expect(screen.getByTestId("result-primary")).toHaveTextContent("Play Again");
    expect(screen.getByTestId("result-secondary")).toHaveTextContent("Review Match");
    expect(screen.getByTestId("result-tertiary")).toHaveTextContent("Back to Leaguecraft");
  });
});
