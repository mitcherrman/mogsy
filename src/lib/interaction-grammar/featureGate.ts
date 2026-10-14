/**
 * MIG1.1 — the Interaction Lab exists only in DEVELOPMENT builds.
 *
 * Copies the COMBAT1 pattern (`combat-lab/team-sim/featureGate.ts`): the gate
 * is `import.meta.env.DEV`, which Vite replaces with the literal `false` in any
 * production build. App.tsx gates BOTH the lazy import and the `<Route>` on it,
 * so in production the path is not registered (it 404s like any unknown path)
 * and the lab's chunk — fixtures included — is never emitted.
 *
 * Not a security boundary; nothing behind the Lab is private. It is a
 * route-topology decision: a prototype must not ship.
 *
 * The optional chain matches the team-sim gate: the Remotion export bundle has
 * no `import.meta.env`, and reading through it unguarded throws there.
 */
export function isInteractionLabEnabled(): boolean {
  return import.meta.env?.DEV === true;
}

export const INTERACTION_LAB_ROUTE = "/dev/interaction-lab";
