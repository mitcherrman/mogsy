/**
 * Shell integration for a multi-challenge segment.
 *
 * The point of these tests is that `QuizRankedMatch` contains no
 * `isItemCostDuel` branch: it reads the module's declared `ownsSubmission`
 * capability, so registering a third module later changes nothing here.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import {
  icdChallengeState, icdResolvedPayload, icdSegmentMeta, icdSegmentState,
  privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";

interface Backend {
  segmentMeta: unknown;
  segmentState: unknown;
  resolvedPayload: unknown | null;
  /** Bump to make the poll see a round boundary and capture a settlement. */
  activeRound: number;
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
  const meta = backend.segmentMeta as Record<string, unknown> | null;
  if (meta?.phase === "ability") payload.active_round = null;
  else if (payload.active_round) {
    (payload.active_round as Record<string, unknown>).round_number = backend.activeRound;
  }
  return body;
}

function privateBody() {
  const body = privatePlayerV2("userA");
  const payload = body.payload as Record<string, unknown>;
  payload.segment = backend.segmentMeta;
  payload.segment_state = backend.segmentState;
  return body;
}

beforeEach(() => {
  backend = {
    segmentMeta: icdSegmentMeta(), segmentState: icdSegmentState(),
    resolvedPayload: null, activeRound: 3,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 3, server_time: "2026-07-18T12:00:00+00:00",
        payload: {
          match_status: "active", match_over: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [],
          latest_resolved_round: backend.resolvedPayload === null ? null : {
            schema_version: "ranked_duel.resolved_round.v2",
            projection_type: "resolved_round", match_id: "m1", round_number: 3,
            server_time: "2026-07-18T12:00:00+00:00",
            payload: backend.resolvedPayload },
          result: null,
        },
      });
    }
    if (/\/rounds\/\d+\/resolved$/.test(u)) {
      if (backend.resolvedPayload === null) return json({}, 404);
      return json({
        schema_version: "ranked_duel.resolved_round.v2",
        projection_type: "resolved_round", match_id: "m1", round_number: 3,
        server_time: "2026-07-18T12:00:00+00:00",
        payload: backend.resolvedPayload });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) {
      return json({ status: "active", match_id: "m1", active: true });
    }
    if (/\/matches\/m1$/.test(u) && (init.method ?? "GET") === "GET") {
      return json(publicBody());
    }
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mount() {
  const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  return view;
}

describe("QuizRankedMatch — multi-challenge segment", () => {
  const openInChallenges = () => {
    backend.segmentMeta = icdSegmentMeta({ phase: "challenges", challenge_index: 0 });
    backend.segmentState = icdChallengeState(0);
  };

  it("renders the Item Cost Duel challenge board straight from the registry",
    async () => {
      openInChallenges();
      await mount();
      expect(await screen.findByTestId("icd-challenge-phase")).toBeInTheDocument();
      expect(screen.getByTestId("ranked-question")).toBeInTheDocument();
      // R3: no ability step stands between the segment opening and challenge 1.
      expect(screen.queryByTestId("icd-ability-phase")).toBeNull();
      expect(screen.getByTestId("icd-progress")).toHaveTextContent("Challenge 1 of 5");
    });

  it("suppresses the quiz answer status strip and ability tray", async () => {
    openInChallenges();
    await mount();
    await screen.findByTestId("icd-challenge-phase");
    // The module owns its own submission; a second set of controls beside it
    // would be a real input hazard.
    expect(screen.queryByTestId("ranked-abilities")).toBeNull();
    expect(screen.queryByTestId("ranked-submission-status")).toBeNull();
  });

  it("shows no 'choosing an ability' status and no transition gap", async () => {
    openInChallenges();
    await mount();
    await screen.findByTestId("icd-challenge-phase");
    expect(document.body.textContent).not.toMatch(/choosing an ability/i);
    expect(screen.queryByTestId("ranked-round-transition")).toBeNull();
  });

  it("renders the challenge board with both item cards", async () => {
    backend.segmentMeta = icdSegmentMeta({ phase: "challenges", challenge_index: 1 });
    backend.segmentState = icdChallengeState(1);
    await mount();
    expect(await screen.findByTestId("icd-challenge-phase")).toBeInTheDocument();
    expect(screen.getByTestId("icd-item-Item 2")).toBeInTheDocument();
    expect(screen.getByTestId("icd-item-Item 3")).toBeInTheDocument();
  });

  /** Settle the open segment and open the next round, the way the poll sees it. */
  function settleSegment() {
    backend.resolvedPayload = icdResolvedPayload();
    backend.activeRound = 4;
  }

  it("renders a compact segment result for the settlement BEAT — full transcript only on demand", async () => {
    openInChallenges();   // an OPEN engine round, so the poll can see it close
    await mount();
    settleSegment();
    // The banner belongs to the settlement beat and nothing else, so this
    // waits for the beat rather than for the banner: catching it by polling
    // for the node would pass or fail on timing.
    await waitFor(() => expect(screen.getByTestId("ranked-match"))
      .toHaveAttribute("data-reveal-hold", "true"), { timeout: 6000 });
    // The live flow shows a fixed-height banner, and the verbose
    // per-challenge transcript NEVER mounts beneath an active round on its own.
    expect(screen.getByTestId("icd-result-banner")).toBeInTheDocument();
    expect(screen.getByTestId("icd-banner-result")).toHaveTextContent("Win");
    expect(screen.queryByTestId("icd-transcript")).toBeNull();
    // The canonical detail is deferred, not dropped: Details expands the
    // unchanged transcript.
    fireEvent.click(screen.getByTestId("icd-details-toggle"));
    expect(screen.getByTestId("icd-transcript")).toBeInTheDocument();
    expect(screen.getByTestId("icd-transcript-result")).toHaveTextContent("Win");
    // ...and an OPEN expansion survives the end of the beat. A banner that
    // vanished out from under the breakdown the player just asked for would
    // be losing the detail, not deferring it.
    await waitFor(() => expect(screen.getByTestId("ranked-match"))
      .toHaveAttribute("data-reveal-hold", "false"), { timeout: 6000 });
    expect(screen.getByTestId("icd-transcript")).toBeInTheDocument();
  });

  it("clears the segment banner once the beat ends, leaving the bottom free", async () => {
    openInChallenges();
    await mount();
    settleSegment();
    await waitFor(() => expect(screen.getByTestId("ranked-match"))
      .toHaveAttribute("data-reveal-hold", "true"), { timeout: 6000 });
    expect(screen.getByTestId("icd-result-banner")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("ranked-match"))
      .toHaveAttribute("data-reveal-hold", "false"), { timeout: 6000 });
    expect(screen.queryByTestId("icd-result-banner")).toBeNull();
  });

  it("still renders the ordinary quiz surface for a quiz segment", async () => {
    backend.segmentMeta = { module_id: "quiz", module_version: 1,
      challenge_count: 1, challenge_index: 0 };
    backend.segmentState = null;
    await mount();
    expect(screen.getByTestId("ranked-question")).toBeInTheDocument();
    expect(screen.getByTestId("ranked-abilities")).toBeInTheDocument();
    expect(screen.queryByTestId("icd-ability-phase")).toBeNull();
  });

  it("fails closed on an unknown module", async () => {
    backend.segmentMeta = { module_id: "not_a_real_module", module_version: 1,
      challenge_count: 3, challenge_index: 0 };
    backend.segmentState = null;
    await mount();
    expect(screen.getByTestId("ranked-unsupported-module")).toBeInTheDocument();
    expect(screen.queryByTestId("ranked-question")).toBeNull();
  });
});
