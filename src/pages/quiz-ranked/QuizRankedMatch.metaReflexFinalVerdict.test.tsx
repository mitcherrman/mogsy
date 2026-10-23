/**
 * Daily three acts (lane E) — ONE final verdict for the last Meta Reflex card.
 *
 * Draft PR #108 found that, on a phone, the final card's verdict disappeared
 * while the player waited for the block to be scored: the centre stamp lives
 * only for the card's reveal window and the header plate is `md:`+ only. #108
 * added a SECOND verdict word to the waiting line. The integration keeps the
 * centre stamp (the same element, the same event id) on the final card until
 * the block settles instead, so every viewport has exactly one verdict and the
 * settled card keeps both values (lane A).
 */
import { render, screen, waitFor } from "@testing-library/react";
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


describe("the final card's verdict holds until the block settles", () => {
  it("keeps the watched final card's stamp through the wait, with no second verdict", async () => {
    backend.segmentState = revealing(3);
    await mount();
    // Card five is revealed while this mount watches...
    backend.segmentState = metaReflexState(5, {
      own_card_reveals: [0, 1, 2, 3, 4].map((i) => settledCardReveal(i,
        i === 4 ? { outcome: "incorrect", selected_card_id: "c4:right",
          correct_card_id: "c4:left" } : {})),
      own_revealing_card_index: 4,
      own_reveal_until: "2026-07-18T12:00:07.500+00:00",
    });
    const stamp = await screen.findByTestId("result-stamp-viewer", {}, { timeout: 6000 });
    const id = stamp.getAttribute("data-event-id") ?? stamp.outerHTML;
    // ...then its reveal window ends and the opponent is still playing.
    backend.segmentState = metaReflexState(5, {
      own_card_reveals: [0, 1, 2, 3, 4].map((i) => settledCardReveal(i,
        i === 4 ? { outcome: "incorrect", selected_card_id: "c4:right",
          correct_card_id: "c4:left" } : {})),
      own_revealing_card_index: null,
    });
    await screen.findByTestId("mr-waiting", {}, { timeout: 6000 });
    // Let the client poll the post-reveal snapshot (several poll cycles).
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const held = screen.getByTestId("result-stamp-viewer");
    expect(held.getAttribute("data-event-id") ?? held.outerHTML).toBe(id);
    // The waiting line carries no verdict word of its own (#108's line).
    const waiting = screen.getByTestId("mr-waiting");
    expect(waiting.querySelector("[data-testid='mr-final-verdict']")).toBeNull();
    const status = waiting.querySelector("[role='status']")?.textContent ?? "";
    expect(status).not.toMatch(/CORRECT|INCORRECT|TIMED OUT/);
    // Both server values stay on the settled card (lane A).
    expect(screen.getByTestId("mr-settled-card")).toBeInTheDocument();
  }, 30000);

  it("a restored wait (page reloaded after the reveal) does not re-stamp", async () => {
    backend.segmentState = metaReflexState(5, {
      own_card_reveals: [0, 1, 2, 3, 4].map((i) => settledCardReveal(i)),
      own_revealing_card_index: null,
    });
    await mount();
    await screen.findByTestId("mr-waiting");
    expect(screen.queryByTestId("result-stamp-viewer")).toBeNull();
  });
});
