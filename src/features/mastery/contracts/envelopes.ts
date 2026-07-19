/**
 * Versioned transport envelopes for Mastery projections (G5.2A).
 *
 * Mirrors the ranked-public envelope discipline: every backend response is a
 * `{ projection_type, schema_version, data }` wrapper. Parsers reject an unknown
 * projection, an unexpected schema version, or a missing `data` object before
 * any field of the payload is read.
 */

import { MasteryContractParseError, rec, str } from "./common";

export const MASTERY_PROJECTIONS = {
  playerQuestion: "mastery_player_question",
  playerReveal: "mastery_player_reveal",
  reviewArtifact: "mastery_review_artifact",
} as const;

export const MASTERY_SCHEMA_PREFIXES = {
  playerQuestion: "mastery-player-question.v1",
  playerReveal: "mastery-player-reveal.v1",
  reviewArtifact: "mastery-review-artifact.v1",
} as const;

export interface MasteryEnvelope {
  readonly schemaVersion: string;
  readonly projectionType: string;
  readonly data: Record<string, unknown>;
}

/**
 * Validate and unwrap a `{ projection_type, schema_version, data }` envelope.
 * @param body          the raw parsed response body.
 * @param expectedType  required `projection_type`.
 * @param versionPrefix required `schema_version` prefix.
 */
export function readEnvelope(
  body: unknown,
  expectedType: string,
  versionPrefix: string,
): MasteryEnvelope {
  const env = rec(body, "envelope");

  const projectionType = str(env.projection_type, "projection_type");
  if (projectionType !== expectedType) {
    throw new MasteryContractParseError(
      `expected projection_type "${expectedType}" (got "${projectionType}")`,
      "projection_type",
    );
  }

  const schema = str(env.schema_version, "schema_version");
  if (!schema.startsWith(versionPrefix)) {
    throw new MasteryContractParseError(
      `unexpected schema_version "${schema}" (expected prefix "${versionPrefix}")`,
      "schema_version",
    );
  }

  if (!("data" in env) || env.data === null || env.data === undefined) {
    throw new MasteryContractParseError(`envelope is missing "data"`, "data");
  }

  return {
    schemaVersion: schema,
    projectionType,
    data: rec(env.data, "data"),
  };
}
