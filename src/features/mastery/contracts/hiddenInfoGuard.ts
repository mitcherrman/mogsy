/**
 * Answer-key leakage guard for pre-submission Mastery payloads (G5.2A).
 *
 * A player-question payload must never carry a correct answer, an explanation, a
 * calculation, a post-transition state, or any provenance value from which the
 * answer could be reconstructed. This recursive guard fails CLOSED: it inspects
 * every nested object/array key, and on the first forbidden key it throws with
 * the exact offending path. It never silently strips fields — a leak is a hard
 * error, and the caller additionally allowlist-projects the payload afterwards.
 */

import { MasteryContractParseError } from "./common";

/**
 * Keys that reveal (directly or indirectly) a canonical answer. Matched
 * case-insensitively against every key at every depth. This is a blocklist used
 * ONLY as a tripwire; the real safety is the allowlist projection in the
 * player-question reader — never rely on this guard alone.
 */
export const FORBIDDEN_ANSWER_KEYS: readonly string[] = [
  "correct_answer",
  "correctanswer",
  "authoritative_correctness",
  "authoritativecorrectness",
  "explanation",
  "calculation_result",
  "calculationresult",
  "calculation_steps",
  "calculationsteps",
  "recomputation",
  "state_changes",
  "statechanges",
  "applied_transition",
  "appliedtransition",
  "proposed_transition",
  "proposedtransition",
  "after_snapshot",
  "aftersnapshot",
  "after_snapshot_id",
  "aftersnapshotid",
  "after_state",
  "afterstate",
  "eligibility_evidence",
  "eligibilityevidence",
  "source_records",
  "sourcerecords",
  "damage_applied",
  "damageapplied",
  "health_remaining",
  "healthremaining",
  "reaches_zero",
  "reacheszero",
  "overkill",
];

const FORBIDDEN_SET = new Set(FORBIDDEN_ANSWER_KEYS.map((k) => k.toLowerCase()));

/**
 * Throw if any forbidden answer-revealing key appears anywhere in `value`.
 * @param value  the raw parsed payload (typically the whole envelope body).
 * @param label  root path label used in the reported offending path.
 */
export function assertNoAnswerKey(value: unknown, label = "payload"): void {
  walk(value, label);
}

function walk(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) walk(value[i], `${path}[${i}]`);
    return;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_SET.has(key.toLowerCase())) {
      throw new MasteryContractParseError(
        `forbidden answer-revealing field "${key}" is not permitted in a pre-submission payload`,
        `${path}.${key}`,
      );
    }
    walk((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}
