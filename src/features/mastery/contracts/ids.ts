/**
 * Opaque, branded ID types for Mastery Set contracts (G5.2A).
 *
 * The frontend NEVER generates these values — every canonical identity is minted
 * by the backend (content hashes / typed digests). These validators only confirm
 * a backend-provided string carries the expected prefix and preserve it exactly.
 * Prefixes mirror `mastery/questions/identity.py` and the capsule/snapshot/
 * transition contracts at backend commit ea527ee.
 */

import { MasteryContractParseError, str } from "./common";

// A structural brand: a plain string at runtime, distinct at the type level.
declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type MasterySetId = Brand<string, "MasterySetId">;
export type MasteryArtifactDigest = Brand<string, "MasteryArtifactDigest">;
export type MasteryStepId = Brand<string, "MasteryStepId">;
export type MasterySnapshotId = Brand<string, "MasterySnapshotId">;
export type MasteryTransitionId = Brand<string, "MasteryTransitionId">;
export type MasteryCapsuleId = Brand<string, "MasteryCapsuleId">;
export type MasterySessionId = Brand<string, "MasterySessionId">;
export type MasteryDisplayRevision = Brand<string, "MasteryDisplayRevision">;

// Canonical backend prefixes (authoritative — do not invent new ones client-side).
export const ID_PREFIXES = {
  masterySet: "mset_",
  artifactDigest: "martifact_",
  step: "mqstep_",
  snapshot: "snap_",
  transition: "txn_",
  capsule: "rankcapsule_",
} as const;

function branded<T extends string>(value: unknown, prefix: string, label: string): T {
  const s = str(value, label);
  if (!s.startsWith(prefix)) {
    throw new MasteryContractParseError(`${label} must start with "${prefix}" (got "${s}")`, label);
  }
  if (s.length <= prefix.length) {
    throw new MasteryContractParseError(`${label} carries no body after the "${prefix}" prefix`, label);
  }
  return s as T;
}

export function masterySetId(value: unknown, label = "mastery_set_id"): MasterySetId {
  return branded<MasterySetId>(value, ID_PREFIXES.masterySet, label);
}
export function artifactDigest(value: unknown, label = "artifact_digest"): MasteryArtifactDigest {
  return branded<MasteryArtifactDigest>(value, ID_PREFIXES.artifactDigest, label);
}
export function stepId(value: unknown, label = "step_id"): MasteryStepId {
  return branded<MasteryStepId>(value, ID_PREFIXES.step, label);
}
export function snapshotId(value: unknown, label = "snapshot_id"): MasterySnapshotId {
  return branded<MasterySnapshotId>(value, ID_PREFIXES.snapshot, label);
}
export function transitionId(value: unknown, label = "transition_id"): MasteryTransitionId {
  return branded<MasteryTransitionId>(value, ID_PREFIXES.transition, label);
}
export function capsuleId(value: unknown, label = "capsule_id"): MasteryCapsuleId {
  return branded<MasteryCapsuleId>(value, ID_PREFIXES.capsule, label);
}

/**
 * Session and display-revision IDs are publication/runtime-layer identifiers, not
 * canonical artifact hashes, so they carry no mandated prefix — only a non-empty
 * string invariant. They are still branded so they cannot be crossed with
 * canonical IDs at the type level.
 */
export function sessionId(value: unknown, label = "session_id"): MasterySessionId {
  const s = str(value, label);
  if (s.length === 0) throw new MasteryContractParseError(`${label} must be non-empty`, label);
  return s as MasterySessionId;
}
export function displayRevision(value: unknown, label = "display_revision"): MasteryDisplayRevision {
  const s = str(value, label);
  if (s.length === 0) throw new MasteryContractParseError(`${label} must be non-empty`, label);
  return s as MasteryDisplayRevision;
}
