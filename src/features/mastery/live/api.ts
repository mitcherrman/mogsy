/**
 * Typed live Mastery API client (H1 / G7).
 *
 * Follows the ranked-public client discipline: identity is the Supabase bearer
 * JWT only (getBackendAuthHeaders), every call takes an AbortSignal, surfaces
 * typed errors, validates responses through the G5 parsers (which run the
 * recursive answer-key guard on pre-submission payloads), and NEVER falls back to
 * fixture data or computes correctness/state locally.
 */

import { getBackendAuthHeaders } from "@/lib/backend-auth";
import {
  MasteryPlayerQuestion,
  MasteryPlayerReveal,
  MasterySessionState,
  parseMasteryPlayerQuestion,
  parseMasteryPlayerReveal,
  parseMasteryReviewArtifact,
  readSessionState,
  MasteryReviewBundle,
  rec,
  intIndex,
  nonEmptyStr,
  str,
  bool,
} from "../contracts";

export const MASTERY_API_BASE =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ?? "http://127.0.0.1:8000";

export type MasteryApiErrorKind =
  | "invalid_request"
  | "backend"
  | "invalid_response"
  | "network"
  | "aborted";

export class MasteryApiError extends Error {
  kind: MasteryApiErrorKind;
  status: number;
  code: string | null;
  constructor(kind: MasteryApiErrorKind, status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "MasteryApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export const isAborted = (e: unknown): boolean =>
  e instanceof MasteryApiError ? e.kind === "aborted" : (e as { name?: string })?.name === "AbortError";

export const isConflict = (e: unknown): boolean =>
  e instanceof MasteryApiError && e.status === 409;

export const isForbidden = (e: unknown): boolean =>
  e instanceof MasteryApiError && e.status === 403;

export const isNotFound = (e: unknown): boolean =>
  e instanceof MasteryApiError && e.status === 404;

async function toApiError(response: Response): Promise<MasteryApiError> {
  let detail: unknown = null;
  try {
    detail = (await response.json())?.detail ?? null;
  } catch {
    detail = null;
  }
  let code: string | null = null;
  let message = `request failed (${response.status})`;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    if (typeof d.code === "string") code = d.code;
    if (typeof d.message === "string") message = d.message;
  } else if (typeof detail === "string") {
    message = detail;
  }
  return new MasteryApiError("backend", response.status, message, code);
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, parse: (json: unknown) => T,
                          { method = "GET", body, signal }: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { ...(await getBackendAuthHeaders()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${MASTERY_API_BASE}${path}`, {
      method, headers, signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") {
      throw new MasteryApiError("aborted", 0, "request aborted");
    }
    throw new MasteryApiError("network", 0, "could not reach the mastery service");
  }
  if (!response.ok) throw await toApiError(response);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new MasteryApiError("invalid_response", response.status, "malformed response body");
  }
  try {
    return parse(json);
  } catch (e) {
    throw new MasteryApiError("invalid_response", response.status,
      e instanceof Error ? e.message : "response failed validation");
  }
}

// ---- published set summaries ----------------------------------------------
export interface MasterySetSummary {
  readonly masterySetId: string;
  readonly artifactDigest: string;
  readonly displayRevision: string;
  readonly title: string;
  readonly displaySummary: string;
  readonly totalSteps: number;
}

function readSetSummary(value: unknown, label: string): MasterySetSummary {
  const s = rec(value, label);
  return {
    masterySetId: nonEmptyStr(s.mastery_set_id, `${label}.mastery_set_id`),
    artifactDigest: nonEmptyStr(s.artifact_digest, `${label}.artifact_digest`),
    displayRevision: nonEmptyStr(s.display_revision, `${label}.display_revision`),
    title: str(s.title, `${label}.title`),
    displaySummary: str(s.display_summary, `${label}.display_summary`),
    totalSteps: intIndex(s.total_steps, `${label}.total_steps`),
  };
}

// ---- session summary -------------------------------------------------------
export interface MasterySessionSummary {
  readonly sessionId: string;
  readonly totalSteps: number;
  readonly answeredCount: number;
  readonly correctCount: number;
  readonly completed: boolean;
}

function readSummary(value: unknown, label = "summary"): MasterySessionSummary {
  const s = rec(value, label);
  return {
    sessionId: nonEmptyStr(s.session_id, `${label}.session_id`),
    totalSteps: intIndex(s.total_steps, `${label}.total_steps`),
    answeredCount: intIndex(s.answered_count, `${label}.answered_count`),
    correctCount: intIndex(s.correct_count, `${label}.correct_count`),
    completed: bool(s.completed, `${label}.completed`),
  };
}

export interface MasterySessionView {
  readonly session: MasterySessionState;
  readonly question: MasteryPlayerQuestion | null;
  readonly reveal: MasteryPlayerReveal | null;
  readonly summary: MasterySessionSummary | null;
}

/** Unified {session, question?, reveal?, summary?} wrapper (start / current / advance). */
function readSessionView(json: unknown): MasterySessionView {
  const body = rec(json, "body");
  const session = readSessionState(body.session, "body.session");
  return {
    session,
    question: body.question ? parseMasteryPlayerQuestion(body.question) : null,
    reveal: body.reveal ? parseMasteryPlayerReveal(body.reveal) : null,
    summary: body.summary ? readSummary(body.summary, "body.summary") : null,
  };
}

// ---- public methods --------------------------------------------------------
export const listSets = (signal?: AbortSignal): Promise<MasterySetSummary[]> =>
  request("/api/mastery/sets",
    (j) => (rec(j, "body").sets as unknown[]).map((s, i) => readSetSummary(s, `sets[${i}]`)),
    { signal });

export const startSession = (masterySetId: string, signal?: AbortSignal): Promise<MasterySessionView> =>
  request("/api/mastery/sessions", readSessionView,
    { method: "POST", body: { mastery_set_id: masterySetId }, signal });

export const getCurrent = (sessionId: string, signal?: AbortSignal): Promise<MasterySessionView> =>
  request(`/api/mastery/sessions/${encodeURIComponent(sessionId)}/current`,
    readSessionView, { signal });

export const submitAnswer = (sessionId: string, sequenceIndex: number,
                             answer: number | boolean | string, hintUsed = false,
                             signal?: AbortSignal): Promise<MasteryPlayerReveal> =>
  request(`/api/mastery/sessions/${encodeURIComponent(sessionId)}/answer`,
    parseMasteryPlayerReveal,
    { method: "POST", body: { sequence_index: sequenceIndex, answer, hint_used: hintUsed }, signal });

export const advance = (sessionId: string, sequenceIndex: number,
                        signal?: AbortSignal): Promise<MasterySessionView> =>
  request(`/api/mastery/sessions/${encodeURIComponent(sessionId)}/advance`,
    readSessionView,
    { method: "POST", body: { sequence_index: sequenceIndex }, signal });

export const getSummary = (sessionId: string, signal?: AbortSignal): Promise<MasterySessionSummary> =>
  request(`/api/mastery/sessions/${encodeURIComponent(sessionId)}/summary`, readSummary, { signal });

// ---- admin reviewer --------------------------------------------------------
export const getReviewerArtifact = (artifactDigest: string, signal?: AbortSignal): Promise<MasteryReviewBundle> =>
  request(`/api/admin/mastery/artifacts/${encodeURIComponent(artifactDigest)}`,
    parseMasteryReviewArtifact, { signal });
