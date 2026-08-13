/**
 * SIM2 Phase 5A: the switch that lets this code merge without shipping the
 * feature.
 *
 * The user-facing `/combat-lab/team-sim` route and the Combat Lab entry point
 * that leads to it exist only when `VITE_TEAM_SIM_ENABLED` is an explicit true
 * value. Everything else about the feature is unconditional: the internal
 * `/dev/combat-lab/team-sim` route, the client, the catalog, the recovery
 * panels and every test keep working exactly as they did in Phase 4B–4E.
 *
 * Fail-closed, and why that matters more here than usual
 * ──────────────────────────────────────────────────────
 * Only the listed true values enable, matching the backend's
 * `TEAM_SIM_ENABLED` (services/team_simulation_readiness.py) so the two flags
 * cannot disagree about what "on" means. Anything else — unset, empty,
 * "false", a typo — is off. A flag that defaults to ON would mean a build
 * pipeline that simply forgot to define it would publish a billable surface,
 * which is precisely the outcome a controlled promotion exists to prevent.
 *
 * This flag is NOT a security boundary
 * ────────────────────────────────────
 * It is a build-time constant in a public bundle, so anyone can read it and
 * anyone can navigate to the route directly — the dev route is not secret
 * either. That is fine, and it is the reason the backend has its own,
 * independent gate: the money is protected by `TEAM_SIM_ENABLED` on the
 * server, which no browser can influence. This flag decides what is OFFERED,
 * not what is ALLOWED. Turning it on with the backend flag off yields a route
 * that renders and then refuses at submit with a proven-refusal 503 — safe,
 * just pointless — and turning it off with the backend flag on leaves a
 * working feature nobody is shown.
 */

/** The same set the backend's `_TRUE_VALUES` accepts. */
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * Read fresh rather than captured at module load, so a test can drive both
 * branches with `vi.stubEnv` without module-registry surgery. Vite still
 * statically replaces `import.meta.env.VITE_TEAM_SIM_ENABLED` at build time,
 * so a production bundle carries the literal and dead-code-eliminates the
 * branch exactly as it would for a constant.
 *
 * The optional chain is not defensive noise: the Remotion export bundle has no
 * `import.meta.env` at all (see src/lib/quiz/api.ts), and reading through it
 * unguarded throws there.
 */
export function isTeamSimPublicRouteEnabled(): boolean {
  const raw = import.meta.env?.VITE_TEAM_SIM_ENABLED as string | undefined;
  return TRUE_VALUES.has(String(raw ?? "").trim().toLowerCase());
}

/** The promoted, user-facing path. */
export const TEAM_SIM_ROUTE = "/combat-lab/team-sim";

/**
 * The internal path, kept for this phase. Same component, same module — an
 * alias, not a copy — so the two surfaces cannot drift apart.
 */
export const TEAM_SIM_DEV_ROUTE = "/dev/combat-lab/team-sim";

/** Where the feature's own back-link and its error fallback return to. */
export const COMBAT_LAB_ROUTE = "/combat-lab";
