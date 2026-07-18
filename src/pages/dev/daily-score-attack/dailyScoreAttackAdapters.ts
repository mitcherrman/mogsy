/**
 * Runtime readers for Daily Score Attack projections.
 *
 * Fail-closed: anything that does not match the committed backend contract
 * throws DsaParseError so the UI lands in a terminal error instead of
 * rendering guessed state. Active questions must never carry answer keys.
 */

import {
  DsaHistory,
  DsaQuestion,
  DsaResolution,
  DsaResults,
  DsaRun,
  DsaToday,
  HISTORY_SCHEMA,
  RESOLUTION_SCHEMA,
  RESULTS_SCHEMA,
  RUN_SCHEMA,
  TODAY_SCHEMA,
} from "./dailyScoreAttackTypes";

export class DsaParseError extends Error {}

function fail(message: string): never {
  throw new DsaParseError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonNegativeInt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer`);
  }
  return value;
}

function requireAwareTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} must be a string timestamp`);
  const stamp = value as string;
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(stamp)) fail(`${label} must carry a timezone`);
  if (Number.isNaN(Date.parse(stamp))) fail(`${label} is not a parseable timestamp`);
  return stamp;
}

function requireSchema(value: unknown, expected: string): void {
  if (value !== expected) fail(`unexpected schema_version (wanted ${expected})`);
}

function readQuestion(raw: unknown): DsaQuestion {
  if (!isRecord(raw)) fail("question must be an object");
  const q = raw as Record<string, unknown>;
  if ("correct_index" in q) fail("active question must not expose correct_index");
  if ("explanation" in q) fail("active question must not expose explanation");
  const sequence = requireNonNegativeInt(q.sequence, "question.sequence");
  if (sequence < 1 || sequence > 30) fail("question.sequence out of range");
  if (!Array.isArray(q.choices) || q.choices.length < 2) {
    fail("question.choices must list at least two options");
  }
  if (typeof q.question_text !== "string" || !q.question_text) {
    fail("question.question_text missing");
  }
  return {
    sequence,
    question_id: requireNonNegativeInt(q.question_id, "question.question_id"),
    question_text: q.question_text,
    choices: q.choices as DsaQuestion["choices"],
    difficulty_label: (q.difficulty_label as DsaQuestion["difficulty_label"]) ?? "easy",
    category: (q.category as string | null) ?? null,
    image_path: (q.image_path as string | null) ?? null,
  };
}

function readRunCore(raw: unknown, expectedSchema: string): DsaRun {
  if (!isRecord(raw)) fail("run projection must be an object");
  const run = raw as Record<string, unknown>;
  requireSchema(run.schema_version, expectedSchema);
  if (typeof run.run_id !== "string" || !run.run_id) fail("run_id missing");
  if (typeof run.official !== "boolean") fail("official flag missing");
  const status = run.status;
  if (status !== "active" && status !== "completed" && status !== "expired") {
    fail("unknown run status");
  }
  requireAwareTimestamp(run.started_at, "started_at");
  requireAwareTimestamp(run.expires_at, "expires_at");
  for (const field of [
    "remaining_ms",
    "total_score",
    "combo",
    "correct_count",
    "incorrect_count",
    "presented_count",
    "answered_count",
    "highest_combo",
  ]) {
    requireNonNegativeInt(run[field], field);
  }
  if ("questions" in run) fail("run projection must not include a question list");
  if (status === "active") {
    const sequence = requireNonNegativeInt(run.sequence, "sequence");
    const question = readQuestion(run.question);
    if (question.sequence !== sequence) fail("active question sequence mismatch");
  } else {
    if ("question" in run && run.question != null) {
      fail("terminal run must not include a question");
    }
    if (run.completion_reason !== "pool_exhausted" && run.completion_reason !== "timer_expired") {
      fail("terminal run missing completion_reason");
    }
  }
  return run as unknown as DsaRun;
}

export function readRun(raw: unknown): DsaRun {
  return readRunCore(raw, RUN_SCHEMA);
}

export function readResolution(raw: unknown): DsaResolution {
  if (!isRecord(raw)) fail("resolution must be an object");
  const res = raw as Record<string, unknown>;
  requireSchema(res.schema_version, RESOLUTION_SCHEMA);
  const sequence = requireNonNegativeInt(res.sequence, "sequence");
  if (sequence < 1 || sequence > 30) fail("resolution sequence out of range");
  if (typeof res.is_correct !== "boolean") fail("is_correct missing");
  requireNonNegativeInt(res.correct_index, "correct_index");
  for (const field of ["base_score", "speed_bonus", "combo_before", "combo_after", "awarded_score"]) {
    requireNonNegativeInt(res[field], field);
  }
  const multiplier = res.multiplier;
  if (!isRecord(multiplier)) fail("multiplier missing");
  requireNonNegativeInt((multiplier as Record<string, unknown>).num, "multiplier.num");
  const den = requireNonNegativeInt((multiplier as Record<string, unknown>).den, "multiplier.den");
  if (den < 1) fail("multiplier.den must be positive");
  const run = readRun(res.run);
  return { ...(res as unknown as DsaResolution), run };
}

export function readResults(raw: unknown): DsaResults {
  const run = readRunCore(raw, RESULTS_SCHEMA);
  const breakdown = (raw as Record<string, unknown>).breakdown;
  if (!Array.isArray(breakdown)) fail("results breakdown missing");
  if (run.status === "active") fail("results are only valid for terminal runs");
  for (const item of breakdown) {
    if (!isRecord(item)) fail("breakdown item malformed");
    requireNonNegativeInt(item.sequence, "breakdown.sequence");
    requireNonNegativeInt(item.correct_index, "breakdown.correct_index");
  }
  return { ...(run as DsaResults), breakdown: breakdown as DsaResults["breakdown"] };
}

export function readToday(raw: unknown): DsaToday {
  if (!isRecord(raw)) fail("today payload must be an object");
  const today = raw as Record<string, unknown>;
  requireSchema(today.schema_version, TODAY_SCHEMA);
  if (typeof today.enabled !== "boolean") fail("enabled flag missing");
  if (typeof today.challenge_date !== "string") fail("challenge_date missing");
  requireNonNegativeInt(today.question_count, "question_count");
  requireNonNegativeInt(today.run_duration_seconds, "run_duration_seconds");
  requireNonNegativeInt(today.seconds_until_reset, "seconds_until_reset");
  requireNonNegativeInt(today.daily_streak, "daily_streak");
  return today as unknown as DsaToday;
}

export function readHistory(raw: unknown): DsaHistory {
  if (!isRecord(raw)) fail("history payload must be an object");
  const history = raw as Record<string, unknown>;
  requireSchema(history.schema_version, HISTORY_SCHEMA);
  if (!Array.isArray(history.entries)) fail("history entries missing");
  requireNonNegativeInt(history.daily_streak, "daily_streak");
  return history as unknown as DsaHistory;
}
