/**
 * FB1-4 — reading a feedback row the way the admin list needs to show it.
 *
 * Pure projection, no React, no Supabase: the admin surface renders whatever
 * these functions return, and the interesting logic (which door did this come
 * through, what should the one-line origin say, what context was actually
 * captured) is testable without mounting anything.
 *
 * TOLERANT BY CONSTRUCTION. Every reader here treats the row as untrusted
 * shape: `report_context` is jsonb written by a client, `entry_intent` may
 * hold a value added after this build shipped, and legacy rows predate all of
 * it. Nothing throws, and an unrecognised value renders as itself rather than
 * disappearing — an admin surface that silently hides a row it does not
 * understand is worse than one that shows it plainly.
 */

import { ENTRY_INTENT_LABELS, type FeedbackEntryIntent } from "./contract";
import { questionReportReasonLabel } from "./report-context";

export interface AdminFeedbackRowLike {
  entry_intent?: string | null;
  category?: string | null;
  page_url?: string | null;
  report_context?: unknown;
}

export type ReportOriginKind = "question" | "page" | "center";

export interface ReportOrigin {
  kind: ReportOriginKind;
  /** The one line shown in the collapsed list, e.g.
   *  "Question Report · Incorrect answer · Ranked". */
  label: string;
}

function contextObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * The origin line.
 *
 * `entry_intent` is the discriminator, NOT `report_context.kind`. The column
 * is CHECK-constrained and server-visible; the jsonb is client-written. When
 * a report's own context disagrees with the column it came in on, the column
 * is the one to believe.
 */
export function reportOrigin(row: AdminFeedbackRowLike): ReportOrigin {
  const intent = row.entry_intent ?? "";
  const context = contextObject(row.report_context);

  if (intent === "question_report") {
    const parts = ["Question Report", questionReportReasonLabel(context.reason)];
    // Mode from the context, falling back to the product area the row was
    // filed under — which is what the mode set it from in the first place.
    const mode = str(context.mode) ?? str(row.category);
    if (mode) parts.push(mode);
    return { kind: "question", label: parts.join(" · ") };
  }

  if (intent === "page_report") {
    const route = str(context.route) ?? str(row.page_url) ?? "unknown page";
    return { kind: "page", label: `Page Issue · ${route}` };
  }

  const label =
    ENTRY_INTENT_LABELS[intent as FeedbackEntryIntent] ??
    (intent ? intent : "Feedback");
  return { kind: "center", label };
}

/** One captured field, ready to render as a labelled row. */
export interface CapturedField {
  key: string;
  label: string;
  value: string;
  /** Long values (prompt, choices) get their own block rather than a row. */
  block?: boolean;
}

/**
 * Order matters: this is the sequence an owner reads to decide whether a
 * report is real — what the question said, what it offered, what the right
 * answer was, what the player picked — before any of the identity plumbing.
 */
const QUESTION_FIELDS: ReadonlyArray<[string, string, boolean]> = [
  ["prompt", "Question", true],
  ["choices", "Choices", true],
  ["canonical_answer", "Canonical answer", false],
  ["selected_answer", "Player selected", false],
  ["question_key", "Question key", false],
  ["static_question_id", "Static question id", false],
  ["runtime_question_id", "Runtime question id", false],
  ["question_type", "Generator / type", false],
  ["module_type", "Module / slice", false],
  ["difficulty", "Difficulty", false],
  ["mode", "Mode", false],
  ["route", "Route", false],
  ["match_id", "Match id", false],
  ["session_id", "Session id", false],
  ["round_number", "Round / step", false],
  ["captured_at", "Captured", false],
];

const PAGE_FIELDS: ReadonlyArray<[string, string, boolean]> = [
  ["route", "Page", false],
  ["captured_at", "Captured", false],
];

function renderValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    const items = value.map(item => str(item)).filter((v): v is string => v !== null);
    return items.length ? items.join("\n") : null;
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  return str(value);
}

/**
 * The fields this row actually captured, in reading order.
 *
 * Absent keys produce no row at all rather than an em-dash: the builders omit
 * what a mode could not supply, so "no Question key row" correctly means "this
 * mode has no question key" instead of "we tried and got nothing".
 */
export function capturedFields(row: AdminFeedbackRowLike): CapturedField[] {
  const origin = reportOrigin(row);
  if (origin.kind === "center") return [];
  const context = contextObject(row.report_context);
  const spec = origin.kind === "question" ? QUESTION_FIELDS : PAGE_FIELDS;

  const fields: CapturedField[] = [];
  for (const [key, label, block] of spec) {
    const value = renderValue(context[key]);
    if (value !== null) fields.push({ key, label, value, block });
  }

  // Page reports carry an allow-listed query bag, flattened so the owner can
  // see "category=items" without expanding a nested object.
  const query = contextObject(context.query);
  for (const [key, value] of Object.entries(query)) {
    const rendered = renderValue(value);
    if (rendered !== null) {
      fields.push({ key: `query.${key}`, label: `?${key}`, value: rendered });
    }
  }

  if (context.truncated === true) {
    fields.push({
      key: "truncated",
      label: "Note",
      value: "Snapshot exceeded the size cap; prompt and choices were dropped.",
    });
  }

  return fields;
}

/** Browser/build diagnostics, as labelled rows. Empty when none were sent. */
export function diagnosticFields(clientMeta: unknown): CapturedField[] {
  const meta = contextObject(clientMeta);
  const spec: ReadonlyArray<[string, string]> = [
    ["app_version", "Build"],
    ["viewport", "Viewport"],
    ["ua", "User agent"],
  ];
  const fields: CapturedField[] = [];
  for (const [key, label] of spec) {
    const value = str(meta[key]);
    if (value !== null) fields.push({ key, label, value });
  }
  return fields;
}
