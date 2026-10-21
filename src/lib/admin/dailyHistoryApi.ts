// ---------------------------------------------------------------------------
// Owner-only per-user Daily Challenge history (Railway read model).
//
//   GET /api/daily-run/admin/users/{user_id}/history
//
// READ ONLY. The route sits behind the owner gate (verified owner session,
// MFA and trusted device decided by Supabase) and is a read model over the
// Daily's own durable records; it writes nothing. This client only parses.
//
// The parser is strict about what it relies on and silent about what it does
// not: an unknown `schema_version` is refused (so a breaking backend change
// fails loudly instead of rendering wrong numbers), while unknown extra keys
// are ignored (so additive backend changes cannot break the page). Every
// number is accepted only if it really is a finite number, so a malformed
// field becomes "not recorded", never 0.
// ---------------------------------------------------------------------------

import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

export const DAILY_HISTORY_SCHEMA_VERSION = 1;

export type DailyStageState = "completed" | "in_progress" | "not_started" | "skipped";
export type DailyStageTier = "main" | "optional" | null;

export interface DailyStageResult {
  score: number | null;
  correct: number | null;
  answered: number | null;
  /** 0–1, present only when the backend had answers to divide by. */
  accuracy: number | null;
  misses: number | null;
  missedQuestions: number | null;
  endedBy: string | null;
  completionReason: string | null;
  /** Summed time spent answering, as the child result recorded it. */
  activeAnswerMs: number | null;
  timeBankMs: number | null;
  perfect: boolean;
}

export interface DailyStage {
  stageIndex: number;
  kind: string;
  tier: DailyStageTier;
  state: DailyStageState;
  childMatchId: string | null;
  launchedAt: string | null;
  completedAt: string | null;
  /** Wall-clock launch→completion; null unless both are recorded. */
  elapsedMs: number | null;
  result: DailyStageResult;
}

export interface DailyHistoryEvent {
  type: string;
  stageIndex: number | null;
  at: string;
}

export interface DailyRunHistory {
  runId: string;
  planDate: string;
  planVersion: number;
  status: "active" | "completed";
  outcome: "reviewed" | "perfect" | null;
  createdAt: string;
  completedAt: string | null;
  lastRecordedAt: string | null;
  mainCompletedAt: string | null;
  mainScore: number | null;
  /** Wall-clock created→completed (idle included); null for an unfinished run. */
  elapsedMs: number | null;
  stageCount: number;
  /** null when the run's plan version made no required/optional distinction. */
  main: { completed: boolean; completedAt: string | null; score: number | null } | null;
  optional: { total: number; completed: number; skipped: number } | null;
  correlation: { visitorId: string | null; sessionId: string | null };
  stages: DailyStage[];
  events: DailyHistoryEvent[];
}

export interface DailyUserHistory {
  userId: string;
  runs: DailyRunHistory[];
  truncated: boolean;
}

export class DailyHistoryParseError extends Error {}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

function need<T>(value: T | null, what: string): T {
  if (value === null) throw new DailyHistoryParseError(`Daily history is missing ${what}`);
  return value;
}

const STATES = new Set<string>(["completed", "in_progress", "not_started", "skipped"]);

function readResult(raw: unknown): DailyStageResult {
  const r = isObj(raw) ? raw : {};
  return {
    score: num(r.score), correct: num(r.correct), answered: num(r.answered), accuracy: num(r.accuracy),
    misses: num(r.misses), missedQuestions: num(r.missed_questions),
    endedBy: str(r.ended_by), completionReason: str(r.completion_reason),
    activeAnswerMs: num(r.active_answer_ms), timeBankMs: num(r.time_bank_ms), perfect: r.perfect === true,
  };
}

function readStage(raw: unknown): DailyStage {
  if (!isObj(raw)) throw new DailyHistoryParseError("Daily history stage is not an object");
  const state = str(raw.state);
  // An unrecognised state is not guessed into a known one.
  if (!state || !STATES.has(state)) throw new DailyHistoryParseError("Daily history stage has an unknown state");
  const tier = raw.tier === "main" || raw.tier === "optional" ? raw.tier : null;
  return {
    stageIndex: need(num(raw.stage_index), "a stage index"),
    kind: need(str(raw.kind), "a stage kind"),
    tier, state: state as DailyStageState,
    childMatchId: str(raw.child_match_id),
    launchedAt: str(raw.launched_at), completedAt: str(raw.completed_at),
    elapsedMs: num(raw.elapsed_ms), result: readResult(raw.result),
  };
}

function readRun(raw: unknown): DailyRunHistory {
  if (!isObj(raw)) throw new DailyHistoryParseError("Daily history run is not an object");
  const status = raw.status === "active" || raw.status === "completed" ? raw.status : null;
  const outcome = raw.outcome === "reviewed" || raw.outcome === "perfect" ? raw.outcome : null;
  const main = isObj(raw.main)
    ? { completed: raw.main.completed === true, completedAt: str(raw.main.completed_at), score: num(raw.main.score) }
    : null;
  const optional = isObj(raw.optional)
    ? { total: num(raw.optional.total) ?? 0, completed: num(raw.optional.completed) ?? 0, skipped: num(raw.optional.skipped) ?? 0 }
    : null;
  const corr = isObj(raw.correlation) ? raw.correlation : {};
  return {
    runId: need(str(raw.run_id), "a run id"),
    planDate: need(str(raw.plan_date), "a plan date"),
    planVersion: num(raw.plan_version) ?? 0,
    status: need(status, "a run status"),
    outcome, createdAt: need(str(raw.created_at), "a creation time"),
    completedAt: str(raw.completed_at), lastRecordedAt: str(raw.last_recorded_at),
    mainCompletedAt: str(raw.main_completed_at), mainScore: num(raw.main_score),
    elapsedMs: num(raw.elapsed_ms), stageCount: num(raw.stage_count) ?? 0,
    main, optional,
    correlation: { visitorId: str(corr.visitor_id), sessionId: str(corr.session_id) },
    stages: Array.isArray(raw.stages) ? raw.stages.map(readStage) : [],
    events: Array.isArray(raw.events)
      ? raw.events.filter(isObj).map((e) => ({ type: str(e.type) ?? "unknown", stageIndex: num(e.stage_index), at: str(e.at) ?? "" }))
      : [],
  };
}

export function parseDailyHistory(json: unknown): DailyUserHistory {
  if (!isObj(json)) throw new DailyHistoryParseError("Daily history response is not an object");
  if (json.schema_version !== DAILY_HISTORY_SCHEMA_VERSION) {
    throw new DailyHistoryParseError(`Daily history schema ${String(json.schema_version)} is not supported`);
  }
  if (!Array.isArray(json.runs)) throw new DailyHistoryParseError("Daily history has no runs list");
  return {
    userId: need(str(json.user_id), "a user id"),
    runs: json.runs.map(readRun),
    truncated: json.truncated === true,
  };
}

/** Why a read failed, kept apart so "no history" is never what an error looks like. */
export class DailyHistoryReadError extends Error {
  constructor(public kind: "denied" | "unavailable" | "invalid", message: string) {
    super(message);
  }
}

export async function fetchDailyHistory(userId: string, signal?: AbortSignal): Promise<DailyUserHistory> {
  const url = `${ADMIN_API_BASE_URL}/api/daily-run/admin/users/${encodeURIComponent(userId)}/history`;
  let response: Response;
  try {
    response = await fetch(url, { headers: await buildAdminHeaders(url), signal, cache: "no-store" });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DailyHistoryReadError("unavailable", "The Daily history service could not be reached.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new DailyHistoryReadError("denied", "Owner access to Daily history was refused.");
  }
  if (!response.ok) {
    throw new DailyHistoryReadError("unavailable", `The Daily history service answered ${response.status}.`);
  }
  try {
    return parseDailyHistory(await response.json());
  } catch (error) {
    throw new DailyHistoryReadError("invalid", error instanceof Error ? error.message : "Daily history was unreadable.");
  }
}
