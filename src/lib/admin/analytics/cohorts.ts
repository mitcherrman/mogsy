// ---------------------------------------------------------------------------
// ADMIN RETENTION V2 — cohort retention, two lenses that are never combined.
//
// BROWSER lens: the unit is a `visitor_id` (a localStorage id, not a person).
//   Anchor = first seen (the same `firstSeenByVisitor` as computeRetention).
//   Return = a browser SESSION STARTING in the window.
//
// ACCOUNT lens: the unit is a registered `user_id`.
//   Anchor = the account's `signup_completed` browser event (one per account,
//   deduped at the emitter). Accounts created before that event existed are
//   in no cohort — they are never back-dated from other rows.
//   Return = ANY event carrying that user_id with is_guest = false, browser or
//   Railway, received in the window.
//
// No identity stitching in either direction: an account is never mapped to the
// browsers it used, and browsers are never merged by account. The two lenses
// have different units and different denominators, so nothing here sums them.
//
// Windows are rolling from each unit's own anchor and half-open. A unit whose
// window has not fully elapsed is `tooRecent`, never "not retained". D1 and D7
// are the existing definitions, unchanged (a test pins parity with
// computeRetention).
//
// Cohorts are UTC days or UTC weeks (Monday start) of the anchor.
// ---------------------------------------------------------------------------

import {
  firstSeenByVisitor,
  indexSessions,
  sessionsByVisitor,
  type AnalyticsDataset,
  type RetentionRate,
} from "./metrics";
import { DAY_MS } from "./range";

export type RetentionLens = "browser" | "account";
export type CohortGrain = "week" | "day";
export type RetentionWindowId = "d0" | "d1" | "d7" | "w1" | "w2" | "w3" | "w4";

export interface RetentionWindow {
  id: RetentionWindowId;
  label: string;
  /** Offsets from the anchor, half-open [from, to). */
  from: number;
  to: number;
  definition: string;
}

const WEEK_MS = 7 * DAY_MS;

export const RETENTION_WINDOWS: readonly RetentionWindow[] = [
  { id: "d0", label: "D0", from: 0, to: DAY_MS,
    definition: "Same-day repeat: a second browser session starting within 24h of first seen. Browser lens only." },
  { id: "d1", label: "D1", from: DAY_MS, to: 2 * DAY_MS, definition: "Returned 24–48h after the anchor." },
  { id: "d7", label: "D7", from: 7 * DAY_MS, to: 8 * DAY_MS, definition: "Returned 7–8 days after the anchor." },
  { id: "w1", label: "W1", from: WEEK_MS, to: 2 * WEEK_MS, definition: "Returned on days 7–13 after the anchor." },
  { id: "w2", label: "W2", from: 2 * WEEK_MS, to: 3 * WEEK_MS, definition: "Returned on days 14–20 after the anchor." },
  { id: "w3", label: "W3", from: 3 * WEEK_MS, to: 4 * WEEK_MS, definition: "Returned on days 21–27 after the anchor." },
  { id: "w4", label: "W4", from: 4 * WEEK_MS, to: 5 * WEEK_MS, definition: "Returned on days 28–34 after the anchor." },
];

/** Weekly curve points, after the implicit W0 = 100%. */
export const WEEKLY_WINDOWS: readonly RetentionWindowId[] = ["w1", "w2", "w3", "w4"];

/**
 * An account has no "second session" of its own (sessions belong to browsers,
 * and joining them would be the stitching this module refuses), so D0 is a
 * browser-only measure.
 */
export function windowsForLens(lens: RetentionLens): readonly RetentionWindow[] {
  return lens === "browser" ? RETENTION_WINDOWS : RETENTION_WINDOWS.filter((w) => w.id !== "d0");
}

export const LENS_LABELS: Record<RetentionLens, string> = {
  browser: "Browsers",
  account: "Registered accounts",
};

export const LENS_DEFINITIONS: Record<RetentionLens, string> = {
  browser:
    "Unit: a browser id. Cohort: first seen. Return: a new browser session started in the window. Clearing storage or a second device is a new browser, so this is a floor.",
  account:
    "Unit: a registered account. Cohort: its signup_completed event. Return: any signed-in event (browser or server) in the window, on any device. Accounts created before signup tracking are in no cohort.",
};

export interface CohortRow {
  /** UTC date (YYYY-MM-DD) the cohort starts on. */
  key: string;
  start: number;
  size: number;
  /** Absent windows are not applicable to the lens. */
  cells: Partial<Record<RetentionWindowId, RetentionRate>>;
}

export interface CohortReport {
  lens: RetentionLens;
  grain: CohortGrain;
  /** Newest cohort first. */
  rows: CohortRow[];
  /** Every cohort in the report, summed per window: eligible-weighted. */
  pooled: Partial<Record<RetentionWindowId, RetentionRate>>;
  units: number;
}

/** The bounds of a cohort report: anchors in [start, end). */
export interface CohortWindow {
  start: number | null;
  end: number;
}

export function utcDayStart(t: number): number {
  return Math.floor(t / DAY_MS) * DAY_MS;
}

/** Monday 00:00 UTC of the week containing t. */
export function utcWeekStart(t: number): number {
  const day = utcDayStart(t);
  const dow = new Date(day).getUTCDay(); // 0 = Sunday
  return day - ((dow + 6) % 7) * DAY_MS;
}

export const COHORT_LOOKBACK_WEEKS = 8;
export const DAY_COHORTS_SHOWN = 28;

/** Where the panel's read starts: the first day of the oldest weekly cohort. */
export function cohortLookbackStart(now: number, weeks = COHORT_LOOKBACK_WEEKS): number {
  return utcWeekStart(now) - (weeks - 1) * WEEK_MS;
}

/** The cohort window for a grain: 8 UTC weeks, or the latest 28 UTC days. */
export function cohortWindow(grain: CohortGrain, now: number): CohortWindow {
  return {
    start: grain === "week" ? cohortLookbackStart(now) : utcDayStart(now) - (DAY_COHORTS_SHOWN - 1) * DAY_MS,
    end: now + 1,
  };
}

const within = (t: number, w: CohortWindow) => (w.start === null || t >= w.start) && t < w.end;

/** Anchor and return instants for one unit. */
interface Unit {
  anchor: number;
  /** Sorted ascending. */
  returns: number[];
}

function browserUnits(ds: AnalyticsDataset): Map<string, Unit> {
  const sessions = indexSessions(ds);
  const byVisitor = sessionsByVisitor(sessions);
  const out = new Map<string, Unit>();
  for (const [v, anchor] of firstSeenByVisitor(ds, sessions)) {
    out.set(v, { anchor, returns: (byVisitor.get(v) ?? []).map((s) => s.startedAt) });
  }
  return out;
}

function accountUnits(ds: AnalyticsDataset): Map<string, Unit> {
  const anchors = new Map<string, number>();
  for (const e of ds.events) {
    if (e.source_system !== "web" || e.event_name !== "signup_completed" || !e.user_id) continue;
    const t = Date.parse(e.received_at);
    const cur = anchors.get(e.user_id);
    if (cur === undefined || t < cur) anchors.set(e.user_id, t);
  }
  const activity = new Map<string, number[]>();
  for (const e of ds.events) {
    if (!e.user_id || e.is_guest !== false || !anchors.has(e.user_id)) continue;
    const list = activity.get(e.user_id) ?? [];
    list.push(Date.parse(e.received_at));
    activity.set(e.user_id, list);
  }
  const out = new Map<string, Unit>();
  for (const [u, anchor] of anchors) {
    out.set(u, { anchor, returns: (activity.get(u) ?? []).sort((a, b) => a - b) });
  }
  return out;
}

function retainedIn(lens: RetentionLens, w: RetentionWindow, unit: Unit): boolean {
  const lo = unit.anchor + w.from;
  const hi = unit.anchor + w.to;
  if (lens === "browser" && w.id === "d0") {
    // The anchor session is the first; a repeat is any second start in day 0.
    return unit.returns.filter((t) => t >= lo && t < hi).length >= 2;
  }
  return unit.returns.some((t) => t >= lo && t < hi);
}

const emptyRate = (): RetentionRate => ({ eligible: 0, retained: 0, tooRecent: 0 });

/**
 * Cohort retention for one lens. The dataset is whatever the caller filtered
 * (traffic population); this function never re-includes excluded traffic.
 */
export function computeCohortRetention(
  ds: AnalyticsDataset,
  bounds: CohortWindow,
  now: number,
  lens: RetentionLens,
  grain: CohortGrain,
): CohortReport {
  const units = lens === "browser" ? browserUnits(ds) : accountUnits(ds);
  const windows = windowsForLens(lens);
  const bucket = grain === "week" ? utcWeekStart : utcDayStart;

  const rows = new Map<number, CohortRow>();
  const pooled: Partial<Record<RetentionWindowId, RetentionRate>> = {};
  for (const w of windows) pooled[w.id] = emptyRate();
  let count = 0;

  for (const unit of units.values()) {
    if (!within(unit.anchor, bounds)) continue;
    count += 1;
    const start = bucket(unit.anchor);
    let row = rows.get(start);
    if (!row) {
      row = { key: new Date(start).toISOString().slice(0, 10), start, size: 0, cells: {} };
      for (const w of windows) row.cells[w.id] = emptyRate();
      rows.set(start, row);
    }
    row.size += 1;
    for (const w of windows) {
      const cell = row.cells[w.id]!;
      const total = pooled[w.id]!;
      if (unit.anchor + w.to > now) {
        cell.tooRecent += 1;
        total.tooRecent += 1;
        continue;
      }
      cell.eligible += 1;
      total.eligible += 1;
      if (retainedIn(lens, w, unit)) {
        cell.retained += 1;
        total.retained += 1;
      }
    }
  }

  return {
    lens,
    grain,
    rows: [...rows.values()].sort((a, b) => b.start - a.start),
    pooled,
    units: count,
  };
}
