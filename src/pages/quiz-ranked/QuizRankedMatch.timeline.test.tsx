/**
 * RG — the round timeline INSIDE the live arena.
 *
 * The model and the component are pinned on their own; this file is about the
 * seam: that the strip is wired to the arena's real state, that it SLIDES as a
 * real match advances while the current marker holds its position, that it
 * survives both settlement beats, and that the only segment identity it ever
 * shows is one the server actually supplied.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import {
  metaReflexResolvedPayload, metaReflexSegmentMeta, metaReflexState,
  privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";

const T = "2026-07-18T12:00:08+00:00";

interface Backend {
  segmentMeta: Record<string, unknown>;
  segmentState: unknown;
  roundNumber: number;
  resolved: Record<number, unknown>;
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });

const QUIZ_SEGMENT = {
  module_id: "quiz", module_version: 1, challenge_count: 1, challenge_index: 0,
};

function publicBody() {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.segment = { ...backend.segmentMeta, segment_number: backend.roundNumber };
  payload.segment_state = backend.segmentState;
  payload.completed_rounds = backend.roundNumber - 1;
  (payload.active_round as Record<string, unknown>).round_number = backend.roundNumber;
  return body;
}

function privateBody() {
  const body = privatePlayerV2("userA");
  const payload = body.payload as Record<string, unknown>;
  payload.segment = { ...backend.segmentMeta, segment_number: backend.roundNumber };
  payload.segment_state = backend.segmentState;
  return body;
}

function quizResolvedPayload(n: number, viewerCorrect = true) {
  const player = (id: string, correct: boolean) => ({
    player_id: id, class_id: "tank",
    outcome: correct ? "correct" : "incorrect",
    submitted_at: T, answered_first: correct, timed_out: false,
    selected_ability_id: null,
    damage: {
      base_damage_dealt: correct ? 14 : 0, outgoing_bonus: 0,
      final_damage_dealt: correct ? 14 : 0,
      shield_absorbed: 0, incoming_reduction: 0,
      final_damage_received: correct ? 0 : 14,
    },
    hp_before: 170, hp_after: correct ? 170 : 156, reached_zero_hp: false,
    xp_gained: 0, total_xp_after: 0, level_before: 1, level_after: 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null,
    remaining_charges: {},
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 1 },
    combat_lab_unlock_delta_seconds: 0,
  });
  return {
    match_id: "m1", round_number: n, question_id: "q1",
    end_reason: "both_answered", started_at: T, original_deadline: T,
    final_deadline: T, pressure_applied: false,
    players: [player("userA", viewerCorrect), player("userB", !viewerCorrect)],
    next_round_duration_seconds: 30, next_round_duration_delta: 0,
    match_over: false, winner_id: null, completion_reason: null,
  };
}

beforeEach(() => {
  backend = {
    segmentMeta: QUIZ_SEGMENT, segmentState: null, roundNumber: 3, resolved: {},
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: backend.roundNumber, server_time: T,
        payload: {
          match_status: "active", match_over: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [],
          latest_resolved_round: null, result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) {
      return json({ status: "active", match_id: "m1", active: true });
    }
    const settled = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (settled) {
      const payload = backend.resolved[Number(settled[1])];
      if (!payload) return json({ detail: "not ready" }, 404);
      return json({
        schema_version: "ranked_duel.resolved_round.v2",
        projection_type: "resolved_round", match_id: "m1",
        round_number: Number(settled[1]), server_time: T, payload,
      });
    }
    if (/\/matches\/m1$/.test(u)) return json(publicBody());
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mount() {
  render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  return screen.findByTestId("ranked-round-timeline");
}

function settle(payload: unknown) {
  backend.resolved[backend.roundNumber] = payload;
  backend.roundNumber += 1;
}

const strip = () => screen.getByTestId("ranked-round-timeline");
const node = (r: number) => screen.getByTestId(`timeline-node-${r}`);
const marker = () => screen.getByTestId("ranked-timeline-marker");
const visibleRounds = () => screen.getAllByRole("listitem")
  .filter((li) => li.getAttribute("data-visible") === "true")
  .map((li) => Number(li.getAttribute("data-round")));
const holdActive = () =>
  screen.getByTestId("ranked-match").getAttribute("data-reveal-hold") === "true";

/** Settle the open round and wait for the arena to pick the next one up. */
async function advance(payload: unknown) {
  const next = backend.roundNumber + 1;
  settle(payload);
  await waitFor(() => expect(strip()).toHaveAttribute("data-current-round", String(next)),
    { timeout: 8000 });
}

describe("the timeline is wired to the live arena", () => {
  it("renders one bounded window and points at the live round", async () => {
    await mount();
    expect(visibleRounds()).toHaveLength(9);
    await waitFor(() => expect(strip()).toHaveAttribute("data-current-round", "3"));
    // Round 3 is still in the opening walk-out: window starts at 1.
    expect(strip()).toHaveAttribute("data-window-start", "1");
    expect(strip()).toHaveAttribute("data-anchored", "false");
    expect(visibleRounds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(node(3)).toHaveAttribute("data-state", "current");
    expect(node(1)).toHaveAttribute("data-state", "resolved");
    expect(node(4)).toHaveAttribute("data-state", "upcoming");
  });

  it("settles the resolved node's verdict as the marker moves on", async () => {
    await mount();
    await screen.findByTestId("answer-grid");
    await advance(quizResolvedPayload(3, true));

    expect(node(4)).toHaveAttribute("data-state", "current");
    expect(node(3)).toHaveAttribute("data-state", "resolved");
    // The verdict comes off the SAME bounded ledger the duelist columns read.
    await waitFor(() => expect(node(3)).toHaveAttribute("data-outcome", "correct"),
      { timeout: 6000 });
    expect(visibleRounds()).toHaveLength(9);
  });

  it("stays mounted through the settlement beat, unchanged in size", async () => {
    await mount();
    await screen.findByTestId("answer-grid");
    settle(quizResolvedPayload(3, false));
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 8000 });
    expect(strip()).toBeInTheDocument();
    expect(visibleRounds()).toHaveLength(9);
    await waitFor(() => expect(holdActive()).toBe(false), { timeout: 8000 });
    expect(strip()).toBeInTheDocument();
    expect(visibleRounds()).toHaveLength(9);
    await waitFor(() => expect(node(3)).toHaveAttribute("data-outcome", "incorrect"),
      { timeout: 6000 });
  });
});

describe("THE ACCEPTANCE CRITERION — the track slides, the marker does not", () => {
  it("holds the marker's slot while the rounds move underneath it", async () => {
    // Start already past the opening walk-out, then play three rounds.
    backend.roundNumber = 9;
    await mount();
    await waitFor(() => expect(strip()).toHaveAttribute("data-current-round", "9"));
    expect(strip()).toHaveAttribute("data-anchored", "true");

    const anchored = marker().style.transform;
    const seen: number[][] = [visibleRounds()];

    for (const round of [9, 10, 11]) {
      await screen.findByTestId("answer-grid");
      await advance(quizResolvedPayload(round, round % 2 === 1));
      // The marker is parked in EXACTLY the same place, every time.
      expect(marker().style.transform, `after round ${round}`).toBe(anchored);
      expect(strip()).toHaveAttribute("data-anchored", "true");
      seen.push(visibleRounds());
    }

    // ...and the window moved one round per advance, never more, never back.
    expect(seen).toEqual([
      [5, 6, 7, 8, 9, 10, 11, 12, 13],
      [6, 7, 8, 9, 10, 11, 12, 13, 14],
      [7, 8, 9, 10, 11, 12, 13, 14, 15],
      [8, 9, 10, 11, 12, 13, 14, 15, 16],
    ]);
    expect(node(12)).toHaveAttribute("data-state", "current");
  });

  it("crosses round 12 into 13 as one ordinary slide, with no reset", async () => {
    backend.roundNumber = 12;
    await mount();
    await waitFor(() => expect(strip()).toHaveAttribute("data-window-start", "8"));
    const anchored = marker().style.transform;
    expect(visibleRounds()).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);

    await screen.findByTestId("answer-grid");
    await advance(quizResolvedPayload(12, true));

    // One step. Not a rebase, not a jump back to slot 0, no "wave 2".
    expect(strip()).toHaveAttribute("data-window-start", "9");
    expect(marker().style.transform).toBe(anchored);
    expect(visibleRounds()).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(node(13)).toHaveAttribute("data-state", "current");
    expect(strip().textContent ?? "").not.toMatch(/wave/i);
  });

  it("behaves identically deep into a long match", async () => {
    backend.roundNumber = 137;
    await mount();
    await waitFor(() => expect(strip()).toHaveAttribute("data-current-round", "137"));
    expect(visibleRounds()).toEqual([133, 134, 135, 136, 137, 138, 139, 140, 141]);
    expect(strip()).toHaveAttribute("data-anchored", "true");
    expect(node(137)).toHaveAttribute("data-state", "current");
  });
});

describe("future rounds claim nothing", () => {
  it("leaves every upcoming node neutral, including the schedule's old slots", async () => {
    // Rounds 4 and 9 are where the retired twelve-slot pacing model predicted
    // Meta Reflex blocks. The server has said nothing about them, so neither
    // does the strip.
    await mount();
    await waitFor(() => expect(strip()).toHaveAttribute("data-current-round", "3"));
    for (const round of [4, 5, 6, 7, 8, 9]) {
      expect(node(round), `round ${round}`).toHaveAttribute("data-segment", "");
      expect(node(round)).toHaveAttribute("data-outcome", "");
      expect(node(round)).toHaveAttribute("data-state", "upcoming");
    }
    expect(screen.getByText("Round 9, upcoming")).toBeInTheDocument();
  });
});

describe("Meta Reflex on the timeline", () => {
  beforeEach(() => {
    backend.roundNumber = 6;
    backend.segmentMeta = metaReflexSegmentMeta() as unknown as Record<string, unknown>;
    backend.segmentState = metaReflexState(0);
  });

  it("marks the live block's node from the server's own segment", async () => {
    await mount();
    await screen.findByTestId("mr-block");
    await waitFor(() => expect(node(6)).toHaveAttribute("data-segment", "meta-reflex"));
    expect(node(6)).toHaveAttribute("data-state", "current");
    // No other node is claimed — not the one a schedule would have predicted.
    for (const round of [7, 8, 9, 10]) {
      expect(node(round), `round ${round}`).toHaveAttribute("data-segment", "");
    }
  });

  it("PRESERVES the mark as the block travels into history", async () => {
    await mount();
    await screen.findByTestId("mr-block");
    await waitFor(() => expect(node(6)).toHaveAttribute("data-segment", "meta-reflex"));

    settle(metaReflexResolvedPayload());
    backend.segmentMeta = QUIZ_SEGMENT;
    backend.segmentState = null;

    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 8000 });
    // The strip is present for the whole of the block's settlement beat...
    expect(strip()).toBeInTheDocument();
    await waitFor(() => expect(strip()).toHaveAttribute("data-current-round", "7"),
      { timeout: 8000 });
    expect(node(6)).toHaveAttribute("data-state", "resolved");
    expect(node(6)).toHaveAttribute("data-segment", "meta-reflex");

    // ...and TWO ordinary rounds later it is still marked, even though
    // `lastSegmentSettlement` has long since stopped being the news. (No wait
    // on the answer grid here: the question surface deliberately lags a block
    // boundary, and the strip does not — which is part of the point.)
    await advance(quizResolvedPayload(7, true));
    await advance(quizResolvedPayload(8, false));
    expect(node(6)).toHaveAttribute("data-segment", "meta-reflex");
    expect(node(6)).toHaveAttribute("data-state", "resolved");
    expect(node(7)).toHaveAttribute("data-segment", "standard");

    // The block's 5-card scoreline stays where it belongs: the top beat.
    expect(strip().textContent ?? "").not.toMatch(/\d\s*\/\s*5/);
  });
});
