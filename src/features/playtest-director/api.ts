/**
 * PLAY1 — the Supabase boundary. Every write is an RPC (the tables grant
 * browsers SELECT only); the tester's reads go through RLS.
 *
 * The generated Supabase types predate these tables, so calls are cast the
 * same way `src/lib/admin/admin-users.ts` casts its RPCs.
 */
import { supabase } from "@/integrations/supabase/client";
import { browserCorrelation } from "@/lib/analytics/correlation";
import { readDirectorRow, type DirectorState } from "./directorState";
import type { DirectorPosition } from "./manifest";
import type { DailyProjection } from "./dailyObserver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export class PlaytestApiError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = "PlaytestApiError";
  }
}

const KNOWN_CODES = [
  "playtest_invitation_invalid", "playtest_account_required", "playtest_admin_required",
  "playtest_enrollment_not_found", "playtest_cohort_not_found",
];

function fail(error: { message?: string } | null | undefined): never {
  const message = error?.message ?? "request failed";
  throw new PlaytestApiError(KNOWN_CODES.find((c) => message.includes(c)) ?? "playtest_request_failed", message);
}

// ── tester ──────────────────────────────────────────────────────────────────

export interface JoinedCohort {
  cohortId: string;
  cohortName: string;
  cohortStatus: string;
  manifestId: string;
  manifestVersion: number;
  enrollmentId: string;
  enrollmentStatus: string;
  created: boolean;
  answeredPromptKeys: string[];
}

export async function joinCohort(inviteSlug: string): Promise<JoinedCohort> {
  let correlation: { visitor_id: string | null; session_id: string | null } = { visitor_id: null, session_id: null };
  try { correlation = browserCorrelation(); } catch { /* correlation is best-effort context */ }
  const { data, error } = await db.rpc("playtest_join", {
    p_invite_slug: inviteSlug,
    p_visitor_id: correlation.visitor_id,
    p_session_id: correlation.session_id,
  });
  if (error) fail(error);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    cohortId: String(r.cohort_id),
    cohortName: String(r.cohort_name ?? ""),
    cohortStatus: String(r.cohort_status ?? ""),
    manifestId: String(r.manifest_id),
    manifestVersion: Number(r.manifest_version),
    enrollmentId: String(r.enrollment_id),
    enrollmentStatus: String(r.enrollment_status ?? "joined"),
    created: r.created === true,
    answeredPromptKeys: Array.isArray(r.answered_prompt_keys) ? r.answered_prompt_keys.map(String) : [],
  };
}

export type EnrollmentStatus = "joined" | "in_gameplay" | "checkpoint_reached" | "feedback_submitted" | "completed";

export async function reportProgress(
  enrollmentId: string,
  status: EnrollmentStatus,
  sceneId: string,
  daily: DailyProjection | null = null,
): Promise<void> {
  const { error } = await db.rpc("playtest_report_progress", {
    p_enrollment_id: enrollmentId,
    p_status: status,
    p_scene_id: sceneId,
    p_daily_run_id: daily?.runId ?? null,
    p_daily_plan_date: daily?.planDate ?? null,
    p_daily_run_status: daily?.runStatus ?? null,
    p_daily_stage_index: daily?.focusStageIndex ?? null,
    p_daily_stage_status: daily?.focusStageStatus ?? null,
  });
  if (error) fail(error);
}

export async function submitFeedback(
  enrollmentId: string,
  promptKey: string,
  sceneId: string,
  response: Record<string, unknown>,
): Promise<{ created: boolean }> {
  const { data, error } = await db.rpc("playtest_submit_feedback", {
    p_enrollment_id: enrollmentId,
    p_prompt_key: promptKey,
    p_scene_id: sceneId,
    p_response: response,
  });
  if (error) fail(error);
  return { created: (data as { created?: boolean } | null)?.created === true };
}

// ── the authoritative row: fetch + Realtime ─────────────────────────────────

export type ChannelStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

/** The seam `useDirectorState` depends on; tests substitute it. */
export interface DirectorStateSource {
  fetch(cohortId: string): Promise<DirectorState | null>;
  subscribe(
    cohortId: string,
    onRow: (state: DirectorState | null) => void,
    onStatus: (status: ChannelStatus) => void,
  ): () => void;
}

export const supabaseDirectorStateSource: DirectorStateSource = {
  async fetch(cohortId) {
    const { data, error } = await db
      .from("playtest_director_state")
      .select("cohort_id, scene_id, build_step, revision, updated_at")
      .eq("cohort_id", cohortId)
      .maybeSingle();
    if (error) fail(error);
    return readDirectorRow(data);
  },
  subscribe(cohortId, onRow, onStatus) {
    const channel = supabase
      .channel(`playtest-director-${cohortId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "playtest_director_state", filter: `cohort_id=eq.${cohortId}` },
        (payload) => onRow(readDirectorRow(payload.new)),
      )
      .subscribe((status) => onStatus(status as ChannelStatus));
    return () => { void supabase.removeChannel(channel); };
  },
};

// ── admin (Director) ────────────────────────────────────────────────────────

export interface CohortRow {
  id: string;
  invite_slug: string;
  name: string;
  manifest_id: string;
  manifest_version: number;
  status: "open" | "closed";
  created_at: string;
}

export async function listCohorts(): Promise<CohortRow[]> {
  const { data, error } = await db
    .from("playtest_cohorts")
    .select("id, invite_slug, name, manifest_id, manifest_version, status, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) fail(error);
  return (data ?? []) as CohortRow[];
}

export async function createCohort(name: string, manifestId: string, manifestVersion: number, initialSceneId: string): Promise<CohortRow> {
  const { data, error } = await db.rpc("playtest_create_cohort", {
    p_name: name,
    p_manifest_id: manifestId,
    p_manifest_version: manifestVersion,
    p_initial_scene_id: initialSceneId,
  });
  if (error) fail(error);
  return data as CohortRow;
}

export async function setCohortStatus(cohortId: string, status: "open" | "closed"): Promise<void> {
  const { error } = await db.rpc("playtest_set_cohort_status", { p_cohort_id: cohortId, p_status: status });
  if (error) fail(error);
}

export interface AdvanceResult {
  applied: boolean;
  state: DirectorState;
}

export async function advanceDirector(cohortId: string, expectedRevision: number, target: DirectorPosition): Promise<AdvanceResult> {
  const { data, error } = await db.rpc("playtest_director_advance", {
    p_cohort_id: cohortId,
    p_expected_revision: expectedRevision,
    p_scene_id: target.sceneId,
    p_build_step: target.buildStep,
  });
  if (error) fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  const state = readDirectorRow({ ...row, cohort_id: cohortId });
  if (!row || !state) throw new PlaytestApiError("playtest_request_failed", "malformed advance response");
  return { applied: row.applied === true, state };
}

export interface RosterRow {
  enrollment_id: string;
  user_id: string;
  display_name: string | null;
  status: EnrollmentStatus;
  progress_scene_id: string | null;
  daily_run_id: string | null;
  daily_plan_date: string | null;
  daily_run_status: string | null;
  daily_stage_index: number | null;
  daily_stage_status: string | null;
  progress_updated_at: string | null;
  joined_at: string;
  feedback: { prompt_key: string; scene_id: string; response: Record<string, unknown>; created_at: string }[];
}

export async function fetchRoster(cohortId: string): Promise<RosterRow[]> {
  const { data, error } = await db.rpc("playtest_admin_roster", { p_cohort_id: cohortId });
  if (error) fail(error);
  return (data ?? []) as RosterRow[];
}

/** Host-side hint that the roster changed; the roster RPC stays the read. */
export function subscribeRosterChanges(cohortId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`playtest-roster-${cohortId}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "playtest_enrollments", filter: `cohort_id=eq.${cohortId}` },
      () => onChange())
    .on("postgres_changes",
      { event: "*", schema: "public", table: "playtest_feedback", filter: `cohort_id=eq.${cohortId}` },
      () => onChange())
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
