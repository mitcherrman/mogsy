/**
 * Shell integration for a multi-challenge segment.
 *
 * The point of these tests is that `QuizRankedMatch` contains no
 * `isItemCostDuel` branch: it reads the module's declared `ownsSubmission`
 * capability, so registering a third module later changes nothing here.
 */

import { render, screen } from "@testing-library/react";
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
    resolvedPayload: null,
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

  it("renders the segment transcript after settlement", async () => {
    backend.resolvedPayload = icdResolvedPayload();
    await mount();
    const transcript = await screen.findByTestId("icd-transcript");
    expect(transcript).toBeInTheDocument();
    expect(screen.getByTestId("icd-transcript-result")).toHaveTextContent("Win");
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
