/**
 * Session-view contract regression (Claude G1).
 *
 * Uses the REAL client (real parsers) with only fetch mocked, driving the exact
 * serialized shapes the backend produces. Guards the blank-player defect: the
 * unified {session, question, reveal, summary} start response must render Q1, and
 * the legacy {session, current} shape must fail closed (never a blank player).
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startSession } from "./api";
import { MasteryPlayerLive } from "./MasteryPlayerLive";

vi.mock("@/lib/backend-auth", () => ({ getBackendAuthHeaders: async () => ({}) }));

const SET = "mset_aaf6c0553e4d9339ea3295317275e116f2ef0a8f867a34302675f2dea5abc83c";
const ART = "martifact_a91f1584089d0c1d2ef4a14c35ad071bcccf5e473f6d50ebb76206870465fe90";
const S0 = "snap_257350f8b649e44f6c90609da32c36da39c051d0fb493f9391190f40ea334e0a";

const champ = (id: string) => ({
  champion_id: id, display_name: id, current_health: 500, max_health: null,
  resource_type: "mana", current_resource: 400, max_resource: null,
  active_effects: [], inventory_summary: [],
});
const questionEnvelope = () => ({
  projection_type: "mastery_player_question", schema_version: "mastery-player-question.v1",
  data: {
    session_id: "msess_1", mastery_set_id: SET, artifact_digest: ART,
    display_revision: "disprev_ahri-syndra-e.v1", sequence_index: 0, total_steps: 6,
    question_family: "cooldown_comparison", answer_type: "numeric", answer_options: [],
    input_constraints: { unit: "seconds", min: 0, max: null, step: null, integer_only: false },
    prompt: "By how many seconds is Ahri E lower than Syndra E?",
    state: {
      snapshot_id: S0, patch_key_digest: "patchkey_x", validation_status: "certified",
      label: "Initial state", champion_a: champ("ahri"), champion_b: champ("syndra"),
    },
    patch_display: "Mixed snapshot", matchup_identity: { champion_a: "ahri", champion_b: "syndra", focus: "E_vs_E" },
    is_read_only: true, hint_available: false,
  },
});
const sessionData = () => ({
  session_id: "msess_1", mastery_set_id: SET, artifact_digest: ART,
  display_revision: "disprev_ahri-syndra-e.v1", current_sequence_index: 0,
  total_steps: 6, phase: "question", completed: false,
});
// The corrected backend shape.
const unifiedStart = () => ({ session: sessionData(), question: questionEnvelope(), reveal: null, summary: null });
// The old, defective backend shape that produced the blank player.
const legacyStart = () => ({ session: sessionData(), current: questionEnvelope() });

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

afterEach(() => vi.restoreAllMocks());

describe("session-view contract (real client)", () => {
  it("parses the unified start response with a non-null Q1 question", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(unifiedStart()));
    const view = await startSession(SET);
    expect(view.question).not.toBeNull();
    expect(view.question?.sequenceIndex).toBe(0);
    expect(view.reveal).toBeNull();
    expect(view.summary).toBeNull();
  });

  it("renders Q1 in the live player from the unified backend shape (not blank)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(unifiedStart()));
    render(<MasteryPlayerLive masterySetId={SET} />);
    expect(await screen.findByTestId("mastery-question-heading")).toBeTruthy();
    expect(screen.getByTestId("mastery-numeric-input")).toBeTruthy();
  });

  it("fails closed (no blank player) if the legacy {session, current} shape is returned", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(legacyStart()));
    render(<MasteryPlayerLive masterySetId={SET} />);
    // The legacy shape has no top-level `question`, so boot must surface an error
    // rather than mount a blank question phase.
    expect(await screen.findByTestId("mastery-player-error")).toBeTruthy();
    expect(screen.queryByTestId("mastery-question-heading")).toBeNull();
  });
});
