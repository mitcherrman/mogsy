/**
 * RFX1 Phase 2A — resolution sequencing and authoritative correctness feedback,
 * through the REAL controller (`useRankedMatch`) and the real arena.
 *
 * The server here behaves like `ranked_public`: resolving round N and opening
 * round N+1 happen in ONE snapshot, and N+1's `started_at` sits in the future
 * by the presentation lead-in. `server_time` tracks the real clock so the
 * controller's skew arithmetic is exercised rather than pinned.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

const iso = (ms: number) => new Date(ms).toISOString();

interface Backend {
  activeRound: number;
  startedAt: number;
  hasSubmitted: boolean;
  submittedIndex: number | null;
  resolved: Record<number, unknown>;
  latestResolved: unknown | null;
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Round N's settlement: the viewer's verdict follows the submitted index;
 *  option 0 is the correct one; the opponent's verdict is a parameter. */
function resolvedPayload(round: number, opponent: "correct" | "incorrect" | "timeout") {
  const viewerCorrect = backend.submittedIndex === 0;
  const player = (id: string, outcome: string) => ({
    player_id: id, class_id: id === "userA" ? "tank" : "mage", outcome,
    submitted_at: outcome === "timeout" ? null : iso(Date.now()),
    answered_first: id === "userA", timed_out: outcome === "timeout", selected_ability_id: null,
    damage: { base_damage_dealt: 0, outgoing_bonus: 0, final_damage_dealt: 0,
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: 0 },
    hp_before: 170, hp_after: 170, reached_zero_hp: false, xp_gained: 0, total_xp_after: 0,
    level_before: 1, level_after: 1, level_up_events: [], charge_consumed: false,
    consumed_ability_id: null, remaining_charges: {},
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 0 },
    combat_lab_unlock_delta_seconds: 0,
  });
  return {
    match_id: "m1", round_number: round, question_id: `q${round}`, end_reason: "both_answered",
    started_at: iso(Date.now()), original_deadline: iso(Date.now()), final_deadline: iso(Date.now()),
    pressure_applied: false,
    players: [player("userA", viewerCorrect ? "correct" : "incorrect"), player("userB", opponent)],
    next_round_duration_seconds: 30, next_round_duration_delta: 0,
    match_over: false, winner_id: null, completion_reason: null,
    correct_option_index: 0, option_count: 4,
    module_points: {
      userA: { base_points: viewerCorrect ? 2 : 0, speed_bonus_points: 0,
        points_awarded: viewerCorrect ? 2 : 0, score_before: 0, score_after: viewerCorrect ? 2 : 0 },
      userB: { base_points: opponent === "correct" ? 2 : 0, speed_bonus_points: 0,
        points_awarded: opponent === "correct" ? 2 : 0, score_before: 0,
        score_after: opponent === "correct" ? 2 : 0 },
    },
  };
}

function publicBody() {
  const body = publicRoundV2() as Record<string, unknown>;
  body.server_time = iso(Date.now());
  const payload = body.payload as Record<string, unknown>;
  payload.completed_rounds = backend.activeRound - 1;
  const ar = payload.active_round as Record<string, unknown>;
  ar.round_number = backend.activeRound;
  ar.started_at = iso(backend.startedAt);
  ar.active_deadline = iso(backend.startedAt + 30_000);
  (payload.question as Record<string, unknown>).question_id = `q${backend.activeRound}`;
  (payload.question as Record<string, unknown>).prompt =
    `Round ${backend.activeRound} — which item grants Immolate?`;
  for (const p of payload.players as Record<string, unknown>[]) {
    if (p.player_id === "userA") p.has_submitted = backend.hasSubmitted;
    p.score = 0;
  }
  // Live Ranked is a v2 POINTS match: ten modules, a result face in the centre.
  payload.scoring = { model: "points", match_length: 10,
    module_number: backend.activeRound, modules_completed: backend.activeRound - 1 };
  return body;
}

function privateBody() {
  const body = privatePlayerV2("userA") as Record<string, unknown>;
  body.server_time = iso(Date.now());
  const payload = body.payload as Record<string, unknown>;
  for (const p of payload.players as Record<string, unknown>[]) {
    if (p.player_id === "userA") p.has_submitted = backend.hasSubmitted;
  }
  return body;
}

beforeEach(() => {
  backend = {
    activeRound: 1, startedAt: Date.now() - 2000, hasSubmitted: false, submittedIndex: null,
    resolved: {}, latestResolved: null,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: backend.activeRound, server_time: iso(Date.now()),
        payload: {
          match_status: "active", match_over: false, public: publicBody(), private: privateBody(),
          latest_resolved_round: backend.latestResolved, result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (u.includes("/submission")) {
      backend.hasSubmitted = true;
      backend.submittedIndex = (JSON.parse(init.body as string) as { answer: number }).answer;
      return json({ status: "accepted" });
    }
    const resolved = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (resolved) {
      const payload = backend.resolved[Number(resolved[1])];
      if (!payload) return json({ detail: "not ready" }, 404);
      return json({ schema_version: "ranked_duel.resolved_round.v2", projection_type: "resolved_round",
        match_id: "m1", round_number: Number(resolved[1]), server_time: iso(Date.now()), payload });
    }
    if (/\/matches\/m1$/.test(u) && (init.method ?? "GET") === "GET") return json(publicBody());
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("reduce-motion");
});

/** The server resolves round N and opens N+1 `leadMs` in the future. */
function resolveRound(opponent: "correct" | "incorrect" | "timeout" = "correct", leadMs = 2900) {
  backend.resolved[backend.activeRound] = resolvedPayload(backend.activeRound, opponent);
  backend.activeRound += 1;
  backend.startedAt = Date.now() + leadMs;
  backend.hasSubmitted = false;
}

async function mountAndAnswer(index: number) {
  render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
  await screen.findByTestId("answer-grid");
  await waitFor(() => expect(screen.getByTestId("ranked-question"))
    .toHaveAttribute("data-input-open", "true"));
  fireEvent.click(document.querySelector(`[data-quiz-choice="${index}"]`)!);
  await waitFor(() => expect(backend.hasSubmitted).toBe(true));
}

const holdActive = () =>
  screen.getByTestId("ranked-match").getAttribute("data-reveal-hold") === "true";
const choice = (i: number) => document.querySelector(`[data-quiz-choice="${i}"]`)!;

describe("RFX1 A — the player's own pick survives the reveal", () => {
  it("shows the wrong pick AND the correct answer together, from the settlement", async () => {
    await mountAndAnswer(2);
    resolveRound("correct");
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 4000 });

    // Still round 1's question on the card.
    expect(screen.getByTestId("scenario-surface")).toHaveTextContent("Round 1");
    // I picked C, it was wrong...
    expect(choice(2)).toHaveAttribute("data-choice-state", "incorrect-selected");
    expect(choice(2)).toHaveAttribute("data-your-pick", "true");
    expect(choice(2)).toHaveTextContent(/your pick/i);
    // ...and A was right. Both at once.
    expect(choice(0)).toHaveAttribute("data-choice-state", "correct");
    expect(choice(0)).not.toHaveAttribute("data-your-pick");
    expect(document.querySelectorAll("[data-your-pick]")).toHaveLength(1);
  });

  it("marks a correct pick as both the pick and the answer", async () => {
    await mountAndAnswer(0);
    resolveRound("correct");
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 4000 });
    expect(choice(0)).toHaveAttribute("data-choice-state", "correct");
    expect(choice(0)).toHaveAttribute("data-your-pick", "true");
  });

  it("drops the pick once the card moves to the next question", async () => {
    await mountAndAnswer(2);
    resolveRound("correct", 2900);
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 4000 });
    await waitFor(() => expect(holdActive()).toBe(false), { timeout: 4000 });
    expect(screen.getByTestId("scenario-surface")).toHaveTextContent("Round 2");
    expect(document.querySelectorAll("[data-your-pick]")).toHaveLength(0);
    expect(document.querySelectorAll('[data-choice-state="incorrect-selected"]')).toHaveLength(0);
  });
});

describe("RFX1 B — one presented round: N+1 never shows over N", () => {
  it("keeps round-1 identity and no clock in the header AND the phone bar during the reveal", async () => {
    await mountAndAnswer(2);
    resolveRound("correct");
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 4000 });

    // Desktop strip: the result face, round 1's title, no next-round clock.
    const strip = screen.getByTestId("ranked-header");
    expect(screen.getByTestId("ranked-header-title")).toHaveTextContent("1 / 10");
    expect(screen.getByTestId("timer-display")).toHaveAttribute("data-stage", "result");
    expect(screen.queryByTestId("timer-value")).toBeNull();
    expect(screen.queryByTestId("ranked-round-transition")).toBeNull();
    // Phone bar: no next-round 0:30, no next-round position.
    expect(strip).not.toHaveTextContent("2 / 10");
    expect(screen.getByTestId("mobile-module-position")).toHaveTextContent("1 / 10");
    expect(screen.getByTestId("mobile-timer-value")).toHaveTextContent("–:––");

    // When the presentation advances, it advances as one.
    await waitFor(() => expect(holdActive()).toBe(false), { timeout: 4000 });
    expect(screen.getByTestId("mobile-module-position")).toHaveTextContent("2 / 10");
    expect(screen.getByTestId("ranked-header-title")).toHaveTextContent("2 / 10");
    expect(screen.getByTestId("scenario-surface")).toHaveTextContent("Round 2");
  });
});

describe("RFX1 — the result overlay", () => {
  it("drives the viewer cue and the opponent's separate beat from ONE settlement", async () => {
    await mountAndAnswer(2);
    resolveRound("correct");
    const viewer = await screen.findByTestId("result-stamp-viewer", undefined, { timeout: 4000 });
    const opponent = screen.getByTestId("result-stamp-opponent");
    expect(viewer).toHaveTextContent("INCORRECT");
    expect(viewer).toHaveAttribute("data-tone", "failure");
    expect(viewer).toHaveAttribute("data-event-id", "m1:r1:user");
    expect(opponent).toHaveTextContent("OPPONENT CORRECT");
    expect(opponent).toHaveAttribute("data-event-id", "m1:r1:opp");
    // Separate beat: its own element, on the opponent's side, and not a copy
    // of the viewer's full-card treatment.
    expect(opponent.className).toContain("ranked-result-opponent");
    expect(opponent.className).not.toContain("ranked-result-stamp");
    expect(screen.getAllByTestId("result-edge")).toHaveLength(1);
    // Inside the question card, and the card is not dimmed under it.
    const stage = screen.getByTestId("ranked-question");
    expect(stage.contains(viewer)).toBe(true);
    expect(stage.className).not.toContain("opacity-60");
  });

  it("says OPPONENT MISSED for a timed-out opponent and CORRECT for the viewer", async () => {
    await mountAndAnswer(0);
    resolveRound("timeout");
    const viewer = await screen.findByTestId("result-stamp-viewer", undefined, { timeout: 4000 });
    expect(viewer).toHaveTextContent("CORRECT");
    expect(viewer).not.toHaveTextContent("INCORRECT");
    expect(screen.getByTestId("result-stamp-opponent")).toHaveTextContent("OPPONENT MISSED");
  });

  it("does not replay on polls or re-renders, and leaves with the beat", async () => {
    await mountAndAnswer(2);
    resolveRound("correct", 4000);
    const first = await screen.findByTestId("result-stamp-viewer", undefined, { timeout: 4000 });
    // Two more polls land during the beat; the SAME node survives them.
    await act(async () => { await new Promise((r) => setTimeout(r, 1600)); });
    if (holdActive()) expect(screen.getByTestId("result-stamp-viewer")).toBe(first);
    await waitFor(() => expect(holdActive()).toBe(false), { timeout: 4000 });
    expect(screen.queryByTestId("question-result-overlay")).toBeNull();
    // Further polls of the same settled state never bring it back.
    await act(async () => { await new Promise((r) => setTimeout(r, 1700)); });
    expect(screen.queryByTestId("question-result-overlay")).toBeNull();
  }, 15000);

  it("does not replay a result the player already saw, on refresh/restore", async () => {
    backend.submittedIndex = 2;
    backend.latestResolved = { payload: resolvedPayload(1, "correct"), round_number: 1 };
    backend.activeRound = 2;
    backend.startedAt = Date.now() - 1000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" />);
    await screen.findByTestId("answer-grid");
    // The settled result is restored where match state lives...
    await screen.findByTestId("ranked-last-result", undefined, { timeout: 4000 });
    // ...and the dramatic cue is not played.
    await act(async () => { await new Promise((r) => setTimeout(r, 1600)); });
    expect(screen.queryByTestId("question-result-overlay")).toBeNull();
  });

  it("keeps every word under reduced motion (Mogzy's own setting)", async () => {
    document.documentElement.classList.add("reduce-motion");
    await mountAndAnswer(2);
    resolveRound("incorrect");
    const overlay = await screen.findByTestId("question-result-overlay", undefined, { timeout: 4000 });
    expect(overlay).toHaveAttribute("data-motion", "reduced");
    expect(overlay.className).toContain("ranked-result-overlay--still");
    expect(screen.getByTestId("result-stamp-viewer")).toHaveTextContent("INCORRECT");
    expect(screen.getByTestId("result-stamp-opponent")).toHaveTextContent("OPPONENT MISSED");
    expect(choice(2)).toHaveAttribute("data-choice-state", "incorrect-selected");
    expect(choice(0)).toHaveAttribute("data-choice-state", "correct");
  });
});

describe("RFX1 C — input opens at the authoritative start", () => {
  it("opens the next round within a frame of started_at, not on the next 1s tick", async () => {
    await mountAndAnswer(2);
    // A short lead so the hold floors and the question is presented before
    // `started_at`; the wake-up, not a poll or the tick, must open it.
    resolveRound("correct", 4000);
    const startedAt = backend.startedAt;
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 4000 });
    await waitFor(() => expect(holdActive()).toBe(false), { timeout: 4000 });
    expect(screen.getByTestId("ranked-question")).toHaveAttribute("data-input-open", "false");
    let openedAt = 0;
    await waitFor(() => {
      expect(screen.getByTestId("ranked-question")).toHaveAttribute("data-input-open", "true");
      openedAt = Date.now();
    }, { timeout: 3000, interval: 10 });
    expect(openedAt - startedAt).toBeGreaterThanOrEqual(0);
    expect(openedAt - startedAt).toBeLessThan(250);
  }, 15000);
});
