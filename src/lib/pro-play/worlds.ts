/**
 * Worlds in the Pro Play hub (PW1). Pure, so every rule is tested without a page.
 *
 * WHAT "WORLDS" IS HERE. Upstream's league slug `worlds`, read from the same
 * feeds the hub already draws: `/api/live-esports/upcoming` serves the Worlds
 * 2026 Play-In fixtures as `league: { slug: "worlds", name: "Worlds",
 * region: "INTERNATIONAL" }` (checked against production 2026-10-12), and the
 * backend's tournament registry names the same slug for "World Championship
 * 2026" (`related[].league_slug`, DCGI1). LIVE1 stamps live and recent games
 * with the schedule's league identity, so a Worlds game carries the same slug.
 * Nothing is matched on a team, a name or a guessed id.
 *
 * WHAT THIS DOES NOT DO. It invents no team, matchup, result or time: a
 * fixture whose sides upstream still names "TBD" stays TBD, and a fixture
 * with no parseable start is never auto-featured (it can still be opened).
 */
import type { LiveGameSummary, UpcomingMatch } from "@/lib/live-esports/api";

export const WORLDS_LEAGUE_SLUG = "worlds";

/**
 * How long past its start a fixture may still be auto-featured. The backend
 * serves only matches that start strictly after ITS clock, so a fixture whose
 * start is well in the past is a schedule page older than the match: the
 * match would already be in the live feed, or would have left the schedule.
 * A few minutes' lag between polls is normal; this is the line past which the
 * hub stops trusting it.
 */
export const WORLDS_FIXTURE_GRACE_MS = 30 * 60_000;

type LeagueRef = { slug?: string | null } | null | undefined;

export function isWorldsLeague(league: LeagueRef): boolean {
  return (league?.slug ?? "").trim().toLowerCase() === WORLDS_LEAGUE_SLUG;
}

/** A played or playing game of the Worlds league. The competition block, when
 *  the backend sent one, is the more specific identity; the row's own league
 *  is the fallback an older backend leaves. */
export function isWorldsGame(game: Pick<LiveGameSummary, "league" | "competition">): boolean {
  return isWorldsLeague(game.competition?.league?.slug ? game.competition.league : game.league);
}

export function isWorldsFixture(match: Pick<UpcomingMatch, "league">): boolean {
  return isWorldsLeague(match.league);
}

/** Epoch ms of an ISO instant, or null when it is missing or unparseable. */
export function startMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Worlds fixtures that can lead the hub: soonest first (the feed's own order
 * breaks ties), each with a start that parses and is not stale (see
 * `WORLDS_FIXTURE_GRACE_MS`). TBD sides are kept: a bracket slot with a
 * scheduled time is still the next scheduled Worlds match.
 */
export function worldsFixtures<T extends Pick<UpcomingMatch, "league" | "scheduled_start" | "match_id">>(
  upcoming: readonly T[],
  now: number = Date.now(),
): T[] {
  const dated: { match: T; start: number; index: number }[] = [];
  upcoming.forEach((match, index) => {
    if (!match?.match_id || !isWorldsFixture(match)) return;
    const start = startMs(match.scheduled_start);
    if (start === null || start < now - WORLDS_FIXTURE_GRACE_MS) return;
    dated.push({ match, start, index });
  });
  return dated.sort((x, y) => x.start - y.start || x.index - y.index).map((d) => d.match);
}

/** The next officially scheduled Worlds match, or null when none is known. */
export function nextWorldsFixture<T extends Pick<UpcomingMatch, "league" | "scheduled_start" | "match_id">>(
  upcoming: readonly T[],
  now: number = Date.now(),
): T | null {
  return worldsFixtures(upcoming, now)[0] ?? null;
}

/**
 * The event's year, from the match's OWN start (UTC), or null. Upstream's
 * league name is just "Worlds"; the year is read from the data rather than
 * written into the page, so next year's event is not labelled 2026.
 */
export function worldsYear(startIso: string | null | undefined): number | null {
  const t = startMs(startIso);
  return t === null ? null : new Date(t).getUTCFullYear();
}

/**
 * The competition line of a Worlds match with the year on the league's name:
 * ["Worlds", "Play-Ins"] → ["Worlds 2026", "Play-Ins"]. Left alone when the
 * line already carries a year (a tournament name such as "Worlds 2026"), when
 * the year is unknown, or when the first part is not the bare league name.
 */
export function withWorldsYear(parts: readonly string[], year: number | null): string[] {
  if (year === null || parts.length === 0) return [...parts];
  if (parts.some((p) => /\b(19|20)\d{2}\b/.test(p))) return [...parts];
  if (parts[0].trim().toLowerCase() !== "worlds") return [...parts];
  return [`${parts[0]} ${year}`, ...parts.slice(1)];
}
