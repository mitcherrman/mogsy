/**
 * Committed authoritative fixtures the prototype can stage. Both are real
 * captures from `/api/combat-lab/team-simulate/v1` (see
 * `team-sim/__fixtures__/index.ts` for provenance). No network, no credits,
 * no auth: the page never calls the backend.
 */
import { REAL_2V2_CALCULATION, REAL_TRACE_LEVELS } from "@/lib/combat-lab/team-sim/__fixtures__";
import type { TeamSimulationResponse } from "@/lib/combat-lab/team-sim/contract";

export type TheaterScene = {
  id: string;
  title: string;
  subtitle: string;
  fixtureFile: string;
  response: TeamSimulationResponse;
  /** Beat index to open on (pinned, paused); null = before the first beat. */
  initialBeatIndex: number | null;
};

function beatIndexOf(response: TeamSimulationResponse, actorId: string, actionId: string): number | null {
  const rows = response.events.filter(
    (e) => e.source === "scheduler" && (e.type === "action_executed" || e.type === "action_failed")
  );
  const idx = rows.findIndex((e) => e.actor_id === actorId && e.action_id === actionId);
  return idx >= 0 ? idx : null;
}

export const THEATER_SCENES: TheaterScene[] = [
  {
    id: "ashe-garen",
    title: "Ashe vs Garen",
    subtitle: "1v1 · 7 basic attacks · full trace · ends in a kill",
    fixtureFile: "sim_1v1_trace_full.json",
    response: REAL_TRACE_LEVELS.full,
    initialBeatIndex: null,
  },
  {
    id: "lux-q",
    title: "Lux Q · formula",
    subtitle: "2v2 · calculation trace · opens on Lux's Light Binding with formula bindings",
    fixtureFile: "sim_2v2_calculation.json",
    response: REAL_2V2_CALCULATION,
    initialBeatIndex: beatIndexOf(REAL_2V2_CALCULATION, "A2", "Q"),
  },
];

export function findScene(id: string | null): TheaterScene {
  return THEATER_SCENES.find((s) => s.id === id) ?? THEATER_SCENES[0];
}
