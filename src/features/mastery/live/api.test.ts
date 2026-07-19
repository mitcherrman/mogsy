/**
 * Live Mastery API client tests (H1 / G7). Fetch is mocked; the client must parse
 * valid projections, reject a leaked answer field, and map typed errors.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getReviewerArtifact,
  isConflict,
  isForbidden,
  listSets,
  startSession,
  submitAnswer,
  MasteryApiError,
} from "./api";

const SET_ID = "mset_aaf6c0553e4d9339ea3295317275e116f2ef0a8f867a34302675f2dea5abc83c";
const ART = "martifact_a91f1584089d0c1d2ef4a14c35ad071bcccf5e473f6d50ebb76206870465fe90";
const S0 = "snap_257350f8b649e44f6c90609da32c36da39c051d0fb493f9391190f40ea334e0a";

vi.mock("@/lib/backend-auth", () => ({ getBackendAuthHeaders: async () => ({}) }));

function ok(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}
function err(status: number, code: string): Response {
  return { ok: false, status, json: async () => ({ detail: { code, message: code } }) } as unknown as Response;
}

const championView = (id: string) => ({
  champion_id: id, display_name: id, current_health: 500, max_health: null,
  resource_type: "mana", current_resource: 400, max_resource: null,
  active_effects: [], inventory_summary: [],
});
const stateView = (sid: string) => ({
  snapshot_id: sid, patch_key_digest: "patchkey_x", validation_status: "certified",
  label: "Initial state", champion_a: championView("ahri"), champion_b: championView("syndra"),
});
const sessionData = () => ({
  session_id: "msess_1", mastery_set_id: SET_ID, artifact_digest: ART,
  display_revision: "disprev_ahri-syndra-e.v1", current_sequence_index: 0,
  total_steps: 6, phase: "question", completed: false,
});
const questionEnvelope = (extra: Record<string, unknown> = {}) => ({
  projection_type: "mastery_player_question",
  schema_version: "mastery-player-question.v1",
  data: {
    session_id: "msess_1", mastery_set_id: SET_ID, artifact_digest: ART,
    display_revision: "disprev_ahri-syndra-e.v1", sequence_index: 0, total_steps: 6,
    question_family: "cooldown_comparison", answer_type: "numeric", answer_options: [],
    input_constraints: { unit: "seconds", min: 0, max: null, step: null, integer_only: false },
    prompt: "By how many seconds…?", state: stateView(S0), patch_display: "Mixed snapshot",
    matchup_identity: { champion_a: "ahri", champion_b: "syndra", focus: "E_vs_E" },
    is_read_only: true, hint_available: false, ...extra,
  },
});
const revealEnvelope = () => ({
  projection_type: "mastery_player_reveal", schema_version: "mastery-player-reveal.v1",
  data: {
    session_id: "msess_1", mastery_set_id: SET_ID, artifact_digest: ART,
    display_revision: "disprev_ahri-syndra-e.v1", sequence_index: 0,
    question_family: "cooldown_comparison", player_answer: 3, authoritative_correctness: true,
    correct_answer: 3, explanation: "…", calculation_steps: [],
    before_state: stateView(S0), after_state: stateView(S0),
    applied_transition: null, proposed_transition: null,
    source_summary: { label: "src", source_count: 3 },
    next_step_ready: true, completion_state: { is_final_step: false, set_completed: false },
  },
});

afterEach(() => vi.restoreAllMocks());

describe("mastery live api client", () => {
  it("parses a published set list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok({ sets: [{
      mastery_set_id: SET_ID, artifact_digest: ART, display_revision: "disprev_ahri-syndra-e.v1",
      title: "Ahri vs Syndra", display_summary: "…", total_steps: 6,
    }] }));
    const sets = await listSets();
    expect(sets[0].masterySetId).toBe(SET_ID);
  });

  it("parses a valid start view with the Q1 question", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok({ session: sessionData(), question: questionEnvelope(), reveal: null, summary: null }));
    const view = await startSession(SET_ID);
    expect(view.question?.sequenceIndex).toBe(0);
    expect(view.question?.answerType).toBe("numeric");
  });

  it("rejects a leaked correct_answer field in a question payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok({
      session: sessionData(),
      question: questionEnvelope({ correct_answer: 3 }),
      reveal: null, summary: null,
    }));
    await expect(startSession(SET_ID)).rejects.toBeInstanceOf(MasteryApiError);
    await expect(startSession(SET_ID)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("parses a reveal", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(revealEnvelope()));
    const reveal = await submitAnswer("msess_1", 0, 3);
    expect(reveal.authoritativeCorrectness).toBe(true);
    expect(reveal.correctAnswer).toBe(3);
  });

  it("maps a 409 to a conflict error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(err(409, "MASTERY_ANSWER_CONFLICT"));
    const e = await submitAnswer("msess_1", 0, 4).catch((x) => x);
    expect(isConflict(e)).toBe(true);
  });

  it("maps a 403 to a forbidden error on the reviewer route", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(err(403, "Admin authorization required"));
    const e = await getReviewerArtifact(ART).catch((x) => x);
    expect(isForbidden(e)).toBe(true);
  });
});
