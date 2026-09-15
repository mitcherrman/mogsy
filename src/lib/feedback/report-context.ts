/**
 * FB1-4 — the structured context behind the two in-product report doors.
 *
 * WHY THIS IS A COLUMN AND NOT PROSE IN `body`
 * ────────────────────────────────────────────
 * A question report is only useful if the owner can see the exact question
 * without reproducing the match, and most of Mogzy's questions are GENERATED:
 * re-running the generator tomorrow, against a patched champion or a re-frozen
 * artifact, can produce different text and different choices for the same key.
 * So the report has to carry a SNAPSHOT of what the player actually saw, not a
 * pointer to be resolved later. A snapshot serialized into free text would be
 * unreadable in the admin list, unsearchable, and impossible to render
 * field-by-field — hence `feedback.report_context`, a jsonb column.
 *
 * WHAT IS DELIBERATELY NOT CAPTURED
 * ─────────────────────────────────
 * The canonical answer is captured ONLY when the mode has already revealed it
 * to this player. Every builder below takes it as an explicit argument and no
 * builder reaches into any mode's state to find one, because a reporting
 * control that could pull an unrevealed answer into a row the player can
 * provoke at will would be an answer-leak dressed as a feature. The same rule
 * is why `question_key` is optional: Ranked does not publish it mid-match, and
 * for good reason — keys like `item_exact_stat:armor:highest` name the answer.
 *
 * Nothing here reads the DOM, the session, storage, or the network. A builder
 * is a pure function from a snapshot a mode already holds to a bounded object.
 */

import { FEEDBACK_LIMITS, type FeedbackCategory, categoryForRoute } from "./contract";

/* ────────────────────────────── reasons ─────────────────────────────── */

/**
 * The four reasons, in the order they are offered. Stored verbatim in
 * `report_context.reason`; the labels are display-only and may be reworded
 * without a migration, which is the whole point of storing the token.
 */
export const QUESTION_REPORT_REASONS = [
  "doesnt_make_sense",
  "incorrect_answer",
  "typo",
  "other",
] as const;
export type QuestionReportReason = (typeof QUESTION_REPORT_REASONS)[number];

export const QUESTION_REPORT_REASON_LABELS: Record<QuestionReportReason, string> = {
  doesnt_make_sense: "Doesn't make sense",
  incorrect_answer: "Incorrect answer",
  typo: "Typo",
  other: "Other",
};

export function isQuestionReportReason(value: unknown): value is QuestionReportReason {
  return (
    typeof value === "string" &&
    (QUESTION_REPORT_REASONS as readonly string[]).includes(value)
  );
}

/** Reason label for an admin surface, tolerant of a token it does not know. */
export function questionReportReasonLabel(value: unknown): string {
  if (isQuestionReportReason(value)) return QUESTION_REPORT_REASON_LABELS[value];
  return typeof value === "string" && value ? value : "Unspecified";
}

/* ─────────────────────────── the mode's snapshot ─────────────────────── */

/**
 * What a mode publishes about the question currently on screen.
 *
 * EVERY IDENTITY FIELD IS OPTIONAL, AND THAT IS THE CONTRACT — not laziness.
 * The modes' question shapes are genuinely disjoint:
 *
 *   Ranked            `questionId` + `matchId` + `roundNumber`; no question_key
 *                     (the backend withholds it, because the key can name the
 *                     answer), no numeric difficulty on the wire.
 *   Daily Challenge   the same, through the same arena.
 *   Time Trial        a numeric `question_id` from the score-attack bank, and
 *                     a difficulty LABEL rather than a number.
 *   Mastery           no database row at all: identity is the session, the
 *                     mastery set, the frozen artifact digest and the step
 *                     index. A `staticQuestionId` here would be a fiction.
 *   Practice/Pro Play a real `quiz_questions` row, so both `questionKey` and
 *                     `staticQuestionId` are present.
 *
 * A reporter that REQUIRED question_key would therefore be wired into exactly
 * one mode. QR1's durable-identity rule is honoured by preferring the key
 * wherever a mode has one, not by pretending every mode does.
 */
export interface ReportableQuestionSnapshot {
  /** Product area, used to file the report and to label it in the admin list. */
  category: FeedbackCategory;
  /** Human name of the mode, e.g. "Ranked", "Time Trial". Shown to the owner. */
  mode: string;

  /** QR1 durable identity, where the mode has it. */
  questionKey?: string | null;
  /** `quiz_questions.id`, where a static row actually exists. */
  staticQuestionId?: string | number | null;
  /** The mode's own per-round question id, which is not a database id. */
  runtimeQuestionId?: string | null;

  /** Verbatim prompt as rendered. */
  prompt?: string | null;
  /** Choice labels as rendered, in display order. */
  choices?: readonly string[] | null;
  /**
   * The canonical answer — ONLY when the mode has already revealed it to this
   * player. Never pass an unrevealed answer; see the module header.
   */
  canonicalAnswer?: string | null;
  /** What the player had picked at report time, where a selection exists. */
  selectedAnswer?: string | null;

  /** Generator family / question type, e.g. "post_mitigation_damage". */
  questionType?: string | null;
  /** Module or slice id, e.g. "mastery_slice.v1", "quiz.v1". */
  moduleType?: string | null;
  /** Difficulty as the mode expresses it — a band label or a number. */
  difficulty?: string | number | null;

  /** Match / run / session identifiers, whatever the mode has. */
  matchId?: string | null;
  sessionId?: string | null;
  /** Round, step or sequence number within that match/session. */
  roundNumber?: number | null;
}

/* ─────────────────────────────── the payload ─────────────────────────── */

/** Discriminator, mirrored by `feedback.entry_intent`. */
export type ReportContextKind = "question_report" | "page_report";

export interface QuestionReportContext {
  kind: "question_report";
  /** Schema tag, so a later shape change is legible in old rows. */
  v: 1;
  reason: QuestionReportReason;
  mode: string;
  route: string;
  captured_at: string;
  question_key?: string;
  static_question_id?: string;
  runtime_question_id?: string;
  prompt?: string;
  choices?: string[];
  canonical_answer?: string;
  selected_answer?: string;
  question_type?: string;
  module_type?: string;
  difficulty?: string;
  match_id?: string;
  session_id?: string;
  round_number?: number;
}

export interface PageReportContext {
  kind: "page_report";
  v: 1;
  route: string;
  captured_at: string;
  /** Allow-listed query parameters, when the route has any worth keeping. */
  query?: Record<string, string>;
}

export type FeedbackReportContext = QuestionReportContext | PageReportContext;

/* ───────────────────────────── field budgets ─────────────────────────── */

const MAX_PROMPT = 2000;
const MAX_CHOICE = 300;
const MAX_CHOICES = 12;
const MAX_ANSWER = 300;
const MAX_SHORT = 200;

function text(value: unknown, max: number): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = typeof value === "string" ? value : String(value);
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/**
 * A finite round number, or undefined.
 *
 * `Number.isFinite` and not a truthiness test: round 0 is a real value in a
 * zero-indexed sequence and must survive, while NaN — which a mode can
 * produce by subtracting from an absent index — must not be written.
 */
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/* ────────────────────────────── the builders ─────────────────────────── */

/**
 * Build the stored context for a question report.
 *
 * Every field is optional in the OUTPUT too: an absent input produces an
 * absent key rather than a null, so the admin surface can render "what was
 * captured" by iterating the object instead of filtering nulls, and so a row
 * never claims to have captured something it did not.
 */
export function buildQuestionReportContext(args: {
  snapshot: ReportableQuestionSnapshot;
  reason: QuestionReportReason;
  route: string;
  now?: Date;
}): QuestionReportContext {
  const { snapshot, reason, route } = args;
  const ctx: QuestionReportContext = {
    kind: "question_report",
    v: 1,
    reason,
    mode: text(snapshot.mode, MAX_SHORT) ?? "Unknown",
    route: capturePath(route),
    captured_at: (args.now ?? new Date()).toISOString(),
  };

  const assign = <K extends keyof QuestionReportContext>(
    key: K,
    value: QuestionReportContext[K] | undefined,
  ) => {
    if (value !== undefined) ctx[key] = value;
  };

  assign("question_key", text(snapshot.questionKey, MAX_SHORT));
  assign("static_question_id", text(snapshot.staticQuestionId, MAX_SHORT));
  assign("runtime_question_id", text(snapshot.runtimeQuestionId, MAX_SHORT));
  assign("prompt", text(snapshot.prompt, MAX_PROMPT));
  assign("canonical_answer", text(snapshot.canonicalAnswer, MAX_ANSWER));
  assign("selected_answer", text(snapshot.selectedAnswer, MAX_ANSWER));
  assign("question_type", text(snapshot.questionType, MAX_SHORT));
  assign("module_type", text(snapshot.moduleType, MAX_SHORT));
  assign("difficulty", text(snapshot.difficulty, MAX_SHORT));
  assign("match_id", text(snapshot.matchId, MAX_SHORT));
  assign("session_id", text(snapshot.sessionId, MAX_SHORT));
  assign("round_number", count(snapshot.roundNumber));

  if (snapshot.choices && snapshot.choices.length) {
    const choices = snapshot.choices
      .slice(0, MAX_CHOICES)
      .map(choice => text(choice, MAX_CHOICE) ?? "")
      // An empty label is a real rendering fact, but a row of them is noise.
      .filter((choice, _i, all) => all.some(Boolean));
    if (choices.length) ctx.choices = choices;
  }

  return ctx;
}

/**
 * Query parameters worth keeping on a page report.
 *
 * ALLOW-LIST, not a filter. `capturePageUrl` strips the query string entirely
 * because Stat Check room codes and friend-invite codes live there, and FB1's
 * rule is that a diagnostics field is no place to retain a credential. A page
 * report genuinely benefits from knowing *which* patch report or *which* tab
 * the visitor was looking at, so a small allow-list is reintroduced here —
 * deliberately naming keys rather than excluding known-bad ones, because the
 * next credential-bearing parameter somebody adds must default to being
 * dropped.
 */
export const PAGE_REPORT_QUERY_KEYS = [
  "category",
  "tab",
  "view",
  "mode",
  "patch",
  "version",
  "year",
  "champion",
  "set",
  "area",
] as const;

const MAX_QUERY_VALUE = 120;

export function capturePageQuery(search: string): Record<string, string> | undefined {
  if (!search) return undefined;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const key of PAGE_REPORT_QUERY_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value.slice(0, MAX_QUERY_VALUE);
  }
  return Object.keys(out).length ? out : undefined;
}

export function buildPageReportContext(args: {
  route: string;
  search?: string;
  now?: Date;
}): PageReportContext {
  const ctx: PageReportContext = {
    kind: "page_report",
    v: 1,
    route: capturePath(args.route),
    captured_at: (args.now ?? new Date()).toISOString(),
  };
  const query = capturePageQuery(args.search ?? "");
  if (query) ctx.query = query;
  return ctx;
}

/**
 * Path only, bounded — the same shape `capturePageUrl` writes into
 * `page_url`, kept here so `report_context.route` and `page_url` can never
 * disagree about what was being reported.
 */
export function capturePath(pathname: string): string {
  const path = (pathname || "/").split(/[?#]/)[0] || "/";
  return path.slice(0, FEEDBACK_LIMITS.pageUrl);
}

/* ─────────────────────────── titles and bodies ───────────────────────── */

/**
 * The one-line title. It is what the admin list shows before anything is
 * expanded, so it leads with the reason and names the mode — the two facts
 * that decide whether a report is worth opening now.
 */
export function questionReportTitle(reason: QuestionReportReason, mode: string): string {
  return `${QUESTION_REPORT_REASON_LABELS[reason]} — ${mode}`.slice(
    0,
    FEEDBACK_LIMITS.title,
  );
}

export function pageReportTitle(route: string): string {
  return `Page issue — ${capturePath(route)}`.slice(0, FEEDBACK_LIMITS.title);
}

/**
 * `body` carries the PLAYER'S OWN WORDS and nothing else.
 *
 * The captured context deliberately does not appear here even though it would
 * be convenient: duplicating it would double the row, and the moment the two
 * copies can disagree the prose one starts being believed.
 */
export function reportBody(comment: string, fallback: string): string {
  const trimmed = comment.trim().slice(0, FEEDBACK_LIMITS.reportComment);
  return trimmed || fallback;
}

/** The mode's category, or the route's, so a report is always filed somewhere. */
export function categoryForReport(
  snapshot: Pick<ReportableQuestionSnapshot, "category"> | null,
  route: string,
): FeedbackCategory {
  return snapshot?.category ?? categoryForRoute(capturePath(route));
}

/**
 * Serialize for storage, enforcing the column's size cap.
 *
 * Over-budget rows lose the prompt and the choices — the two unbounded fields
 * — rather than being rejected: a report that arrives without its snapshot is
 * worth far more than one that fails to send. The dropped fields are recorded
 * so the owner is never shown a truncated snapshot they might mistake for the
 * whole question.
 */
export function serializeReportContext(
  context: FeedbackReportContext,
): Record<string, unknown> {
  if (JSON.stringify(context).length <= FEEDBACK_LIMITS.reportContextJson) {
    return context as unknown as Record<string, unknown>;
  }
  const reduced = { ...context } as Record<string, unknown>;
  delete reduced.prompt;
  delete reduced.choices;
  reduced.truncated = true;
  return reduced;
}
