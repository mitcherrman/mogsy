/**
 * HUB4 — how History words the server's facts. Formatting only.
 *
 * Every number here arrives from `/api/history/v1` already computed; these
 * functions round and label it and never derive a new figure. The stage names
 * and terminal notes are the Daily's own vocabulary (`stageIdentity`, the
 * Daily recap), so a stage is called the same thing in History as it was
 * while it was being played.
 */
import { stageIdentity } from "@/lib/daily-challenge/run/stageIdentity";
import { DAILY_STAGE_KINDS, type DailyStageKind } from "@/lib/daily-challenge/run/contracts";
import { formatQuestionFamily } from "@/features/mastery/formatQuestionFamily";
import type { Sufficiency } from "@/lib/history/contracts";
import { META_REFLEX_LABEL } from "@/lib/ranked-core/modules/metaReflexLabel";

const KNOWN_KINDS: readonly string[] = DAILY_STAGE_KINDS;

/** History looks BACK at a finished Daily: "Today's Review" (the live Daily's
 *  tag) would read as today's in a past run, so it keeps its plain name here. */
const HISTORY_LABEL: Readonly<Record<string, string>> = { review: "Review" };

/** "Time Trial". A kind this client does not know yet is humanized rather
 *  than dropped — the stage still happened. */
export function stageKindLabel(kind: string): string {
  if (HISTORY_LABEL[kind]) return HISTORY_LABEL[kind];
  if (KNOWN_KINDS.includes(kind)) {
    return stageIdentity({ kind: kind as DailyStageKind, ruleset: null }).label;
  }
  return kind
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** The Daily recap's own terminal notes (`DailyCompletion`). A stage that
 *  simply finished says nothing. */
const ENDED_BY_NOTE: Record<string, string> = {
  time_bank_exhausted: "bank ran out",
  strikes_exhausted: "out of mistakes",
};

export function endedByNote(endedBy: string | null): string | null {
  return endedBy ? ENDED_BY_NOTE[endedBy] ?? null : null;
}

/** Whole percent, never a false decimal. Null stays null. */
export function percent(ratio: number | null | undefined): string | null {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return null;
  return `${Math.round(ratio * 100)}%`;
}

/** An accuracy difference in whole points, signed: "+6 points", "−1 point",
 *  "0 points" — a difference, never a verdict. HUB6.3D: never "pp" (owner
 *  terminology); see `historyComparisons.accuracyComparison` for the
 *  "89% vs 79%" form. */
export function signedPoints(points: number): string {
  const rounded = Math.round(points);
  const n = Math.abs(rounded);
  const unit = n === 1 ? "point" : "points";
  if (rounded === 0) return "0 points";
  return rounded > 0 ? `+${n} ${unit}` : `−${n} ${unit}`;
}

/** "Sep 24" for the Daily's plan date. The plan date is a calendar date, not
 *  an instant, so it is formatted in UTC and never shifted by the reader's
 *  timezone into the day before. */
export function planDateLabel(planDate: string): string {
  const d = new Date(`${planDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return planDate;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function instantDateLabel(iso: string): string {
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * HUB6.3G — "Sep 14", the UTC calendar day of a server timestamp, read by its
 * own date part — a reader west of Greenwich never sees the day before.
 * HUB6.4B: Weak Areas' `evidence_cutoff` is the run's CREATION INSTANT
 * (`2026-09-14T03:12:45.123456+00:00`, backend `daily_challenge/run/service.py`),
 * not a midnight boundary. Its UTC day is always the run's plan date (both
 * come from the same `now`), so callers phrase it as "before this Daily
 * started on Sep 14", never "before Sep 14".
 */
export function dateBoundaryLabel(iso: string): string {
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim())?.[1];
  return day ? planDateLabel(day) : instantDateLabel(iso);
}

/**
 * HUB6.3G — a Standard module's unit, as the reader knows it. The backend
 * still emits `unit: "slice"` for older rounds (the raw value is kept on the
 * record); the module is a Journey either way, and "Slice" is never shown.
 */
export type ModuleFamily = "splash" | "meta_reflex" | "journey" | "review_replay";

export function moduleFamily(unit: string | null | undefined): ModuleFamily | null {
  if (unit === "journey" || unit === "slice") return "journey";
  if (unit === "splash" || unit === "meta_reflex" || unit === "review_replay") return unit;
  return null;
}

const MODULE_NAME: Readonly<Record<ModuleFamily, string>> = {
  splash: "Splash",
  meta_reflex: META_REFLEX_LABEL,
  journey: "Journey",
  review_replay: "Review replay",
};

/** "Journey" (also for a legacy `slice`); null for a unit this client does
 *  not know, so each caller keeps its own neutral word. */
export function moduleName(unit: string | null | undefined): string | null {
  const family = moduleFamily(unit);
  return family ? MODULE_NAME[family] : null;
}

const SNAKE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/**
 * A question category as the server froze it. Curated quiz categories are
 * already display labels ("Champion Base Stats"); generated questions carry
 * their question-family id ("cooldown_comparison"), which goes through the
 * app's one family formatter rather than reaching the page as a slug.
 */
export function categoryLabel(category: string): string {
  return SNAKE.test(category) ? formatQuestionFamily(category) : category;
}

export const familyLabel = formatQuestionFamily;

/** Metric names, for the one line that says which comparisons are still
 *  waiting on evidence. */
export const RUN_METRIC_LABELS = {
  previousRunDeltaPp: "Change from last run",
  historicalAverage: "Average",
  personalBest: "Personal best",
  trajectory: "Trend",
  reviewRecoveryRate: "Review recovery",
} as const;

/**
 * The factual reason a comparison is not shown — the server's counts in
 * words, and never a judgment.
 */
export function sufficiencyText(s: Sufficiency): string {
  switch (s.reasonCode) {
    case "insufficient_attempted_review_items":
      return `${s.observed} of ${s.required} Review questions attempted`;
    case "insufficient_questions":
      return `${s.observed} of ${s.required} questions`;
    case "insufficient_compatible_runs":
      return `${s.observed} of ${s.required} questions, across too few runs`;
    case "insufficient_compatible_stage_history":
      return `${s.observed} of ${s.required} earlier matching stages`;
    case "missing_frozen_compatibility":
      return "this run's settings were not recorded, so it cannot be compared";
    default:
      return `${s.observed} of ${s.required} matching runs`;
  }
}

/** A capability or sufficiency reason, for the expansion that explains why
 *  there is no analysis. */
export function insufficientReasonText(reasonCode: string | null): string {
  switch (reasonCode) {
    case "missing_frozen_compatibility":
      return "This run’s settings were not recorded, so it cannot be compared with other runs.";
    case "missing_question_or_ruleset_provenance":
      return "This stage has no comparable record.";
    case "insufficient_compatible_stage_history":
      return "No earlier stage was played under the same rules and content yet.";
    default:
      return "Not enough matching runs to compare yet.";
  }
}

/**
 * Learning signals HUB2 returns, in the words a player reads. The server
 * decides every one of these; `previous_exposure` is context the others
 * carry and is not listed on its own.
 */
export const SIGNAL_LABELS: Readonly<Record<string, string>> = {
  repeated_miss: "Missed again",
  recurring_weakness: "Recurring weakness",
  recovered_weakness: "Recovered",
  first_in_available_history: "First seen in Daily",
};

export const SIGNAL_ORDER = [
  "recurring_weakness",
  "repeated_miss",
  "recovered_weakness",
  "first_in_available_history",
] as const;

export const TRAJECTORY_LABEL = { up: "Up", down: "Down", stable: "Stable" } as const;
