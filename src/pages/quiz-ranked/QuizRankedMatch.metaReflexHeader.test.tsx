/**
 * POINT1 corrective — WHERE a Meta Reflex card's result resolves, end to end.
 *
 * Asserted against the real controller, the real view model and the real arena
 * (only `fetch` is stubbed), because the defect these pin was a SEAM and not a
 * component: each of the two plates was correct on its own, and the product
 * fault was that both were on screen at once and the surviving one was the
 * previous round rendered through the legacy damage branch.
 *
 * THE OWNERSHIP THESE PIN
 *   per-card reveal   → the top arena header plate, points-native
 *   card body         → the settled card, correct side green, "Next card…"
 *   module completion → `SegmentResultBeat`, unchanged
 *   and nowhere else.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import {
  metaReflexResolvedPayload, metaReflexSegmentMeta, metaReflexState,
  modulePointsBlock, privatePlayerV2, publicRoundV2, settledCardReveal,
  withPointsScoring,
} from "@/lib/ranked-public/fixtures";
import { COMBAT_VOCABULARY } from "@/components/ranked-arena/CardResultBeat.test";

interface Backend {
  segmentState: unknown;
  resolvedPayload: unknown | null;
  roundNumber: number;
  /** What the next challenge submission is answered with. */
  submitFailure: { status: number; code: string; message: string } | null;
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });

function publicBody() {
  const body = withPointsScoring(publicRoundV2(), { moduleNumber: 4 });
  const payload = body.payload as Record<string, unknown>;
  payload.segment = backend.segmentState === null
    ? { module_id: "quiz", module_version: 1, challenge_count: 1, challenge_index: 0 }
    : metaReflexSegmentMeta();
  payload.segment_state = backend.segmentState;
  (payload.active_round as Record<string, unknown>).round_number = backend.roundNumber;
  return body;
}

function privateBody() {
  const body = withPointsScoring(privatePlayerV2("userA"), { moduleNumber: 4 });
  const payload = body.payload as Record<string, unknown>;
  payload.segment = backend.segmentState === null
    ? { module_id: "quiz", module_version: 1, challenge_count: 1, challenge_index: 0 }
    : metaReflexSegmentMeta();
  payload.segment_state = backend.segmentState;
  return body;
}

/**
 * The block mid-reveal of card `index`: that card has settled, and its
 * successor is the active index but has not opened.
 */
function revealing(index: number, over: Record<string, unknown> = {}) {
  return metaReflexState(index + 1, {
    own_card_reveals: Array.from({ length: index + 1 }, (_, i) =>
      settledCardReveal(i, i === index ? over : {})),
    own_revealing_card_index: index,
    own_reveal_until: "2026-07-18T12:00:07.500+00:00",
  });
}

beforeEach(() => {
  backend = {
    segmentState: revealing(0),
    // A PREVIOUS points module has already settled. This is the state that
    // used to paint "2 DEALT · 3 TAKEN" over a live block: the round beat
    // persists after its reveal hold, and its award used to expire with the
    // hold and drop it back onto the damage clauses.
    resolvedPayload: {
      ...metaReflexResolvedPayload({ round_number: 3 }),
      module_points: modulePointsBlock({
        userA: { base: 4, before: 6 }, userB: { base: 2, before: 4 } }),
    },
    roundNumber: 4,
    submitFailure: null,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: backend.roundNumber,
        server_time: "2026-07-18T12:00:08+00:00",
        payload: {
          match_status: "active", match_over: false,
          public: publicBody(), private: privateBody(),
          latest_resolved_round: backend.resolvedPayload === null ? null : {
            schema_version: "ranked_duel.resolved_round.v2",
            projection_type: "resolved_round", match_id: "m1",
            round_number: 3,
            server_time: "2026-07-18T12:00:08+00:00",
            payload: backend.resolvedPayload },
          result: null,
        },
      });
    }
    const challenge = u.match(/\/challenges\/(\d+)$/);
    if (challenge) {
      if (backend.submitFailure) {
        const { status, code, message } = backend.submitFailure;
        return json({ detail: { code, message } }, status);
      }
      const index = Number(challenge[1]);
      return json({ status: "accepted", match_id: "m1", segment_number: 4,
        challenge_index: index, idempotent: false, conflicting: false,
        segment_resolved: false, next_challenge_index: index + 1 });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) {
      return json({ status: "active", match_id: "m1", active: true });
    }
    const resolved = u.match(/\/rounds\/(\d+)\/resolved$/);
    if (resolved) {
      if (backend.resolvedPayload === null) return json({}, 409);
      return json({
        schema_version: "ranked_duel.resolved_round.v2",
        projection_type: "resolved_round", match_id: "m1",
        round_number: Number(resolved[1]),
        server_time: "2026-07-18T12:00:08+00:00",
        payload: backend.resolvedPayload });
    }
    if (/\/matches\/m1$/.test(u) && method === "GET") return json(publicBody());
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mount() {
  const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  // `mr-block` while a card is live or revealing; `mr-waiting` once the viewer
  // has finished all five and the block is being scored.
  await waitFor(() => expect(screen.queryByTestId("mr-block")
    ?? screen.queryByTestId("mr-waiting")).not.toBeNull());
  return view;
}

describe("a card's result resolves in the arena header, once", () => {
  it("shows CORRECT and +1 POINT in the TOP result slot", async () => {
    await mount();
    const beat = await screen.findByTestId("ranked-card-beat");
    expect(beat).toHaveAttribute("data-outcome", "correct");
    expect(beat).toHaveTextContent("CORRECT");
    expect(beat).toHaveTextContent("+1 POINT");
    // The arena's ONE result slot — the same element every other beat uses.
    expect(beat).toHaveAttribute("data-mode", "round");
  });

  it("shows INCORRECT and +0 POINTS for a card the player got wrong", async () => {
    backend.segmentState = revealing(1, { outcome: "incorrect",
      selected_card_id: "c1:right", correct_card_id: "c1:left" });
    await mount();
    const beat = await screen.findByTestId("ranked-card-beat");
    expect(beat).toHaveAttribute("data-outcome", "incorrect");
    expect(beat).toHaveTextContent("INCORRECT");
    expect(beat).toHaveTextContent("+0 POINTS");
    expect(beat.textContent ?? "").not.toContain("OPPONENT");
  });

  /** THE DUPLICATE-SURFACE RULE. One textual per-card result, and it is above. */
  it("draws NO second result plate inside the module viewport", async () => {
    await mount();
    await screen.findByTestId("ranked-card-beat");
    const viewport = screen.getByTestId("mr-block");
    expect(viewport.querySelector("[data-testid='mr-card-beat']")).toBeNull();
    expect(viewport.querySelector("[data-testid='ranked-card-beat']")).toBeNull();
    expect(viewport.querySelector("[data-testid='ranked-last-result']")).toBeNull();
    expect(viewport.textContent ?? "").not.toContain("CORRECT");
    // Exactly one result plate exists in the whole arena.
    expect(document.querySelectorAll("[data-mode='round'],[data-mode='segment']"))
      .toHaveLength(1);
  });

  it("outranks the previous round's plate while the block is running", async () => {
    await mount();
    await screen.findByTestId("ranked-card-beat");
    // The stale round beat is not also drawn: one slot, one answer.
    expect(screen.queryByTestId("ranked-last-result")).toBeNull();
  });
});

describe("no combat vocabulary reaches an active Meta Reflex header", () => {
  /**
   * THE SURVIVING DAMAGE HEADER, pinned at the seam that produced it. During
   * a live block the header falls back to the previous ROUND's plate, and that
   * plate's consequence line used to read `finalDamageDealt`/`Received`
   * straight off the settlement whenever its points award was not in hand.
   */
  it("says no DAMAGE / DEALT / TAKEN while a card is live", async () => {
    backend.segmentState = metaReflexState(2, {
      own_card_reveals: [0, 1].map((i) => settledCardReveal(i)),
      own_revealing_card_index: null,
    });
    await mount();
    // No card is revealing, so the previous MODULE's plate holds the slot.
    const beat = await screen.findByTestId("ranked-last-result");
    const text = (beat.textContent ?? "").toUpperCase();
    // Including the block plate's own DMG clause, which is the same award
    // travelling through the engine's damage channel. What it prints INSTEAD
    // when the award is in hand is pinned in `resultBeats.points.test.ts`.
    for (const banned of COMBAT_VOCABULARY) expect(text).not.toContain(banned);
    expect(text).toContain("YOU 4/5");
  });

  it("says no DAMAGE / DEALT / TAKEN while a card is being revealed", async () => {
    await mount();
    const beat = await screen.findByTestId("ranked-card-beat");
    const text = (beat.textContent ?? "").toUpperCase();
    for (const banned of COMBAT_VOCABULARY) expect(text).not.toContain(banned);
  });
});

describe("the card body keeps what it owns", () => {
  it("marks the SERVER's correct side green whatever the player picked",
    async () => {
      backend.segmentState = revealing(0, { outcome: "incorrect",
        selected_card_id: "c0:right", correct_card_id: "c0:left" });
      await mount();
      const card = await screen.findByTestId("mr-settled-card");
      expect(card.querySelector("[data-testid='mr-choice-left']"))
        .toHaveAttribute("data-reveal", "correct");
      expect(card.querySelector("[data-testid='mr-choice-right']"))
        .toHaveAttribute("data-reveal", "wrong");
    });

  it("still renders \"Next card…\" during the reveal", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("mr-status"))
      .toHaveTextContent("Next card…"));
  });

  it("withholds the next card until the reveal ends", async () => {
    await mount();
    // The settled card is what is on screen, and it cannot be answered.
    expect(screen.getByTestId("mr-block")).toHaveAttribute("data-phase", "reveal");
    expect(screen.getByTestId("mr-choice-left")).toBeDisabled();
    expect(screen.getByTestId("mr-choice-right")).toBeDisabled();
    expect(screen.queryByTestId("mr-countdown")).toBeNull();
  });
});

describe("the fifth card, and the module summary that replaces it", () => {
  it("reveals card five in the header before the block is scored", async () => {
    backend.segmentState = metaReflexState(5, {
      own_card_reveals: [0, 1, 2, 3, 4].map((i) => settledCardReveal(i)),
      own_revealing_card_index: null,
    });
    await mount();
    const beat = await screen.findByTestId("ranked-card-beat");
    expect(beat).toHaveAttribute("data-challenge-index", "4");
    expect(beat).toHaveTextContent("C5");
    // The card itself is still on screen, revealed, waiting for the summary.
    expect(screen.getByTestId("mr-settled-card")).toBeInTheDocument();
  });

  it("hands the slot to the block's own beat once it settles", async () => {
    backend.segmentState = metaReflexState(5, {
      own_card_reveals: [0, 1, 2, 3, 4].map((i) => settledCardReveal(i)),
      own_revealing_card_index: null,
    });
    await mount();
    await screen.findByTestId("ranked-card-beat");

    // The block settles and the format moves on, exactly as it does live.
    backend.resolvedPayload = metaReflexResolvedPayload({ round_number: 4 });
    backend.segmentState = null;
    backend.roundNumber = 5;

    const beat = await screen.findByTestId(
      "ranked-last-result", {}, { timeout: 6000 });
    expect(beat).toHaveAttribute("data-mode", "segment");
    // The module-level scoreline, unchanged and still the segment beat's.
    expect(beat).toHaveTextContent("YOU 4/5");
    expect(beat).toHaveTextContent("OPP 2/5");
    // The per-card plate is gone: the two never collide in the slot.
    expect(screen.queryByTestId("ranked-card-beat")).toBeNull();
    // And the block plate is points-native too — no DMG clause on this match.
    const text = (beat.textContent ?? "").toUpperCase();
    for (const banned of COMBAT_VOCABULARY) expect(text).not.toContain(banned);
  }, 15000);
});

/**
 * THE RED LINE UNDER THE BLOCK.
 *
 * `mr-error` is the ONLY destructive-coloured text this module can render (the
 * arena's shared status row is not drawn at all for a module that owns its own
 * submission), and it prints `actions.error` verbatim — which is the server's
 * own message. Every timing race the submit path can lose was already treated
 * as a re-poll rather than an error, except the ONE the POINT1 reveal window
 * introduced: `RANKED_CARD_NOT_OPEN`, raised when a click lands in the gap
 * between the client seeing the next card and the frozen schedule opening it.
 */
describe("the module's bottom error line", () => {
  const race = {
    status: 409, code: "RANKED_CARD_NOT_OPEN",
    message: "card 1 opens after the current reveal",
  };

  async function clickAndSettle() {
    fireEvent.click(screen.getByTestId("mr-choice-left"));
    // Long enough for the failed submission AND the poke it triggers.
    await waitFor(() => expect((globalThis.fetch as unknown as {
      mock: { calls: [string][] } }).mock.calls
      .some(([url]) => String(url).includes("/challenges/"))).toBe(true));
  }

  it("stays silent when a click loses the reveal-window race", async () => {
    backend.segmentState = metaReflexState(0);
    backend.submitFailure = race;
    await mount();
    await clickAndSettle();
    await waitFor(() => expect(screen.queryByTestId("mr-error")).toBeNull());
    // And nothing else inside the module's own viewport turned red either.
    expect(screen.getByTestId("mr-block")
      .querySelectorAll(".text-destructive")).toHaveLength(0);
  });

  it("still surfaces an error that is NOT a timing race", async () => {
    backend.segmentState = metaReflexState(0);
    backend.submitFailure = {
      status: 500, code: "RANKED_INTERNAL", message: "something broke" };
    await mount();
    await clickAndSettle();
    const line = await screen.findByTestId("mr-error");
    expect(line).toHaveTextContent("something broke");
  });
});

/**
 * WHAT ELSE CAN PAINT RED NEAR THE BOTTOM OF THE BLOCK.
 *
 * Documented as a test rather than as a comment so the inventory cannot go
 * stale: a module that owns its own submission is drawn with `ForfeitControl`
 * on a slim row directly beneath it, and that control is `text-destructive` by
 * design. It is PERSISTENT — it is there for the whole match — so it is not
 * the intermittent line, and it must not be mistaken for one.
 */
describe("the red text below the block that is SUPPOSED to be there", () => {
  it("is the forfeit control, and it is always present", async () => {
    backend.segmentState = metaReflexState(0);
    await mount();
    // The forfeit control is persistent (red on hover, by design).
    expect(screen.getByTestId("ranked-forfeit")).toBeInTheDocument();
    // With no leveling layer the combatant columns no longer paint any red
    // of their own, so the inventory may be empty — but never a message.
    const reds = Array.from(document.querySelectorAll(".text-destructive"));
    // Print the inventory rather than guess at it: every red element in the
    // live arena must be accounted for, and today they are all the opponent's
    // own chrome or the forfeit control — never a message.
    for (const el of reds) {
      expect(el.getAttribute("data-testid")
        ?? el.closest("[data-testid]")?.getAttribute("data-testid") ?? "")
        .toMatch(/forfeit|combatant|opponent/i);
    }
    expect(screen.queryByTestId("mr-error")).toBeNull();
  });
});
