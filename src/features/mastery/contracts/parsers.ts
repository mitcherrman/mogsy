/**
 * Top-level Mastery projection parsers (G5.2A).
 *
 * Each parser: (1) unwraps and version-checks the envelope, (2) for the
 * pre-submission player question, runs the recursive answer-key guard over the
 * ENTIRE envelope before accepting anything, then (3) allowlist-projects the
 * `data` into a typed, immutable view. No parser calls the network, touches
 * Supabase, or computes a canonical value.
 */

import { assertNoAnswerKey } from "./hiddenInfoGuard";
import { MASTERY_PROJECTIONS, MASTERY_SCHEMA_PREFIXES, readEnvelope } from "./envelopes";
import { MasteryPlayerQuestion, readPlayerQuestion } from "./playerQuestion";
import { MasteryPlayerReveal, readPlayerReveal } from "./playerReveal";
import {
  MasteryReviewArtifact,
  MasteryReviewRecord,
  readReviewArtifact,
  readReviewRecord,
} from "./review";
import { rec } from "./common";

/**
 * Parse a pre-submission player-question envelope. Fails closed on any
 * answer-revealing field anywhere in the body, then allowlist-projects.
 */
export function parseMasteryPlayerQuestion(body: unknown): MasteryPlayerQuestion {
  // Guard the whole body first — a leak anywhere is a hard error.
  assertNoAnswerKey(body, "player_question");
  const env = readEnvelope(
    body,
    MASTERY_PROJECTIONS.playerQuestion,
    MASTERY_SCHEMA_PREFIXES.playerQuestion,
  );
  return readPlayerQuestion(env.data);
}

/** Parse a post-submission reveal envelope (answer evidence permitted). */
export function parseMasteryPlayerReveal(body: unknown): MasteryPlayerReveal {
  const env = readEnvelope(
    body,
    MASTERY_PROJECTIONS.playerReveal,
    MASTERY_SCHEMA_PREFIXES.playerReveal,
  );
  return readPlayerReveal(env.data);
}

export interface MasteryReviewBundle {
  readonly artifact: MasteryReviewArtifact;
  readonly reviewRecord: MasteryReviewRecord;
}

/**
 * Parse a reviewer envelope: `data = { artifact, review_record }`. Full evidence
 * is permitted here — this surface is admin-gated.
 */
export function parseMasteryReviewArtifact(body: unknown): MasteryReviewBundle {
  const env = readEnvelope(
    body,
    MASTERY_PROJECTIONS.reviewArtifact,
    MASTERY_SCHEMA_PREFIXES.reviewArtifact,
  );
  const data = rec(env.data, "data");
  return {
    artifact: readReviewArtifact(data.artifact, "data.artifact"),
    reviewRecord: readReviewRecord(data.review_record, "data.review_record"),
  };
}
