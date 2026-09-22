// ---------------------------------------------------------------------------
// FUNNEL1C — the one date-range control for Admin › Analytics.
//
// URL-backed (?range=<preset>) so every Analytics view is linkable. One
// definition of each window, used by every section, so no two numbers on the
// page can disagree about what "7 days" means.
//
// Boundaries are UTC. `received_at` is the database clock (§14.3: group by
// this one), and the database clock is UTC; a local-midnight "Today" would
// silently move with whoever happens to be looking.
// ---------------------------------------------------------------------------

export const RANGE_PRESETS = ["today", "7d", "30d", "all"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const DEFAULT_RANGE: RangePreset = "7d";

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today (UTC)",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** A half-open window [start, end). `start === null` means unbounded. */
export interface AnalyticsRange {
  preset: RangePreset;
  start: number | null;
  end: number;
}

export function parseRangePreset(value: string | null | undefined): RangePreset {
  return (RANGE_PRESETS as readonly string[]).includes(value ?? "")
    ? (value as RangePreset)
    : DEFAULT_RANGE;
}

export function resolveRange(preset: RangePreset, now: number): AnalyticsRange {
  switch (preset) {
    case "today": {
      const d = new Date(now);
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      return { preset, start, end: now + 1 };
    }
    case "7d":
      return { preset, start: now - 7 * DAY_MS, end: now + 1 };
    case "30d":
      return { preset, start: now - 30 * DAY_MS, end: now + 1 };
    case "all":
      return { preset, start: null, end: now + 1 };
  }
}

export function inRange(ts: number, range: AnalyticsRange): boolean {
  return (range.start === null || ts >= range.start) && ts < range.end;
}

export { DAY_MS };
