/**
 * HUB5 — the one clock every Timmy fixture reads.
 *
 * Nothing under `/dev/lobby-preview` may ask the machine what time it is. A
 * fixture dated from the machine clock renders a different record tomorrow, and one
 * built with local `setHours` renders a different record in another timezone;
 * either way a visual certification made today stops describing the page.
 *
 * So every instant is an offset from ONE fixed anchor, computed in UTC
 * milliseconds and written as a canonical ISO string. Reloading the preview on
 * any day, in any timezone, produces byte-identical fixture state.
 *
 * What still moves is presentation the production components own: a row that
 * says "10d ago" measures the fixed instant against the reader's real clock,
 * exactly as it does for a real account. The facts underneath do not move.
 */

/** HISTORY_ANALYTICS_SPEC §9: the canonical fixture anchor. */
export const FIXTURE_ANCHOR = "2026-09-15T18:00:00.000Z";

const ANCHOR_MS = Date.parse(FIXTURE_ANCHOR);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The instant `daysBefore` whole days before the anchor's UTC date, at
 * `hourUtc:minute` UTC. `fixtureInstant(0)` is the anchor itself.
 */
export function fixtureInstant(daysBefore: number, hourUtc = 18, minute = 0): string {
  if (!Number.isInteger(daysBefore) || daysBefore < 0) {
    throw new Error(`fixtureInstant: daysBefore must be a non-negative integer, got ${daysBefore}`);
  }
  if (!Number.isInteger(hourUtc) || hourUtc < 0 || hourUtc > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error(`fixtureInstant: invalid UTC time ${hourUtc}:${minute}`);
  }
  const anchorMidnight = ANCHOR_MS - (ANCHOR_MS % DAY_MS);
  const ms = anchorMidnight - daysBefore * DAY_MS + hourUtc * HOUR_MS + minute * 60 * 1000;
  if (ms > ANCHOR_MS) {
    throw new Error("fixtureInstant: a fixture cannot be dated after its anchor");
  }
  return new Date(ms).toISOString();
}

/** The UTC calendar date (`YYYY-MM-DD`) of a fixture instant. */
export function fixtureDate(instant: string): string {
  return instant.slice(0, 10);
}
