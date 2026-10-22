/**
 * The synchronous `ArenaGateway` seam's real-service twin, kept for the DEV
 * harness's contract tests. It reports itself unavailable and never pretends.
 *
 * The REAL backend is not reached through this interface: it is asynchronous
 * and polled, so the production pages use `api/arenaApi.ts` (the HTTP client),
 * `api/useLiveArenaEvent.ts` (revision polling) and `live/useHttpEventControls`
 * (presses), all rendering the same `EventPage` / `HostPortal` / duel visuals.
 */
import type { ArenaGateway } from "./types";

export const ARENA_UNAVAILABLE_COPY =
  "Tournament Arena events are not open yet. Brackets, custom matches and challenges arrive once the Arena service is live.";

const unavailable = () => ({ available: false, reason: ARENA_UNAVAILABLE_COPY, source: "http" as const });

export const httpArenaGateway: ArenaGateway = {
  availability: unavailable,
  getEvent: () => null,
  subscribe: () => () => undefined,
  listEvents: () => [],
  friends: () => [],
  createEvent: () => { throw new Error("Arena service unavailable"); },
  lock: () => null,
  start: () => null,
  play: () => null,
  stepResult: () => null,
  commitGame: () => null,
  walkover: () => null,
  reset: () => undefined,
};
