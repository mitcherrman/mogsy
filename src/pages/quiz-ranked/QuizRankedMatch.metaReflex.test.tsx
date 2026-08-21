/**
 * QUIZ1 Phase 7 — Meta Reflex inside the live Ranked shell.
 *
 * These are the end-to-end properties the owner playtest depends on, asserted
 * against the real controller and the real HTTP layer (only `fetch` is stubbed):
 *
 *   * segment 4 RENDERS instead of stalling — the defect this phase fixes;
 *   * a click puts a `card_id` on the wire, never an `item_id`;
 *   * after the fifth card the block disappears and the ORDINARY Ranked
 *     question comes back, in the same mounted match shell;
 *   * segment 9 behaves identically, because nothing is segment-specific;
 *   * a payload the client cannot read surfaces, instead of being swallowed
 *     and retried forever.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import {
  metaReflexResolvedPayload, metaReflexSegmentMeta, metaReflexState,
  privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";

interface Backend {
  segmentMeta: unknown;
  segmentState: unknown;
  resolvedPayload: unknown | null;
  challengeSubmits: { index: number; body: Record<string, unknown> }[];
  roundNumber: number;
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });

function publicBody() {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.segment = backend.segmentMeta;
  payload.segment_state = backend.segmentState;
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

/** The ordinary Ranked question that follows a block. */
function quizSegment() {
  backend.segmentMeta = { module_id: "quiz", module_version: 1,
    challenge_count: 1, challenge_index: 0 };
  backend.segmentState = null;
}

beforeEach(() => {
  backend = {
    segmentMeta: metaReflexSegmentMeta(),
    segmentState: metaReflexState(0),
    resolvedPayload: null,
    challengeSubmits: [],
    roundNumber: 4,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: backend.roundNumber,
        server_time: "2026-07-18T12:00:08+00:00",
        payload: {
          match_status: "active", match_over: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [],
          latest_resolved_round: backend.resolvedPayload === null ? null : {
            schema_version: "ranked_duel.resolved_round.v2",
            projection_type: "resolved_round", match_id: "m1",
            round_number: backend.roundNumber,
            server_time: "2026-07-18T12:00:08+00:00",
            payload: backend.resolvedPayload },
          result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) {
      return json({ status: "active", match_id: "m1", active: true });
    }
    const challenge = u.match(/\/challenges\/(\d+)$/);
    if (challenge) {
      const index = Number(challenge[1]);
      backend.challengeSubmits.push({ index, body });
      return json({ status: "accepted", match_id: "m1", segment_number: 4,
        challenge_index: index, idempotent: false, conflicting: false,
        segment_resolved: false, next_challenge_index: index + 1 });
    }
    if (/\/rounds\/\d+\/resolved$/.test(u)) {
      if (backend.resolvedPayload === null) return json({}, 409);
      return json({
        schema_version: "ranked_duel.resolved_round.v2",
        projection_type: "resolved_round", match_id: "m1", round_number: 4,
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
  return view;
}

describe("Meta Reflex in the Ranked shell", () => {
  it("renders the block at segment 4 instead of stalling", async () => {
    await mount();
    expect(await screen.findByTestId("mr-block")).toBeInTheDocument();
    expect(screen.getByTestId("mr-prompt")).toHaveTextContent("Which item costs more gold?");
    expect(screen.getByTestId("mr-progress")).toHaveTextContent("1 / 5");
    // The old renderer must not be what came up.
    expect(screen.queryByTestId("icd-challenge-phase")).toBeNull();
    expect(screen.queryByTestId("ranked-unsupported-module")).toBeNull();
    expect(screen.queryByTestId("ranked-contract-error")).toBeNull();
  });

  it("keeps the arena, HP and opponent panels around the block", async () => {
    await mount();
    await screen.findByTestId("mr-block");
    expect(screen.getByTestId("ranked-focus-column")).toBeInTheDocument();
    // The module owns its input, so no second set of quiz controls appears.
    expect(screen.queryByTestId("ranked-abilities")).toBeNull();
    expect(screen.queryByTestId("submission-status")).toBeNull();
  });

  it("puts card_id on the wire, and no item_id", async () => {
    await mount();
    await screen.findByTestId("mr-block");
    fireEvent.click(screen.getByTestId("mr-choice-right"));
    await waitFor(() => expect(backend.challengeSubmits).toHaveLength(1));
    expect(backend.challengeSubmits[0]).toEqual({
      index: 0, body: { card_id: "c0:right" },
    });
    expect(backend.challengeSubmits[0].body).not.toHaveProperty("item_id");
  });

  it("sends exactly one request for a double click", async () => {
    await mount();
    await screen.findByTestId("mr-block");
    fireEvent.click(screen.getByTestId("mr-choice-left"));
    fireEvent.click(screen.getByTestId("mr-choice-left"));
    await waitFor(() => expect(backend.challengeSubmits.length).toBeGreaterThan(0));
    expect(backend.challengeSubmits).toHaveLength(1);
  });

  it("advances to the next card from the SERVER's index, with no stale selection",
    async () => {
      await mount();
      await screen.findByTestId("mr-block");
      fireEvent.click(screen.getByTestId("mr-choice-left"));
      backend.segmentState = metaReflexState(1);
      await waitFor(() => expect(screen.getByTestId("mr-progress"))
        .toHaveTextContent("2 / 5"), { timeout: 4000 });
      expect(screen.getByTestId("mr-prompt"))
        .toHaveTextContent("Which champion uses Energy?");
      expect(screen.getByTestId("mr-choice-left")).not.toBeDisabled();
      expect(screen.getByTestId("mr-choice-left")).toHaveAttribute("aria-pressed", "false");
    });

  it("returns to the ordinary Ranked question after the fifth card, in place",
    async () => {
      backend.segmentState = metaReflexState(4);
      await mount();
      await screen.findByTestId("mr-block");
      expect(screen.getByTestId("mr-progress")).toHaveTextContent("5 / 5");

      // The block settles and the format moves on to segment 5. No navigation:
      // the same match shell stays mounted throughout.
      const shell = screen.getByTestId("ranked-match");
      backend.resolvedPayload = metaReflexResolvedPayload();
      quizSegment();
      backend.roundNumber = 5;

      // The settled block is summarised in the TOP HUD, under the product
      // name, and NOT at the bottom of the arena — the region the round
      // timeline needs held open.
      await waitFor(() => expect(screen.getByTestId("ranked-match"))
        .toHaveAttribute("data-reveal-hold", "true"), { timeout: 6000 });
      const beat = screen.getByTestId("ranked-last-result");
      expect(beat).toHaveAttribute("data-mode", "segment");
      expect(beat).toHaveTextContent("Meta Reflex");
      expect(beat).not.toHaveTextContent("Item Cost Duel");
      // The scoreline no round beat could carry, straight off the reveal.
      expect(beat).toHaveTextContent("YOU 4/5");
      expect(beat).toHaveTextContent("OPP 2/5");
      expect(beat).toHaveTextContent("6 DMG");
      expect(screen.queryByTestId("icd-result-banner")).toBeNull();

      await waitFor(() => expect(screen.queryByTestId("mr-block")).toBeNull(),
        { timeout: 6000 });
      expect(screen.getByTestId("ranked-question")).toBeInTheDocument();
      expect(screen.getByTestId("ranked-abilities")).toBeInTheDocument();
      expect(screen.getByTestId("ranked-match")).toBe(shell);
      // The next round is live and the block's result is still in the HUD —
      // still with nothing at the bottom.
      expect(screen.getByTestId("ranked-last-result"))
        .toHaveAttribute("data-mode", "segment");
      expect(screen.queryByTestId("icd-result-banner")).toBeNull();
    }, 15000);

  it("renders the SECOND block at segment 9 exactly like the first", async () => {
    backend.roundNumber = 9;
    backend.segmentMeta = metaReflexSegmentMeta({ segment_number: 9 });
    backend.segmentState = metaReflexState(0, { segment_number: 9 });
    await mount();
    expect(await screen.findByTestId("mr-block")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mr-choice-left"));
    await waitFor(() => expect(backend.challengeSubmits).toHaveLength(1));
    expect(backend.challengeSubmits[0].body).toEqual({ card_id: "c0:left" });
    const [call] = (globalThis.fetch as unknown as {
      mock: { calls: [string, RequestInit][] } }).mock.calls
      .filter(([u]) => String(u).includes("/challenges/"));
    expect(String(call[0])).toContain("/segments/9/challenges/0");
  });

  it("resumes mid-block on a fresh mount, on the right card", async () => {
    // What a browser reload does: the resume envelope carries the block, and
    // the viewer lands on the card the SERVER says is theirs.
    backend.segmentState = metaReflexState(2);
    await mount();
    expect(await screen.findByTestId("mr-progress")).toHaveTextContent("3 / 5");
    expect(screen.getByTestId("mr-prompt")).toHaveTextContent("Which one is Xerath's W?");
  });
});

describe("Meta Reflex — an unreadable payload is surfaced, not swallowed", () => {
  it("shows a diagnosable error state and stops retrying", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    // Exactly the pre-Phase-7 situation: cards the reader cannot parse.
    backend.segmentState = metaReflexState(0, {
      challenges: {
        prompt: "Meta Reflex", challenge_count: 5,
        challenges: [{ challenge_index: 0, kind: "magnitude", entity_kind: "item",
          left: { name: "Hexdrinker" }, right: { name: "Giant's Belt" },
          prompt: "?", left_card_id: "c0:left", right_card_id: "c0:right" }],
      },
    });
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);

    const panel = await screen.findByTestId("ranked-contract-error");
    expect(panel).toBeInTheDocument();
    // The reason names the CONTRACT path, so it is diagnosable without being a
    // payload dump — and no bearer token can appear in it.
    expect(screen.getByTestId("ranked-contract-detail").textContent)
      .toMatch(/entity_id/);
    expect(panel.textContent).not.toMatch(/Bearer|jwt/);
    expect(errors).toHaveBeenCalled();

    // It stays put rather than clearing itself on the next tick.
    await act(async () => { await new Promise((r) => setTimeout(r, 2000)); });
    expect(screen.getByTestId("ranked-contract-error")).toBeInTheDocument();
    expect(screen.queryByTestId("mr-block")).toBeNull();
    errors.mockRestore();
  }, 15000);

  it("recovers when the payload becomes readable and the player retries", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    backend.segmentState = metaReflexState(0, {
      challenges: { prompt: "Meta Reflex", challenge_count: 5,
        challenges: [{ challenge_index: 0, kind: "nonsense", entity_kind: "item",
          prompt: "?", left: {}, right: {},
          left_card_id: "c0:left", right_card_id: "c0:right" }] },
    });
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
    await screen.findByTestId("ranked-contract-error");
    backend.segmentState = metaReflexState(0);
    fireEvent.click(screen.getByTestId("ranked-contract-retry"));
    expect(await screen.findByTestId("mr-block")).toBeInTheDocument();
    errors.mockRestore();
  }, 15000);
});
