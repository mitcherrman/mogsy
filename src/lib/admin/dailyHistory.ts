// Display rules for the owner's per-user Daily Challenge history.
//
// Pure functions only. Every rule here exists to stop a missing fact being
// shown as a known one:
//  - a duration is shown only when the backend recorded both endpoints;
//  - an unfinished run is "unfinished as of its last recorded activity", never
//    "abandoned", and nothing says whether the player came back;
//  - the entry button is the one pressed in the SAME recorded browser session
//    shortly before the run was created, or "not recorded". A browser id, an
//    IP or "the same person on another device" is never used to guess one.

import { DAILY_ENTRY_CONTROLS, DAILY_ENTRY_CLICKED } from "@/lib/analytics/dailyEntry";
import type { DailyRunHistory, DailyStage } from "@/lib/admin/dailyHistoryApi";

/** How long before a run's creation a click still counts as having opened it. */
export const ENTRY_LOOKBACK_MS = 10 * 60 * 1000;
/** Analytics and Railway stamp their own clocks; allow a small lead for ingest lag. */
export const ENTRY_LEAD_MS = 60 * 1000;

export const DAILY_ENTRY_SOURCE_LABELS: Record<keyof typeof DAILY_ENTRY_CONTROLS, string> = {
  academy_core_daily_button: "Home Hub (Academy) — Daily Challenge button",
  play_seal_ranked_closed: "Leaguecraft — PLAY while Ranked was not open",
  play_scroll_daily_clause: "Leaguecraft — Daily Challenge on the match-entry record",
  play_scroll_resume_optional: "Leaguecraft — continue optional stages",
  centre_stage_daily_panel: "Leaguecraft — Daily Challenge panel",
};

export interface EntryClick {
  sessionId: string | null;
  receivedAt: string;
  control: string | null;
}

export type EntrySource =
  | { kind: "observed"; label: string; surface: "home_hub" | "leaguecraft" | "other"; at: string }
  | { kind: "not_recorded"; reason: string };

const NO_SESSION = "No browser session was attached to this run.";
const NO_CLICK =
  "No Daily entry click was recorded in that browser session shortly before the run started "
  + "(earlier releases did not record clicks, and arrivals by link, refresh or bookmark have none).";

/** The button pressed in the run's own browser session just before it was created. */
export function resolveEntrySource(run: Pick<DailyRunHistory, "createdAt" | "correlation">, clicks: readonly EntryClick[]): EntrySource {
  const session = run.correlation.sessionId;
  if (!session) return { kind: "not_recorded", reason: NO_SESSION };
  const created = Date.parse(run.createdAt);
  if (!Number.isFinite(created)) return { kind: "not_recorded", reason: NO_CLICK };
  const candidate = clicks
    .filter((c) => c.sessionId === session)
    .map((c) => ({ c, at: Date.parse(c.receivedAt) }))
    .filter(({ at }) => Number.isFinite(at) && at >= created - ENTRY_LOOKBACK_MS && at <= created + ENTRY_LEAD_MS)
    .sort((a, b) => b.at - a.at)[0];
  if (!candidate) return { kind: "not_recorded", reason: NO_CLICK };
  const control = candidate.c.control;
  if (control && control in DAILY_ENTRY_CONTROLS) {
    const key = control as keyof typeof DAILY_ENTRY_CONTROLS;
    return { kind: "observed", label: DAILY_ENTRY_SOURCE_LABELS[key], surface: DAILY_ENTRY_CONTROLS[key], at: candidate.c.receivedAt };
  }
  return { kind: "observed", label: "A Daily Challenge button (which one is not recognised)", surface: "other", at: candidate.c.receivedAt };
}

export { DAILY_ENTRY_CLICKED };

/** "2 min 30 s" — or null when the duration is not a recorded fact. */
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return "under 1 s";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

export function formatAccuracy(stage: Pick<DailyStage, "result">): string | null {
  const { correct, answered, accuracy } = stage.result;
  if (correct === null || answered === null || answered <= 0) return null;
  const pct = accuracy !== null ? Math.round(accuracy * 100) : Math.round((correct / answered) * 100);
  return `${correct}/${answered} (${pct}%)`;
}

const STAGE_LABELS: Record<string, string> = {
  standard: "Main Daily", time_trial: "Time Trial", survival: "Survival", weak_areas: "Weak Areas", review: "Review",
};
export const stageLabel = (kind: string): string => STAGE_LABELS[kind] ?? `Stage (${kind})`;

export const STAGE_STATE_LABELS: Record<DailyStage["state"], string> = {
  completed: "Completed", in_progress: "Started, not completed", not_started: "Not started", skipped: "Skipped",
};

export const tierLabel = (tier: DailyStage["tier"]): string =>
  tier === "main" ? "Required" : tier === "optional" ? "Optional" : "—";

/** One honest sentence about where a run stands. */
export function runStatusLine(run: DailyRunHistory): string {
  if (run.status === "completed") {
    return run.outcome === "perfect"
      ? "Run completed — no misses, so Review was skipped."
      : "Run completed, including Review.";
  }
  const when = run.lastRecordedAt ? ` Last recorded activity ${new Date(run.lastRecordedAt).toLocaleString()}.` : "";
  if (run.main === null) return `Run unfinished.${when}`;
  return run.main.completed
    ? `Main Daily completed; the run is unfinished.${when}`
    : `Main Daily not completed; the run is unfinished.${when}`;
}

/** Timeline of what was actually recorded, in order, for the technical drawer. */
export function eventLabel(type: string): string {
  switch (type) {
    case "run_created": return "Run created";
    case "stage_launched": return "Stage launched";
    case "stage_completed": return "Stage completed";
    case "stage_skipped": return "Stage skipped";
    case "main_completed": return "Main Daily completed";
    case "run_completed": return "Run completed";
    case "review_allocated": return "Review questions chosen";
    case "launch_failed": return "Stage launch failed";
    default: return type;
  }
}
