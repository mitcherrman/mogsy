/**
 * Live Mastery container tests (H1 / G7). The API module is mocked; the
 * containers must render backend-provided state, submit answers, advance, resume,
 * surface a recoverable conflict, and never compute correctness locally.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseMasteryPlayerQuestion,
  parseMasteryPlayerReveal,
  parseMasteryReviewArtifact,
  readSessionState,
} from "../contracts";
import reviewFixture from "../__fixtures__/review_artifact.json";

const SET_ID = "mset_aaf6c0553e4d9339ea3295317275e116f2ef0a8f867a34302675f2dea5abc83c";
const ART = "martifact_a91f1584089d0c1d2ef4a14c35ad071bcccf5e473f6d50ebb76206870465fe90";
const S0 = "snap_257350f8b649e44f6c90609da32c36da39c051d0fb493f9391190f40ea334e0a";
const S1 = "snap_35494d698025bab89ac03ee1dbd862924bb07ae190efbf69510db6acb14ab49e";

const champ = (id: string) => ({
  champion_id: id, display_name: id, current_health: 500, max_health: null,
  resource_type: "mana", current_resource: 400, max_resource: null,
  active_effects: [], inventory_summary: [],
});
const stateView = (sid: string, label: string) => ({
  snapshot_id: sid, patch_key_digest: "patchkey_x", validation_status: "certified",
  label, champion_a: champ("ahri"), champion_b: champ("syndra"),
});
const qEnv = (seq: number, sid: string, label: string, prompt: string) => ({
  projection_type: "mastery_player_question", schema_version: "mastery-player-question.v1",
  data: {
    session_id: "msess_1", mastery_set_id: SET_ID, artifact_digest: ART,
    display_revision: "disprev_ahri-syndra-e.v1", sequence_index: seq, total_steps: 6,
    question_family: "cooldown_comparison", answer_type: "numeric", answer_options: [],
    input_constraints: { unit: "seconds", min: 0, max: null, step: null, integer_only: false },
    prompt, state: stateView(sid, label), patch_display: "Mixed snapshot",
    matchup_identity: { champion_a: "ahri", champion_b: "syndra", focus: "E_vs_E" },
    is_read_only: true, hint_available: false,
  },
});
const rEnv = (seq: number, correct: boolean, answer: number) => ({
  projection_type: "mastery_player_reveal", schema_version: "mastery-player-reveal.v1",
  data: {
    session_id: "msess_1", mastery_set_id: SET_ID, artifact_digest: ART,
    display_revision: "disprev_ahri-syndra-e.v1", sequence_index: seq,
    question_family: "cooldown_comparison", player_answer: answer, authoritative_correctness: correct,
    correct_answer: 3, explanation: "Ahri E 12 vs Syndra E 15.", calculation_steps: [],
    before_state: stateView(S0, "Initial state"), after_state: stateView(S1, "After +20 haste"),
    applied_transition: null, proposed_transition: null,
    source_summary: { label: "src", source_count: 3 },
    next_step_ready: true, completion_state: { is_final_step: false, set_completed: false },
  },
});
const session = (seq: number, phase: string, completed = false) => ({
  session_id: "msess_1", mastery_set_id: SET_ID, artifact_digest: ART,
  display_revision: "disprev_ahri-syndra-e.v1", current_sequence_index: seq,
  total_steps: 6, phase, completed,
});
const view = (o: { session: unknown; question?: unknown; reveal?: unknown; summary?: unknown }) => ({
  session: readSessionState(o.session),
  question: o.question ? parseMasteryPlayerQuestion(o.question) : null,
  reveal: o.reveal ? parseMasteryPlayerReveal(o.reveal) : null,
  summary: o.summary ?? null,
});

const api = vi.hoisted(() => ({
  listSets: vi.fn(), startSession: vi.fn(), getCurrent: vi.fn(),
  submitAnswer: vi.fn(), advance: vi.fn(), getReviewerArtifact: vi.fn(),
}));

vi.mock("./api", () => ({
  ...api,
  MasteryApiError: class extends Error { status = 0; kind = "backend"; code: string | null = null; },
  isAborted: () => false,
  isConflict: (e: unknown) => (e as { status?: number })?.status === 409,
  isForbidden: (e: unknown) => (e as { status?: number })?.status === 403,
  isNotFound: (e: unknown) => (e as { status?: number })?.status === 404,
}));

// Imported AFTER the mock is registered.
import { MasteryPlayerLive } from "./MasteryPlayerLive";
import { MasteryReviewerLive } from "./MasteryReviewerLive";

afterEach(() => vi.clearAllMocks());

describe("MasteryPlayerLive", () => {
  it("starts the session and renders Q1 (backend-provided)", async () => {
    api.listSets.mockResolvedValue([{ masterySetId: SET_ID }]);
    api.startSession.mockResolvedValue(view({ session: session(0, "question"), question: qEnv(0, S0, "Initial state", "Q1 prompt?") }));
    render(<MasteryPlayerLive masterySetId={SET_ID} />);
    expect(await screen.findByTestId("mastery-question-heading")).toBeTruthy();
    expect(screen.getByText("Q1 prompt?")).toBeTruthy();
  });

  it("submits an answer and shows the backend correctness verdict", async () => {
    api.startSession.mockResolvedValue(view({ session: session(0, "question"), question: qEnv(0, S0, "Initial state", "Q1?") }));
    api.submitAnswer.mockResolvedValue(parseMasteryPlayerReveal(rEnv(0, true, 3)));
    render(<MasteryPlayerLive masterySetId={SET_ID} />);
    await screen.findByTestId("mastery-numeric-input");
    fireEvent.change(screen.getByTestId("mastery-numeric-input"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("mastery-submit-button"));
    expect(await screen.findByTestId("mastery-correctness")).toBeTruthy();
    expect(api.submitAnswer).toHaveBeenCalledWith("msess_1", 0, 3);
  });

  it("uses the backend verdict for a wrong answer (no local correctness)", async () => {
    api.startSession.mockResolvedValue(view({ session: session(0, "question"), question: qEnv(0, S0, "Initial state", "Q1?") }));
    api.submitAnswer.mockResolvedValue(parseMasteryPlayerReveal(rEnv(0, false, 999)));
    render(<MasteryPlayerLive masterySetId={SET_ID} />);
    await screen.findByTestId("mastery-numeric-input");
    fireEvent.change(screen.getByTestId("mastery-numeric-input"), { target: { value: "999" } });
    fireEvent.click(screen.getByTestId("mastery-submit-button"));
    const verdict = await screen.findByTestId("mastery-correctness");
    expect(verdict.textContent?.toLowerCase()).toContain("incorrect");
  });

  it("restores the reveal phase on refresh (resume)", async () => {
    api.startSession.mockResolvedValue(view({
      session: session(0, "reveal"),
      question: qEnv(0, S0, "Initial state", "Q1?"),
      reveal: rEnv(0, true, 3),
    }));
    render(<MasteryPlayerLive masterySetId={SET_ID} />);
    expect(await screen.findByTestId("mastery-reveal-heading")).toBeTruthy();
  });

  it("shows a recoverable conflict then resyncs from the server", async () => {
    api.startSession.mockResolvedValue(view({ session: session(0, "question"), question: qEnv(0, S0, "Initial state", "Q1?") }));
    api.submitAnswer.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
    api.getCurrent.mockResolvedValue(view({
      session: session(0, "reveal"), question: qEnv(0, S0, "Initial state", "Q1?"), reveal: rEnv(0, true, 3),
    }));
    render(<MasteryPlayerLive masterySetId={SET_ID} />);
    await screen.findByTestId("mastery-numeric-input");
    fireEvent.change(screen.getByTestId("mastery-numeric-input"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("mastery-submit-button"));
    expect(await screen.findByTestId("mastery-player-conflict")).toBeTruthy();
  });

  it("renders the completion panel from a backend summary", async () => {
    api.startSession.mockResolvedValue(view({ session: session(0, "question"), question: qEnv(0, S0, "Initial state", "Q1?") }));
    api.submitAnswer.mockResolvedValue(parseMasteryPlayerReveal(rEnv(0, true, 3)));
    api.advance.mockResolvedValue({ session: readSessionState(session(5, "completed", true)),
      question: null, reveal: null, summary: { sessionId: "msess_1", totalSteps: 6, answeredCount: 6, correctCount: 6, completed: true } });
    render(<MasteryPlayerLive masterySetId={SET_ID} />);
    await screen.findByTestId("mastery-numeric-input");
    fireEvent.change(screen.getByTestId("mastery-numeric-input"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("mastery-submit-button"));
    fireEvent.click(await screen.findByTestId("mastery-next-button"));
    expect(await screen.findByTestId("mastery-player-completion")).toBeTruthy();
  });
});

describe("MasteryReviewerLive", () => {
  it("renders the inspector from a live projection", async () => {
    api.getReviewerArtifact.mockResolvedValue(parseMasteryReviewArtifact(reviewFixture));
    render(<MasteryReviewerLive artifactDigest={ART} />);
    expect(await screen.findByTestId("mastery-reviewer-inspector")).toBeTruthy();
  });

  it("shows an error state when the projection is incomplete/invalid", async () => {
    api.getReviewerArtifact.mockRejectedValue(Object.assign(new Error("bad"), { status: 500 }));
    render(<MasteryReviewerLive artifactDigest={ART} />);
    expect(await screen.findByTestId("mastery-reviewer-error")).toBeTruthy();
  });

  it("shows a forbidden state on 403", async () => {
    api.getReviewerArtifact.mockRejectedValue(Object.assign(new Error("nope"), { status: 403 }));
    render(<MasteryReviewerLive artifactDigest={ART} />);
    expect(await screen.findByTestId("mastery-reviewer-forbidden")).toBeTruthy();
  });
});
