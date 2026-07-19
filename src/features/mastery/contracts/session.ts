/**
 * Player-session state contract (G5.2A).
 *
 * `MasterySessionState` is the backend-owned view of a player's progress through
 * a Mastery Set. The `phase` is a closed enum. This is a read model only: it
 * carries no mutation methods, and a browser-local phase change is NEVER
 * permission to advance the backend session — progression is a server transition
 * keyed to the server-side cursor.
 */

import { SessionPhase, bool, intIndex, oneOf, rec } from "./common";
import {
  MasteryArtifactDigest,
  MasteryDisplayRevision,
  MasterySessionId,
  MasterySetId,
  artifactDigest,
  displayRevision,
  masterySetId,
  sessionId,
} from "./ids";

export interface MasterySessionState {
  readonly sessionId: MasterySessionId;
  readonly masterySetId: MasterySetId;
  readonly artifactDigest: MasteryArtifactDigest;
  readonly displayRevision: MasteryDisplayRevision;
  readonly currentSequenceIndex: number;
  readonly totalSteps: number;
  readonly phase: SessionPhase;
  readonly completed: boolean;
}

export function readSessionState(value: unknown, label = "data"): MasterySessionState {
  const d = rec(value, label);
  return {
    sessionId: sessionId(d.session_id, `${label}.session_id`),
    masterySetId: masterySetId(d.mastery_set_id, `${label}.mastery_set_id`),
    artifactDigest: artifactDigest(d.artifact_digest, `${label}.artifact_digest`),
    displayRevision: displayRevision(d.display_revision, `${label}.display_revision`),
    currentSequenceIndex: intIndex(d.current_sequence_index, `${label}.current_sequence_index`),
    totalSteps: intIndex(d.total_steps, `${label}.total_steps`),
    phase: oneOf(d.phase, ["question", "submitting", "reveal", "advancing", "completed"], `${label}.phase`),
    completed: bool(d.completed, `${label}.completed`),
  };
}
