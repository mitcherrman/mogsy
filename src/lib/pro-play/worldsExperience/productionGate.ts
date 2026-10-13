// ---------------------------------------------------------------------------
// UX3A — the switch that lets the Worlds experience merge without shipping it.
//
// The published Worlds page (`/lol/pro-play/tournament/worlds-2026`, PW4-B's
// `TournamentV2`) stays what every build renders unless
// `VITE_WORLDS_EXPERIENCE_ENABLED` is an explicit true value. Same contract as
// SIM2's `VITE_TEAM_SIM_ENABLED` (`combat-lab/team-sim/featureGate.ts`):
//
// * FAIL-CLOSED. Only "1" / "true" / "yes" / "on" enable. Unset, empty,
//   "false" or a typo leaves the published page in place, so a build that
//   forgot the variable can never publish the new experience.
// * BUILD-TIME. Vite inlines the value; no URL parameter, storage key or
//   backend answer can change which renderer a visitor gets.
// * ONE CONTEXT. Only `worlds-2026` is affected. DCGI and every other
//   tournament context render exactly as before with the flag on or off.
//
// Not a security boundary: it decides which presentation of public data is
// offered. With it off, the nested screen paths are not registered at all and
// 404 like any unknown route.
// ---------------------------------------------------------------------------

import { proPlayTournamentUrl } from "@/lib/pro-play/routes";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * Read fresh rather than at module load, so tests can drive both states with
 * `vi.stubEnv`. The optional chain matches the team-sim gate: the Remotion
 * export bundle has no `import.meta.env`.
 */
export function isWorldsExperienceEnabled(): boolean {
  const raw = import.meta.env?.VITE_WORLDS_EXPERIENCE_ENABLED as string | undefined;
  return TRUE_VALUES.has(String(raw ?? "").trim().toLowerCase());
}

/** The one tournament context the experience renders. */
export const WORLDS_EXPERIENCE_CONTEXT_ID = "worlds-2026";

/** The experience's base: the published canonical Worlds URL, unchanged. */
export const WORLDS_EXPERIENCE_BASE = proPlayTournamentUrl(WORLDS_EXPERIENCE_CONTEXT_ID);

/**
 * The route registered while the flag is on. A static segment outranks
 * `PRO_PLAY_TOURNAMENT_ROUTE`'s `:contextId`, so this one route owns the bare
 * Worlds URL AND its screens (one element: moving between screens never
 * remounts the page), while every other context keeps the published route.
 */
export const WORLDS_EXPERIENCE_ROUTE = `${WORLDS_EXPERIENCE_BASE}/*`;

/** Whether `pathname` is the Worlds URL or one of its screens. */
export function isWorldsExperiencePath(pathname: string): boolean {
  return pathname === WORLDS_EXPERIENCE_BASE || pathname.startsWith(`${WORLDS_EXPERIENCE_BASE}/`);
}

/** Whether this tournament context renders the experience in this build. */
export function usesWorldsExperience(contextId: string | undefined): boolean {
  return isWorldsExperienceEnabled() && contextId === WORLDS_EXPERIENCE_CONTEXT_ID;
}

/** Layout: the experience is a viewport-sized frame (full-bleed) only when it is on. */
export function isWorldsExperienceSurface(pathname: string): boolean {
  return isWorldsExperienceEnabled() && isWorldsExperiencePath(pathname);
}
