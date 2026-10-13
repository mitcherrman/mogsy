/**
 * Data sources for the Worlds experience prototype (UX1, development only).
 *
 * `live` reads production through the page's own hook (`useTournament`);
 * `snapshot` is the REAL production body captured 2026-10-13 (PW4-B). Every
 * other entry is a SIMULATED phase built by `worldsScenarios.ts` — invented
 * results written onto the real structure — and is always shown with the
 * "Simulated" marker. None of this module is reachable from production: the
 * route that imports it is registered only when `import.meta.env.DEV`.
 */
import type { TournamentResponseV2 } from "@/lib/pro-play/tournamentApi";
import {
  WORLDS_PRE,
  betweenPlayInAndSwiss,
  betweenSwissAndKnockout,
  clone,
  knockoutMid,
  partialSchedule,
  playInDay1,
  staleSchedule,
  standingsUnavailable,
  swissThrough,
  unknownPhase,
  worldsComplete,
} from "@/lib/pro-play/__fixtures__/worldsScenarios";

export interface Scenario {
  id: string;
  label: string;
  /** Real data (production, or its captured body) vs invented results. */
  kind: "live" | "real" | "simulated";
  build?: () => TournamentResponseV2;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: "live", label: "Live · production API", kind: "live" },
  { id: "snapshot", label: "Real snapshot · 13 Oct (pre-event)", kind: "real", build: () => clone(WORLDS_PRE) },
  { id: "play-in-live", label: "Play-In day 1 · FUR v MVK live", kind: "simulated", build: playInDay1 },
  { id: "play-in-done", label: "Play-In complete · Swiss drawn", kind: "simulated", build: betweenPlayInAndSwiss },
  { id: "swiss-r3", label: "Swiss · mid Round 3", kind: "simulated", build: () => swissThrough(2.5) },
  { id: "swiss-r5", label: "Swiss · mid Round 5", kind: "simulated", build: () => swissThrough(4.5) },
  { id: "knockout-drawn", label: "Knockouts drawn", kind: "simulated", build: betweenSwissAndKnockout },
  { id: "knockout-live", label: "Knockouts · QF3 live", kind: "simulated", build: knockoutMid },
  { id: "complete", label: "Worlds complete", kind: "simulated", build: worldsComplete },
  { id: "partial", label: "Partial schedule (40/46)", kind: "simulated", build: partialSchedule },
  { id: "no-standings", label: "Standings unavailable", kind: "simulated", build: () => standingsUnavailable() },
  { id: "stale", label: "Stale copy", kind: "simulated", build: () => staleSchedule() },
  { id: "unknown", label: "Schedule unavailable", kind: "simulated", build: unknownPhase },
];

export const DEFAULT_SCENARIO = "live";

export function scenarioById(id: string | null) {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS.find((s) => s.id === DEFAULT_SCENARIO)!;
}

/**
 * A believable clock for a simulated phase: 25 minutes into its first live
 * match, else three hours before its next match, else the event's last day.
 */
export function scenarioClock(d: TournamentResponseV2): number {
  const live = d.state.matches.filter((m) => m.state === "live").map((m) => Date.parse(m.scheduled_start)).sort((a, b) => a - b)[0];
  if (Number.isFinite(live)) return live + 25 * 60_000;
  const next = d.state.matches.find((m) => m.match_id === d.state.next_match_id);
  if (next) return Date.parse(next.scheduled_start) - 3 * 3_600_000;
  return Date.parse(`${d.context.ends}T23:00:00Z`);
}
