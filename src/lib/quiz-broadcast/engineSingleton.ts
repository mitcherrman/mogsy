import { BroadcastEngine } from "./engine";
import { loadActiveSession } from "./session";

/**
 * Module-level BroadcastEngine singleton.
 *
 * The engine MUST outlive React component remounts: the Studio is an
 * Admin-gated route inside a Layout that can re-render on auth/layout
 * rechecks, and tearing the engine down would wipe playback state.
 *
 * On first access we hydrate the engine from the durable
 * ActiveBroadcastSession (localStorage) so a refresh / alt-tab / remount
 * resumes exactly where we left off.
 */
let _engine: BroadcastEngine | null = null;

export function getBroadcastEngine(): BroadcastEngine {
  if (_engine) return _engine;
  const engine = new BroadcastEngine();
  const session = loadActiveSession();
  if (session) engine.hydrateFromSession(session);
  _engine = engine;
  return engine;
}