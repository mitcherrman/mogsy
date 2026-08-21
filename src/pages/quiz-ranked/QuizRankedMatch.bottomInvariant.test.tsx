/**
 * THE BOTTOM INVARIANT.
 *
 * RG's arena layout is fixed: the top strip is match state, the centre is the
 * question, the two rails are the duelists, and the BOTTOM is the round
 * timeline's — continuously, not "when nothing else wants it".
 *
 * This file exists because that invariant was broken twice, each time by a
 * surface that looked small enough to be an exception. `RevealBanner` was
 * gated to the ~1.5s settlement beat and still flashed a full-width bar under
 * every ordinary round. `SegmentResultBanner` was then kept for Meta Reflex
 * alone, on the argument that a block settles rarely and carries information
 * the top HUD could not express — the second half of which was true, and the
 * first half of which is not a reason. Both are gone; the vocabulary moved up
 * instead.
 *
 * So this asserts the invariant DIRECTLY, across both settlement kinds and
 * every phase of a round's life, rather than trusting each surface's own tests
 * to notice a bar reappearing. It is deliberately its own file: a future
 * exception should have to delete a test named after the rule.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  segmentMeta: unknown;
  segmentState: unknown;
  roundNumber: number;
  /** Settlement payload for `roundNumber - 1`, or null when nothing settled. */
  resolved: Record<number, unknown>;
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });

/** The ordinary Ranked question — a quiz segment. */
const QUIZ_SEGMENT = {
  module_id: "quiz", module_version: 1, challenge_count: 1, challenge_index: 0,
};

function publicBody() {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.segment = backend.segmentMeta;
  payload.segment_state = backend.segmentState;
  payload.completed_rounds = backend.roundNumber - 1;
  (payload.active_round as Record<string, unknown>).round_number = backend.roundNumber;
  return body;
}

function privateBody() {
  const body = privatePlayerV2("userA");
  const payload = body.payload as Record<string, unknown>;
  payload.segment = backend.segmentMeta;
  payload.segment_state = backend.segmentState;
  return body;
}

/** An ordinary quiz settlement for round `n`: the viewer answers correctly. */
function quizResolvedPayload(n: number) {
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
    players: [player("userA", true), player("userB", false)],
    next_round_duration_seconds: 30, next_round_duration_delta: 0,
    match_over: false, winner_id: null, completion_reason: null,
  };
}

beforeEach(() => {
  backend = {
    segmentMeta: QUIZ_SEGMENT, segmentState: null, roundNumber: 4, resolved: {},
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
}

/** Settle the open round with `payload` and open the next one. */
function settle(payload: unknown) {
  backend.resolved[backend.roundNumber] = payload;
  backend.roundNumber += 1;
}

const holdActive = () =>
  screen.getByTestId("ranked-match").getAttribute("data-reveal-hold") === "true";

/**
 * EVERY result surface that has ever occupied the bottom of the arena. A new
 * one must be added here, not quietly rendered.
 */
const BOTTOM_RESULT_SURFACES = [
  "reveal-panel",          // RevealBanner / RevealPanel — ordinary rounds
  "reveal-panel-details",  // its Details expansion
  "icd-result-banner",     // SegmentResultBanner — Meta Reflex / Item Cost Duel
  "icd-transcript",        // the transcript it used to hold in flow
];

/**
 * The two structural regions the arena is allowed to END with. A quiz round
 * ends at the lower HUD row (ability tray + status line); a module that owns
 * its own submission — Meta Reflex does — renders no HUD row at all, so the
 * arena ends at the three-column grid. Anything else after either of them is
 * something taking the timeline's space.
 */
const isKnownLastRegion = (el: Element) =>
  el.querySelector('[data-testid="submission-status"]') !== null
  || el.querySelector('[data-testid="ranked-focus-column"]') !== null;

/**
 * The invariant itself: no result surface anywhere in the arena, and the arena
 * ends at one of its two known structural regions rather than at a result
 * panel appended after them.
 */
function expectBottomFreeOfResults(phase: string) {
  for (const id of BOTTOM_RESULT_SURFACES) {
    expect(screen.queryByTestId(id), `${id} present during ${phase}`).toBeNull();
  }
  const last = screen.getByTestId("ranked-match").lastElementChild!;
  expect(
    isKnownLastRegion(last),
    `arena ends on something other than the HUD row or the grid during ${phase}`,
  ).toBe(true);
}

describe("the bottom of the arena holds no result surface — ordinary rounds", () => {
  it("stays free before, during and after a quiz settlement", async () => {
    await mount();
    await screen.findByTestId("answer-grid");
    expectBottomFreeOfResults("a live round, nothing settled");

    settle(quizResolvedPayload(4));
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 6000 });
    // The beat is exactly when the bar used to flash.
    expectBottomFreeOfResults("the settlement beat");
    // ...and the result IS on screen, in the strip.
    expect(screen.getByTestId("ranked-last-result"))
      .toHaveAttribute("data-mode", "round");

    await waitFor(() => expect(holdActive()).toBe(false), { timeout: 6000 });
    expectBottomFreeOfResults("the next round, live");

    // A second settlement, in case anything only leaks on a REPLACED result.
    settle(quizResolvedPayload(5));
    await waitFor(() => expect(screen.getByTestId("ranked-last-result"))
      .toHaveAttribute("data-round", "5"), { timeout: 6000 });
    expectBottomFreeOfResults("a replaced result");
  });
});

describe("the bottom of the arena holds no result surface — Meta Reflex", () => {
  beforeEach(() => {
    backend.segmentMeta = metaReflexSegmentMeta();
    backend.segmentState = metaReflexState(4);
  });

  it("stays free through the cards, the block settlement and the next round", async () => {
    await mount();
    await screen.findByTestId("mr-block");
    expectBottomFreeOfResults("the Meta Reflex cards");

    settle(metaReflexResolvedPayload());
    backend.segmentMeta = QUIZ_SEGMENT;
    backend.segmentState = null;

    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 6000 });
    // THE CASE THIS FILE EXISTS FOR: a settled block used to put a full-width
    // bar here on the argument that it settles rarely.
    expectBottomFreeOfResults("the block settlement beat");
    const beat = screen.getByTestId("ranked-last-result");
    expect(beat).toHaveAttribute("data-mode", "segment");
    expect(beat).toHaveTextContent("YOU 4/5");

    await waitFor(() => expect(holdActive()).toBe(false), { timeout: 6000 });
    expectBottomFreeOfResults("the round after the block");
  });

  it("stays free even with the card-by-card transcript OPEN", async () => {
    // The transcript is the one thing the retired bar owned that a 2.5rem
    // plate cannot hold. Its new home is a disclosure hung off the HEADER —
    // if it ever drifts back into the arena's bottom region, this fails.
    await mount();
    await screen.findByTestId("mr-block");
    settle(metaReflexResolvedPayload());
    backend.segmentMeta = QUIZ_SEGMENT;
    backend.segmentState = null;
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 6000 });

    fireEvent.click(screen.getByTestId("segment-details-toggle"));
    const popover = screen.getByTestId("segment-details-popover");
    expect(popover).toBeInTheDocument();
    // It hangs off the header...
    expect(screen.getByTestId("ranked-header").parentElement!.contains(popover))
      .toBe(true);
    // ...and the arena still ends on one of its own regions, with the
    // transcript nowhere inside it.
    const last = screen.getByTestId("ranked-match").lastElementChild!;
    expect(last.contains(popover)).toBe(false);
    expect(isKnownLastRegion(last)).toBe(true);
    expect(screen.queryByTestId("icd-result-banner")).toBeNull();
  });
});

describe("the bottom region is structurally available for the timeline", () => {
  it("ends the arena at the HUD row, with nothing after it", async () => {
    await mount();
    await screen.findByTestId("answer-grid");
    settle(quizResolvedPayload(4));
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 6000 });

    const shell = screen.getByTestId("ranked-match");
    const children = Array.from(shell.children);
    // The arena ends at the lower HUD row, and NOTHING follows it. The next
    // phase's timeline appends here; today that slot is simply empty, which is
    // the whole point of the invariant.
    const last = children[children.length - 1];
    expect(last.querySelector('[data-testid="submission-status"]')).not.toBeNull();
    for (const id of BOTTOM_RESULT_SURFACES) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    // Every child is a region the arena is supposed to have — no stray panel
    // has been appended between them either.
    for (const child of children) {
      const known = child.querySelector('[data-testid="ranked-header"]') !== null
        || child.getAttribute("data-testid") === "ranked-header"
        || isKnownLastRegion(child)
        || child.className.includes("sm:hidden");   // the mobile presence line
      expect(known, `unexpected arena child: ${child.className}`).toBe(true);
    }
  });
});
