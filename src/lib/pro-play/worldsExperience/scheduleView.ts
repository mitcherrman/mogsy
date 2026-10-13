// ---------------------------------------------------------------------------
// The Schedule workspace's derivations (UX2): the official fixtures by the
// viewer's local day.
//
// ONLY WHAT IS SERVED. Days come from `state.matches` (which may be partial:
// see `coverage`); a day with no served fixture does not exist here, and a
// gap between match days is a gap, never filled in. A match's state is the
// backend's `state` ("upcoming" / "live" / "completed"); a missing result is
// never read as an upcoming one or vice versa.
//
// LOCAL DAYS. Grouping uses `localDayKey` (the viewer's timezone unless one is
// given), so a 23:00Z match is a different day in Los Angeles and in Seoul.
// ---------------------------------------------------------------------------

import type { TournamentMatchV2, TournamentStateV2 } from "@/lib/pro-play/tournamentApi";
import { localDayKey } from "@/lib/pro-play/tournamentView";

export interface ScheduleDay {
  /** `YYYY-MM-DD` in the viewer's (or the given) timezone. */
  day: string;
  matches: TournamentMatchV2[];
  /** Stage keys played that day, in first-play order. */
  stages: string[];
  live: number;
  completed: number;
}

const startOf = (m: Pick<TournamentMatchV2, "scheduled_start">) => {
  const t = Date.parse(m.scheduled_start);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
};

/** The served fixtures of one stage (or all), by local day, each day in start order. */
export function scheduleDays(state: Pick<TournamentStateV2, "matches">, filterKey: string | null, timeZone?: string): ScheduleDay[] {
  const byDay = new Map<string, TournamentMatchV2[]>();
  for (const m of state.matches) {
    if (filterKey && m.stage !== filterKey) continue;
    const day = localDayKey(m.scheduled_start, timeZone);
    if (!day) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), m]);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, ms]) => {
      const matches = [...ms].sort((a, b) => startOf(a) - startOf(b));
      return {
        day,
        matches,
        stages: [...new Set(matches.map((m) => m.stage).filter((s): s is string => Boolean(s)))],
        live: matches.filter((m) => m.state === "live").length,
        completed: matches.filter((m) => m.state === "completed").length,
      };
    });
}

/**
 * The day the board opens on: the one asked for (when it has fixtures), else
 * a day with live play, else today, else the next day with a fixture still
 * ahead, else the last day. Null when nothing is scheduled.
 */
export function pickDay(days: readonly ScheduleDay[], requested: string | null, now: number, timeZone?: string): string | null {
  if (!days.length) return null;
  if (requested && days.some((d) => d.day === requested)) return requested;
  const live = days.find((d) => d.live > 0);
  if (live) return live.day;
  const today = localDayKey(new Date(now).toISOString(), timeZone);
  if (today && days.some((d) => d.day === today)) return today;
  const ahead = days.find((d) => today !== null && d.day > today);
  return (ahead ?? days[days.length - 1]).day;
}

/** Whole calendar days between two day keys (b after a): 1 for consecutive days. */
export function daysBetween(a: string, b: string) {
  const ms = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/** The local day a match is played on. */
export const matchDay = (m: Pick<TournamentMatchV2, "scheduled_start">, timeZone?: string) => localDayKey(m.scheduled_start, timeZone);

/** Counts for the stage filter: every stage with a served fixture, plus all. */
export function filterCounts(state: Pick<TournamentStateV2, "matches">, stageKeys: readonly string[]) {
  return [
    { key: null as string | null, count: state.matches.length },
    ...stageKeys.map((k) => ({ key: k as string | null, count: state.matches.filter((m) => m.stage === k).length })).filter((o) => o.count > 0),
  ];
}
