// ---------------------------------------------------------------------------
// Which tournament the Pro Play hub features (PW4-B).
//
// One ordered, configured schedule instead of a hardcoded id or scattered
// date checks. Each entry is featured from its `from` calendar day — read in
// the EVENT's own timezone, never the visitor's — until a later entry's day
// arrives. So:
//
// * before 15 Oct 2026 (Los Angeles), DCGI is featured, as the owner approved;
// * from 15 Oct, Worlds is featured, every day of the event, match or not;
// * after Worlds ends (14 Nov) it stays featured as a completed event, an
//   archive, until someone configures a successor here. Nothing ever falls
//   back to an earlier entry (an expired DCGI);
// * the choice is by calendar only. A Worlds schedule that fails to load does
//   not hand the slot back to DCGI: the hub's entry then shows the configured
//   identity and the page explains what it cannot read.
// ---------------------------------------------------------------------------

export interface FeaturedEvent {
  /** Backend tournament registry id (`/api/live-esports/tournament/{id}`). */
  contextId: string;
  /** First featured calendar day ("2026-10-15") in `timeZone`; null = from
   *  the start of the schedule. */
  from: string | null;
  /** The event's last calendar day, in `timeZone`. Afterwards it is an archive. */
  ends: string;
  /** IANA zone whose calendar decides the day (the event's host city). */
  timeZone: string;
  /** Identity the hub can show without a response (failed load). */
  name: string;
  shortName: string;
  leagueSlug: string;
}

/** Ascending by `from`. Add a successor here; never edit dates in components. */
export const FEATURED_EVENTS: readonly FeaturedEvent[] = [
  {
    contextId: "dcgi-2026",
    from: null,
    ends: "2026-10-17",
    timeZone: "Asia/Shanghai",
    name: "Demacia Cup Global Invitational 2026",
    shortName: "DCGI",
    leagueSlug: "demacia_cup",
  },
  {
    contextId: "worlds-2026",
    from: "2026-10-15",
    ends: "2026-11-14",
    // The Play-In opens in Los Angeles; the owner set the switch to that
    // city's calendar day.
    timeZone: "America/Los_Angeles",
    name: "League of Legends World Championship 2026",
    shortName: "Worlds",
    leagueSlug: "worlds",
  },
];

export type FeaturedStatus = "upcoming" | "current" | "archive";

export interface FeaturedChoice {
  event: FeaturedEvent;
  status: FeaturedStatus;
}

/** "2026-10-15": the calendar day of `now` in `timeZone`. */
export function calendarDay(now: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The featured event at `now`: the LAST entry whose `from` day has arrived in
 * its own timezone. The first entry (from: null) is the floor, so there is
 * always one. ISO day strings compare correctly as strings.
 */
export function featuredTournament(now: number, events: readonly FeaturedEvent[] = FEATURED_EVENTS): FeaturedChoice {
  let chosen = events[0];
  for (const e of events) {
    if (e.from === null || calendarDay(now, e.timeZone) >= e.from) chosen = e;
  }
  const today = calendarDay(now, chosen.timeZone);
  const status: FeaturedStatus =
    chosen.from !== null && today < chosen.from ? "upcoming" : today > chosen.ends ? "archive" : "current";
  return { event: chosen, status };
}
