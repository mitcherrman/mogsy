import { describe, expect, it } from "vitest";

import { MasteryContractParseError } from "./common";
import { ID_PREFIXES } from "./ids";
import {
  parseMasteryPlayerQuestion,
  parseMasteryPlayerReveal,
  parseMasteryReviewArtifact,
} from "./parsers";
import {
  ARTIFACT_DIGEST,
  SET_ID,
  SNAP0,
  SNAP1,
  SNAP2,
  STEP_IDS,
  TXN1,
  playerQuestionEnvelopes,
  playerRevealEnvelopes,
  reviewArtifactEnvelope,
} from "../fixtures";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("player-question parsing", () => {
  it("parses all six valid question fixtures", () => {
    const parsed = playerQuestionEnvelopes().map(parseMasteryPlayerQuestion);
    expect(parsed).toHaveLength(6);
    expect(parsed[0].answerType).toBe("numeric");
    expect(parsed[5].answerType).toBe("boolean");
    expect(parsed[4].isReadOnly).toBe(false); // Q5 is transition-bound
    expect(parsed[0].isReadOnly).toBe(true);
  });

  it("Q1 embeds S0 with no authored haste effect; Q2 embeds S1 carrying it", () => {
    const [q1, q2] = playerQuestionEnvelopes().map(parseMasteryPlayerQuestion);
    // Q1: initial state S0, read-only, Syndra at 480, Ahri unbuffed.
    expect(q1.state.snapshotId).toBe(SNAP0);
    expect(q1.isReadOnly).toBe(true);
    expect(q1.state.championA.activeEffects).toHaveLength(0);
    expect(q1.state.championB.currentHealth).toBe(480);
    // Q2: state S1, Ahri carries the authored +20 ability-haste effect.
    expect(q2.state.snapshotId).toBe(SNAP1);
    expect(q2.state.championA.activeEffects[0]?.magnitude).toBe(20);
    expect(q2.state.championA.activeEffects[0]?.unit).toBe("ability_haste");
  });

  it("preserves opaque IDs exactly", () => {
    const q = parseMasteryPlayerQuestion(playerQuestionEnvelopes()[0]);
    expect(q.masterySetId).toBe(SET_ID);
    expect(q.artifactDigest).toBe(ARTIFACT_DIGEST);
    expect(q.state.snapshotId.startsWith(ID_PREFIXES.snapshot)).toBe(true);
  });

  it("rejects the wrong projection_type", () => {
    const env = clone(playerQuestionEnvelopes()[0]);
    env.projection_type = "mastery_player_reveal";
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/projection_type/);
  });

  it("rejects an unknown schema_version", () => {
    const env = clone(playerQuestionEnvelopes()[0]);
    env.schema_version = "mastery-player-question.v2";
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/schema_version/);
  });

  it("rejects a missing required field", () => {
    const env = clone(playerQuestionEnvelopes()[0]);
    delete (env.data as Record<string, unknown>).prompt;
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/prompt/);
  });

  it("rejects a wrong ID prefix", () => {
    const env = clone(playerQuestionEnvelopes()[0]);
    (env.data as Record<string, unknown>).mastery_set_id = "wrong_abc";
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/mastery_set_id/);
  });

  it("rejects a non-finite number", () => {
    // JSON cannot represent Infinity, so mutate a fresh live fixture object.
    const live = playerQuestionEnvelopes()[0];
    const data = live.data as Record<string, unknown>;
    const state = data.state as Record<string, unknown>;
    const championB = state.champion_b as Record<string, unknown>;
    championB.current_health = Number.POSITIVE_INFINITY;
    expect(() => parseMasteryPlayerQuestion(live)).toThrow(/finite number/);
  });

  it("rejects a non-integer sequence_index", () => {
    const env = clone(playerQuestionEnvelopes()[0]);
    (env.data as Record<string, unknown>).sequence_index = 1.5;
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/sequence_index/);
  });

  it("rejects a single_choice payload that carries no options", () => {
    const env = clone(playerQuestionEnvelopes()[0]);
    (env.data as Record<string, unknown>).answer_type = "single_choice";
    (env.data as Record<string, unknown>).answer_options = [];
    delete (env.data as Record<string, unknown>).input_constraints;
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/answer_options/);
  });

  it("rejects a numeric payload that carries answer_options (wrong union shape)", () => {
    const env = clone(playerQuestionEnvelopes()[0]);
    (env.data as Record<string, unknown>).answer_options = ["3", "5"];
    expect(() => parseMasteryPlayerQuestion(env)).toThrow(/answer_options/);
  });

  it("is insensitive to object key order", () => {
    const env = playerQuestionEnvelopes()[0];
    const data = env.data as Record<string, unknown>;
    const reordered = { data: shuffleKeys(data), schema_version: env.schema_version, projection_type: env.projection_type };
    expect(() => parseMasteryPlayerQuestion(reordered)).not.toThrow();
  });
});

describe("player-reveal parsing", () => {
  it("parses all six reveal fixtures with answer evidence", () => {
    const parsed = playerRevealEnvelopes().map(parseMasteryPlayerReveal);
    expect(parsed).toHaveLength(6);
    expect(parsed[0].correctAnswer).toBe(3);
    expect(parsed[1].correctAnswer).toBe(10);
    expect(parsed[2].correctAnswer).toBe(5);
    expect(parsed[3].correctAnswer).toBe(325);
    expect(parsed[4].correctAnswer).toBe(230);
    expect(parsed[5].correctAnswer).toBe(true);
  });

  it("exposes the three transition-view arms with correct T1 sequencing", () => {
    const parsed = playerRevealEnvelopes().map(parseMasteryPlayerReveal);
    // Q1 applies the authored inter-step T1 (S0 -> S1).
    expect(parsed[0].appliedTransition?.classification).toBe("authored_effect");
    // Q2 reads the existing effect and applies nothing.
    expect(parsed[1].appliedTransition?.classification).toBe("state_unchanged");
    expect(parsed[3].appliedTransition?.classification).toBe("state_unchanged");
    // Q5 applies the question-proposed health change T2 (S1 -> S2).
    expect(parsed[4].appliedTransition?.classification).toBe("health_change");
    expect(parsed[5].proposedTransition?.classification).toBe("health_change");
    expect(parsed[5].completionState.setCompleted).toBe(true);
  });

  it("sequences T1 across Q1 (S0 -> S1) and holds S1 at Q2", () => {
    const q1 = parseMasteryPlayerReveal(playerRevealEnvelopes()[0]);
    const q2 = parseMasteryPlayerReveal(playerRevealEnvelopes()[1]);

    // Q1 reveal: before S0, after S1, applies T1 as an authored inter-step effect.
    expect(q1.beforeState.snapshotId).toBe(SNAP0);
    expect(q1.afterState.snapshotId).toBe(SNAP1);
    const applied = q1.appliedTransition;
    expect(applied?.classification).toBe("authored_effect");
    if (applied?.classification === "authored_effect") {
      expect(applied.origin).toBe("authored_inter_step");
      expect(applied.transitionId).toBe(TXN1);
      expect(applied.target).toBe("A");
      expect(applied.magnitude).toBe(20);
    }
    // Q1 shows S0 (no authored effect yet); its calc evidence is a base-cooldown
    // comparison and never claims to author/propose T1 (no authored effect, no TXN1).
    expect(q1.beforeState.championA.activeEffects).toHaveLength(0);
    const q1Text = JSON.stringify(q1.calculationSteps).toLowerCase();
    expect(q1Text).not.toContain("authored");
    expect(q1Text).not.toContain(TXN1.toLowerCase());
    expect(q1Text).not.toContain("+20");

    // Q2 reveal: begins and ends at S1, applies nothing, still shows the +20 effect.
    expect(q2.beforeState.snapshotId).toBe(SNAP1);
    expect(q2.afterState.snapshotId).toBe(SNAP1);
    expect(q2.appliedTransition?.classification).toBe("state_unchanged");
    expect(q2.beforeState.championA.activeEffects[0]?.magnitude).toBe(20);
  });

  it("carries audited before/after health for Q5 (T2) and holds S2 at Q6", () => {
    const q5 = parseMasteryPlayerReveal(playerRevealEnvelopes()[4]);
    expect(q5.beforeState.snapshotId).toBe(SNAP1);
    expect(q5.afterState.snapshotId).toBe(SNAP2);
    expect(q5.beforeState.championB.currentHealth).toBe(480);
    expect(q5.afterState.championB.currentHealth).toBe(230);
    if (q5.appliedTransition?.classification === "health_change") {
      expect(q5.appliedTransition.origin).toBe("question_proposed");
    }
    const q6 = parseMasteryPlayerReveal(playerRevealEnvelopes()[5]);
    expect(q6.beforeState.snapshotId).toBe(SNAP2);
    expect(q6.afterState.snapshotId).toBe(SNAP2);
    expect(q6.appliedTransition?.classification).toBe("state_unchanged");
  });
});

describe("reviewer parsing", () => {
  it("parses the full reviewer envelope with evidence", () => {
    const { artifact, reviewRecord } = parseMasteryReviewArtifact(reviewArtifactEnvelope());
    expect(artifact.masterySetId).toBe(SET_ID);
    expect(artifact.steps).toHaveLength(6);
    expect(artifact.steps.map((s) => s.stepId)).toEqual([...STEP_IDS]);
    expect(artifact.steps[0].correctAnswer).toBe(3);
    expect(artifact.steps[2].rankedCapsuleEligibility.eligible).toBe(false);
    expect(artifact.steps[4].transitionId).toBe(artifact.transitionChain[1].transition_id);
    expect(artifact.authoredTransitionIds).toHaveLength(1);
    expect(artifact.buildClassification.isProvenMeta).toBe(false);
    expect(reviewRecord.reviewerStatus).toBe("unreviewed");
    expect(reviewRecord.publicationStatus).toBe("draft");
  });

  it("rejects the wrong projection_type", () => {
    const env = clone(reviewArtifactEnvelope());
    env.projection_type = "mastery_player_question";
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/projection_type/);
  });
});

describe("session-state parsing", () => {
  it("parses a backend session envelope with a closed phase enum", async () => {
    const { readSessionState } = await import("./session");
    const state = readSessionState({
      session_id: "msess_1",
      mastery_set_id: SET_ID,
      artifact_digest: ARTIFACT_DIGEST,
      display_revision: "disprev_x.v1",
      current_sequence_index: 2,
      total_steps: 6,
      phase: "reveal",
      completed: false,
    });
    expect(state.phase).toBe("reveal");
    expect(state.currentSequenceIndex).toBe(2);
  });

  it("rejects an unknown phase", async () => {
    const { readSessionState } = await import("./session");
    expect(() =>
      readSessionState({
        session_id: "msess_1",
        mastery_set_id: SET_ID,
        artifact_digest: ARTIFACT_DIGEST,
        display_revision: "disprev_x.v1",
        current_sequence_index: 0,
        total_steps: 6,
        phase: "paused",
        completed: false,
      }),
    ).toThrow(/phase/);
  });
});

describe("package integrity", () => {
  it("imports the index barrel without cycles or missing exports", async () => {
    const mod = await import("./index");
    expect(typeof mod.parseMasteryPlayerQuestion).toBe("function");
    expect(typeof mod.parseMasteryPlayerReveal).toBe("function");
    expect(typeof mod.parseMasteryReviewArtifact).toBe("function");
    expect(typeof mod.assertNoAnswerKey).toBe("function");
    expect(mod.ID_PREFIXES.step).toBe("mqstep_");
  });
});

function shuffleKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj).reverse();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}
