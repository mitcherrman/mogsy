/**
 * Shared primitives for the Mastery Set frontend transport contracts (G5.2A).
 *
 * These follow the `ranked-public` house style: a single typed parse error plus
 * small, explicit runtime validators. There is no schema/validation library
 * here on purpose — the frontend hand-validates every field, never blind-casts a
 * `response.json()`, and never computes a canonical value. This module has NO
 * imports from other contract files so the package stays acyclic.
 */

export class MasteryContractParseError extends Error {
  /** Dotted path to the offending value, when known (e.g. `data.state.champion_a`). */
  readonly path?: string;

  constructor(message: string, path?: string) {
    super(path ? `Mastery contract: ${message} (at ${path})` : `Mastery contract: ${message}`);
    this.name = "MasteryContractParseError";
    this.path = path;
  }
}

// ------------------------------------------------------------- primitives

export function rec(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MasteryContractParseError(`${label} must be an object`, label);
  }
  return value as Record<string, unknown>;
}

export function str(value: unknown, label: string): string {
  if (typeof value !== "string") throw new MasteryContractParseError(`${label} must be a string`, label);
  return value;
}

export function nonEmptyStr(value: unknown, label: string): string {
  const s = str(value, label);
  if (s.length === 0) throw new MasteryContractParseError(`${label} must be a non-empty string`, label);
  return s;
}

export function nstr(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new MasteryContractParseError(`${label} must be a string or null`, label);
  return value;
}

/** A finite number — rejects NaN and ±Infinity, which snapshot/answer values never are. */
export function num(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MasteryContractParseError(`${label} must be a finite number`, label);
  }
  return value;
}

export function nnum(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return num(value, label);
}

export function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new MasteryContractParseError(`${label} must be a boolean`, label);
  return value;
}

export function nbool(value: unknown, label: string): boolean | null {
  if (value === null || value === undefined) return null;
  return bool(value, label);
}

/** A non-negative integer index (sequence_index / total_steps). Rejects floats and negatives. */
export function intIndex(value: unknown, label: string): number {
  const n = num(value, label);
  if (!Number.isInteger(n) || n < 0) {
    throw new MasteryContractParseError(`${label} must be a non-negative integer`, label);
  }
  return n;
}

export function strList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new MasteryContractParseError(`${label} must be an array`, label);
  return value.map((v, i) => str(v, `${label}[${i}]`));
}

export function arr(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new MasteryContractParseError(`${label} must be an array`, label);
  return value;
}

/** A JSON scalar answer value (single_choice string, numeric number, boolean). */
export function scalar(value: unknown, label: string): string | number | boolean {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return num(value, label);
  throw new MasteryContractParseError(`${label} must be a string, finite number, or boolean`, label);
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const s = str(value, label);
  if (!(allowed as readonly string[]).includes(s)) {
    throw new MasteryContractParseError(`${label} must be one of ${allowed.join(", ")} (got "${s}")`, label);
  }
  return s as T;
}

// ------------------------------------------------------------------ enums

export const ANSWER_TYPES = ["single_choice", "numeric", "boolean"] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

export const REVIEWER_STATUSES = [
  "unreviewed",
  "in_review",
  "approved",
  "changes_requested",
  "rejected",
] as const;
export type ReviewerStatus = (typeof REVIEWER_STATUSES)[number];

export const PUBLICATION_STATUSES = [
  "draft",
  "eligible_for_publication",
  "published",
  "withdrawn",
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const SESSION_PHASES = [
  "question",
  "submitting",
  "reveal",
  "advancing",
  "completed",
] as const;
export type SessionPhase = (typeof SESSION_PHASES)[number];

/**
 * Question family is validated as a non-empty string rather than a closed union:
 * the backend `QuestionFamily` enum grows independently, and a display DTO must
 * not reject an otherwise-valid future family. It is never used to compute
 * anything, only to label.
 */
export type MasteryQuestionFamily = string;
