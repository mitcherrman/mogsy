/**
 * RA1 Phase 1.2–1.4: round-boundary lifecycle, settlement capture, reveal beat.
 *
 * These assert the three defects the audit found, plus the presentation hold
 * that replaced "the reveal and the next question arrive in the same frame":
 *
 *  1.2 — the question surface stays MOUNTED across a round boundary, so the
 *        scenario media loop and the answer grid's entrance are not restarted
 *        by a polling gap;
 *  1.3 — a settlement is captured with ids taken from the snapshot being
 *        adapted, so reveals survive resume and timeout-resolved rounds, and
 *        the opponent is never nameless;
 *  1.4 — the reveal is introduced BEFORE the next round becomes interactive,
 *        is not suppressed by an owed level-2 choice, and needs no click.
 *
 * Authority is never asserted locally: every phase change here still comes from
 * a backend snapshot, and the hold only withholds a CLICK.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { REVEAL_HOLD_MS } from "./useRankedMatch";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

const T = "2026-07-18T12:00:00+00:00";

interface Backend {
  /** Round the server currently reports as active. */
  activeRound: number;
  hasSubmitted: boolean;
  progressionPending: string[];
  /** Resolved payloads keyed by round number. */
  resolved: Record<number, unknown>;
  /** What /resume replays as `latest_resolved_round`. */
  latestResolved: unknown | null;
  resolvedRequests: number[];
  submissions: unknown[];
  leveledUp: boolean;
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });

/** A minimal, contract-shaped resolved round for userA (p1) vs userB (p2). */
function resolvedPayload(round: number, opts: { leveledUp?: boolean; timedOut?: boolean } = {}) {
  const player = (id: string, over: Record<string, unknown> = {}) => ({
    player_id: id, class_id: id === "userA" ? "tank" : "mage",
    // Backend enum spelling is "timeout"; the adapter maps it to "timed_out".
    outcome: opts.timedOut && id === "userA" ? "timeout" : "correct",
    submitted_at: opts.timedOut && id === "userA" ? null : T,
    answered_first: id === "userA" && !opts.timedOut,
    timed_out: Boolean(opts.timedOut && id === "userA"),
    selected_ability_id: null,
    damage: {
      base_damage_dealt: 10, outgoing_bonus: 0, final_damage_dealt: 10,
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: 10,
    },
    hp_before: 170, hp_after: 160, reached_zero_hp: false,
    xp_gained: 10, total_xp_after: 10,
    level_before: 1, level_after: opts.leveledUp && id === "userA" ? 2 : 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null,
    remaining_charges: { "tank.fortify": 3 },
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 1 },
    combat_lab_unlock_delta_seconds: 0,
    ...over,
  });
  return {
    match_id: "m1", round_number: round, question_id: "q1",
    end_reason: opts.timedOut ? "deadline_expired" : "both_answered",
    started_at: T, original_deadline: T, final_deadline: T, pressure_applied: false,
    players: [player("userA"), player("userB")],
    next_round_duration_seconds: 30, next_round_duration_delta: 0,
    match_over: false, winner_id: null, completion_reason: null,
  };
}

function publicBody() {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.progression_pending_players = backend.progressionPending;
  payload.completed_rounds = backend.activeRound - 1;
  (payload.active_round as Record<string, unknown>).round_number = backend.activeRound;
  // A distinct question per round proves the surface swapped content without
  // the section having been unmounted.
  (payload.question as Record<string, unknown>).question_id = `q${backend.activeRound}`;
  (payload.question as Record<string, unknown>).prompt =
    `Round ${backend.activeRound} — which item grants Immolate?`;
  for (const p of payload.players as Record<string, unknown>[]) {
    if (p.player_id === "userA") p.has_submitted = backend.hasSubmitted;
  }
  return body;
}

function privateBody() {
  const body = privatePlayerV2("userA");
  const payload = body.payload as Record<string, unknown>;
  payload.progression_pending_players = backend.progressionPending;
  for (const p of payload.players as Record<string, unknown>[]) {
    if (p.player_id === "userA") p.has_submitted = backend.hasSubmitted;
  }
  return body;
}

beforeEach(() => {
  backend = {
    activeRound: 1, hasSubmitted: false, progressionPending: [],
    resolved: {}, latestResolved: null, resolvedRequests: [],
    submissions: [], leveledUp: false,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: backend.activeRound, server_time: T,
        payload: {
          match_status: "active", match_over: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: backend.progressionPending,
          latest_resolved_round: backend.latestResolved, result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (u.includes("/submission")) {
      backend.submissions.push(JSON.parse(init.body as string));
      backend.hasSubmitted = true;
      return json({ status: "accepted" });
    }
    const resolvedMatch = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (resolvedMatch) {
      const round = Number(resolvedMatch[1]);
      backend.resolvedRequests.push(round);
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

/** Advance the server to the next round, with round N's settlement available. */
function advanceRound(opts: { leveledUp?: boolean; timedOut?: boolean } = {}) {
  backend.resolved[backend.activeRound] = resolvedPayload(backend.activeRound, opts);
  backend.activeRound += 1;
  backend.hasSubmitted = false;
}

const questionSection = () => screen.getByTestId("ranked-question");
const holdActive = () =>
  screen.getByTestId("ranked-match").getAttribute("data-reveal-hold") === "true";

describe("RA1 1.2 — the question surface survives a round boundary", () => {
  it("keeps the same question section node mounted across the transition", async () => {
    await mount();
    const first = questionSection();
    expect(first).toHaveTextContent("Round 1");

    advanceRound();
    // The section must be the SAME DOM node afterwards: a remount is what
    // restarted the scenario media loop and replayed the answer stagger.
    await waitFor(() => expect(screen.getByTestId("ranked-question")).toHaveTextContent("Round 2"),
      { timeout: 4000 });
    expect(screen.getByTestId("ranked-question")).toBe(first);
  });

  it("does not unmount the surface while the server reports no active round", async () => {
    await mount();
    const first = questionSection();

    // The between-rounds gap: the backend legitimately reports activeRound null.
    const publicWithoutRound = () => {
      const body = publicBody();
      (body.payload as Record<string, unknown>).active_round = null;
      return body;
    };
    const original = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url);
      if (/\/matches\/m1$/.test(u) && (init.method ?? "GET") === "GET") {
        return json(publicWithoutRound());
      }
      return original(url, init);
    }) as unknown as typeof fetch);

    await new Promise((r) => setTimeout(r, 2200));
    // Still mounted, still showing the round the player was looking at — no
    // blank surface, no remount.
    expect(screen.getByTestId("ranked-question")).toBe(first);
    expect(screen.getByTestId("ranked-question")).toHaveTextContent("Round 1");
  });

  it("keys the answer grid on the question so the entrance plays per question, not per poll", async () => {
    await mount();
    const grid = await screen.findByTestId("answer-grid");
    // Several polls elapse with no content change: the grid must be the same
    // node, i.e. no incidental remount and therefore no replayed animation.
    await new Promise((r) => setTimeout(r, 3300));
    expect(screen.getByTestId("answer-grid")).toBe(grid);

    // A genuine question change DOES rebuild the grid (fresh entrance).
    advanceRound();
    await waitFor(() => expect(screen.getByTestId("ranked-question")).toHaveTextContent("Round 2"),
      { timeout: 6000 });
    await waitFor(() => expect(screen.getByTestId("answer-grid")).not.toBe(grid));
  }, 20000);
});

describe("RA1 1.3 — settlement capture", () => {
  it("captures a timeout-resolved round and names both sides", async () => {
    await mount();
    // The viewer never answered; the round resolved on the deadline.
    advanceRound({ timedOut: true });

    const reveal = await screen.findByTestId("reveal-panel", undefined, { timeout: 4000 });
    expect(reveal).toBeInTheDocument();
    // Both titles resolve — the opponent card used to render a blank title when
    // the adapter was handed an empty p2 id.
    expect(screen.getByTestId("reveal-userA")).toHaveTextContent("You");
    const opponentCard = screen.getByTestId("reveal-userB");
    expect(opponentCard).toHaveTextContent("Opponent");
    expect(opponentCard.textContent ?? "").not.toContain("userB");
  });

  it("restores the reveal on resume after a refresh", async () => {
    // A settlement already exists when the component mounts — the refresh case.
    backend.latestResolved = { payload: resolvedPayload(1) };
    backend.activeRound = 2;
    await mount();

    const reveal = await screen.findByTestId("reveal-panel", undefined, { timeout: 4000 });
    expect(reveal).toBeInTheDocument();
    expect(screen.getByTestId("reveal-userB")).toHaveTextContent("Opponent");
  });

  it("does not re-fetch a round whose settlement failed to adapt", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();
    // A malformed payload: the adapter fails closed on it.
    backend.resolved[1] = { ...resolvedPayload(1), players: [] };
    backend.activeRound = 2;
    backend.hasSubmitted = false;

    await waitFor(() => expect(backend.resolvedRequests).toContain(1), { timeout: 6000 });
    // Logged as the defect it is, not swallowed as "not ready yet"...
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const requestsAfterFirst = backend.resolvedRequests.filter((r) => r === 1).length;
    await new Promise((r) => setTimeout(r, 2200));
    // ...and the round is marked consumed, so polling does not spin on it.
    expect(backend.resolvedRequests.filter((r) => r === 1).length).toBe(requestsAfterFirst);
    spy.mockRestore();
  }, 20000);
});

describe("RA1 1.4 — the reveal beat", () => {
  it("withholds the next question until the beat ends, with no button to press", async () => {
    await mount();
    await screen.findByTestId("answer-grid");
    advanceRound();

    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 4000 });
    expect(screen.getByTestId("reveal-panel")).toBeInTheDocument();
    // The beat is expressed by withholding INPUT, not by removing the question
    // from the layout. It used to be `display:none` here, which collapsed the
    // surface's box and jumped everything below it several hundred pixels
    // (RA1 1.5). The surface stays mounted, in flow, and merely dimmed.
    const question = screen.getByTestId("ranked-question");
    expect(question.className).not.toContain("hidden");
    expect(question.getAttribute("data-input-open")).toBe("false");
    expect(screen.getByTestId("answer-grid")).toBeDisabled();
    // Nothing to click to get past it.
    expect(screen.queryByRole("button", { name: /continue/i })).toBeNull();

    // It clears itself.
    await waitFor(() => expect(holdActive()).toBe(false),
      { timeout: REVEAL_HOLD_MS + 2000 });
    expect(screen.getByTestId("ranked-question").getAttribute("data-input-open")).toBe("true");
  });

  it("refuses an answer for the next round while the beat is running", async () => {
    await mount();
    const options = await screen.findAllByTestId(/^option-/).catch(() => []);
    void options;
    advanceRound();
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 4000 });

    const submissionsDuringHold = backend.submissions.length;
    // The grid is disabled behind a disabled fieldset during the beat.
    const grid = screen.getByTestId("answer-grid");
    expect(grid).toBeDisabled();
    const choice = grid.querySelector("[data-quiz-choice]") as HTMLElement | null;
    if (choice) fireEvent.click(choice);
    await new Promise((r) => setTimeout(r, 100));
    expect(backend.submissions.length).toBe(submissionsDuringHold);
  });

  it("still shows the reveal when a level-2 choice is owed", async () => {
    await mount();
    advanceRound({ leveledUp: true });
    backend.progressionPending = ["userA"];

    await screen.findByTestId("ranked-progression", undefined, { timeout: 4000 });
    // The reveal that EXPLAINS the level-up used to be suppressed in exactly
    // this state.
    expect(screen.getByTestId("reveal-panel")).toBeInTheDocument();
    // HP stays on screen alongside both, so the result reads as one moment.
    expect(screen.getByTestId("combatant-userA")).toBeInTheDocument();
    expect(screen.getByTestId("combatant-userB")).toBeInTheDocument();
  });

  it("never holds a click the player already made — one-click answer is intact", async () => {
    await mount();
    const grid = await screen.findByTestId("answer-grid");
    expect(grid).not.toBeDisabled();  // no hold on the first round
    const choice = grid.querySelector("[data-quiz-choice]") as HTMLElement;
    fireEvent.click(choice);
    // One click submits — no confirm step was introduced by the beat.
    await waitFor(() => expect(backend.submissions).toHaveLength(1));
  });
});
